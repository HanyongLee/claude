/**
 * Qa.gs — 매뉴얼 질의응답 (4단계)
 * 1) 검색 기반 답변(기본): 등록된 상황 코드·절차·근거 문서를 검색해 인용과 함께 답한다. 근거가 없으면 "확인 필요".
 * 2) AI 답변(선택): 설정 AI_ENABLED=예 이고 조직 승인(AI_ORG_APPROVED=예)이 있을 때만 호출한다.
 *    AI 호출부는 aiAdapter_ 하나로 모아 두었고, 구성되지 않았거나 실패하면 검색 기반 답변만 제공한다.
 *    중도매인 식별정보(코드·상호·대표자·연락처·보증인)는 어떤 범위 설정에서도 AI에 보내지 않는다.
 */

function tokenize_(q) {
  return String(q || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (t) { return t.length >= 2; })
    .filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 12);
}

/**
 * 검색 기반 답변. caseId 가 있으면 그 관리 건의 확인된 상황을 1번 항목에 넣고 상황 코드 매칭 결과를 우선한다.
 * 답변 순서: 확인된 상황 → 추가 확인사항 → 적용 가능한 절차 → 근거 → 필요 서식 → 다음 할 일
 */
function answerQuestion_(user, query, caseId) {
  var q = String(query || '').trim();
  if (!q) throw new Error('질문을 입력하세요.');
  var tokens = tokenize_(q), today = todayStr_(), st = readStatus_();
  var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { if (!d.is_deleted) docs[d.doc_id] = d; });
  var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); });
  var validVer = {}; vers.forEach(function (v) { validVer[v.doc_id + '|' + v.version] = v; });
  var situations = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; });
  var sitLabel = {}; situations.forEach(function (x) { sitLabel[x.situation_code] = x.label; });

  // 절차 단계 점수: 질의 토큰이 절차 내용·확인사항·조항·상황명·문서명에 몇 개 들어 있는가
  var scored = readTable_('DB_MASTER', 'M_PROCEDURE').filter(function (p) { return !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version]; }).map(function (p) {
    var hay = [p.content, p.checks, p.article, sitLabel[p.situation_code] || '', (docs[p.doc_id] || {}).doc_name || ''].join(' ').toLowerCase();
    var hit = tokens.filter(function (t) { return hay.indexOf(t) >= 0; });
    return { p: p, score: hit.length, hit: hit };
  }).filter(function (x) { return x.score > 0; });
  // 신호 이름으로도 상황을 찾는다 (예: "연체" → S03 연결 상황)
  Object.keys(SIGNAL_RULES).forEach(function (r) {
    var label = SIGNAL_RULES[r].label.toLowerCase();
    if (tokens.some(function (t) { return label.indexOf(t) >= 0; })) {
      situations.forEach(function (sit) {
        var cond = {}; try { cond = JSON.parse(sit.condition_json || '{}'); } catch (e) { return; }
        if ((cond.signals || []).indexOf(r) >= 0) readTable_('DB_MASTER', 'M_PROCEDURE').forEach(function (p) {
          if (p.situation_code === sit.situation_code && !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version] && !scored.some(function (x) { return x.p.proc_step_id === p.proc_step_id; }))
            scored.push({ p: p, score: 1, hit: ['신호:' + r] });
        });
      });
    }
  });
  var bySit = {};
  scored.forEach(function (x) { (bySit[x.p.situation_code] = bySit[x.p.situation_code] || { situation_code: x.p.situation_code, label: sitLabel[x.p.situation_code] || x.p.situation_code, score: 0 }).score += x.score; });
  // 가장 잘 맞는 상황 대비 30% 미만 점수는 우연한 단어 일치로 보고 제외한다
  var ranked = Object.keys(bySit).map(function (k) { return bySit[k]; }).sort(function (a, b) { return b.score - a.score; });
  var top = ranked.length ? ranked[0].score : 0;
  var sitList = ranked.filter(function (x) { return x.score >= top * 0.3; }).slice(0, 3);
  var procedures = sitList.map(function (s) { var p = proceduresFor_(s.situation_code, today); p.label = s.label; p.matched = s.score; return p; });

  var facts = [], further = [], next = [];
  if (caseId) {
    var c = findCase_(caseId); requireWsAccess_(user, c.wholesaler_id);
    var det = caseDetail_(user, caseId);
    facts = det.guide.facts; further = det.guide.furtherChecks; next = det.guide.nextSteps;
    // 관리 건에 매칭된 상황을 앞에 둔다
    det.guide.procedures.forEach(function (p) { if (!procedures.some(function (x) { return x.situation_code === p.situation_code; })) procedures.unshift(p); });
  }
  var hasBasis = procedures.some(function (p) { return p.status === '정상' || p.status === '충돌' ; });
  var conflicts = procedures.filter(function (p) { return p.status === '충돌'; });
  var forms = [];
  procedures.forEach(function (p) { p.steps.forEach(function (s) { s.forms.forEach(function (f) { if (!forms.some(function (x) { return x.form_doc_id === f.form_doc_id; })) forms.push(f); }); }); });
  if (!next.length) next.push(hasBasis ? '해당 절차를 관리 건에서 조치로 등록하고 필요 서식 작성본을 만드세요.' : '문서 담당자에게 근거 문서·절차 등록을 요청하세요.');

  var answer = {
    query: q, tokens: tokens,
    basis: { data_base_date: st.latest_base_date || '', data_status: st.data_status || '', manual_versions: vers.map(function (v) { return (docs[v.doc_id] || {}).doc_name + ' ' + v.version + ' (시행 ' + v.effective_from + ')'; }) },
    facts: facts, furtherChecks: further, procedures: procedures, forms: forms, nextSteps: next,
    status: hasBasis ? (conflicts.length ? '충돌' : '정상') : '확인 필요',
    message: hasBasis ? (conflicts.length ? '문서 간 충돌이 있습니다. 두 근거를 모두 표시했으며 우선순위를 정하지 않았습니다.' : '') : '등록된 매뉴얼에서 이 질문에 해당하는 절차를 찾지 못했습니다. 절차를 임의로 만들지 않습니다. "확인 필요"로 기록하세요.',
    ai: aiAnswer_(user, q, procedures)
  };
  logAccess_(user.user_id, 'manual.query', caseId || '', '허용', q.substring(0, 80) + ' → ' + answer.status + (answer.ai.used ? ' +AI' : ''));
  return answer;
}

/**
 * AI 답변부. 사용 조건을 모두 통과해야 호출한다. 실패해도 검색 기반 답변에는 영향이 없다.
 * @return { used, status, reason, text, sources }
 */
function aiAnswer_(user, query, procedures) {
  var s = readSettings_();
  if (s.AI_ENABLED !== '예') return { used: false, status: '미사용', reason: 'AI 사용 설정 꺼짐(AI_ENABLED)' };
  if (s.AI_ORG_APPROVED !== '예') return { used: false, status: '미사용', reason: '조직 승인 미확인(AI_ORG_APPROVED)' };
  // 제공 범위: 매뉴얼 본문(등록된 절차 텍스트)만. 익명 수치 범위라도 중도매인 식별정보는 제외한다.
  var context = procedures.filter(function (p) { return p.steps.length; }).map(function (p) {
    return '[' + p.label + '] ' + p.steps.map(function (st) { return st.step_no + '. ' + st.content + ' (근거: ' + st.doc_name + ' ' + st.version + ' ' + st.article + ')'; }).join(' ');
  }).join('\n');
  if (!context) return { used: false, status: '미사용', reason: '인용할 등록 문서가 없어 AI에 질의하지 않음(근거 없는 답변 방지)' };
  try {
    var r = aiAdapter_({ query: query, context: context, scope: s.AI_DATA_SCOPE || '매뉴얼본문만' });
    logAccess_(user.user_id, 'ai.query', '', r.status === '정상' ? '허용' : '실패', (s.AI_PROVIDER_NOTE || '') + ' / ' + r.status);
    return { used: r.status === '정상', status: r.status, reason: r.reason || '', text: r.text || '', sources: r.sources || [],
      note: 'AI 답변은 등록 문서 범위에서 생성된 참고 설명입니다. 업무 판단 근거로 단독 사용하지 마세요.' };
  } catch (e) {
    return { used: false, status: '실패', reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * AI 서비스 호출 자리. 서비스가 정해지면 이 함수만 구현한다(UrlFetchApp + 조직 승인 키).
 * 규칙: context 밖의 내용을 답하지 않도록 지시하고, 답변에 인용(문서·버전·조항)을 요구한다.
 * 현재는 구성되지 않았음을 돌려준다.
 */
function aiAdapter_(req) {
  var endpoint = prop_('AI_ENDPOINT'), key = prop_('AI_API_KEY');
  if (!endpoint || !key) return { status: '미구성', reason: 'AI 서비스 주소·키가 스크립트 속성(AI_ENDPOINT, AI_API_KEY)에 없음' };
  var payload = {
    instruction: '아래 [문서] 범위 안에서만 답하라. 문서에 없는 절차는 "확인 필요"라고 답하라. 각 문장 끝에 (문서명 버전 조항)을 인용하라. 중도매인 식별정보는 요청에 포함되지 않았다.',
    documents: req.context, question: req.query, scope: req.scope
  };
  var res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { status: '실패', reason: 'HTTP ' + res.getResponseCode() };
  var body = JSON.parse(res.getContentText());
  return { status: '정상', text: body.text || body.answer || '', sources: body.sources || [] };
}
