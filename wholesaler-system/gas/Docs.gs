/**
 * Docs.gs — 매뉴얼·서식 연결과 상황별 절차 안내, 서식 작성본 생성
 * 원칙: 등록된 문서에 근거가 없으면 절차를 만들지 않고 '확인 필요'로 표시한다.
 *       같은 상황에 서로 다른 문서의 절차가 있으면 '충돌'로 표시하고 둘 다 보여 준다.
 *       원본 서식은 복사만 하고(makeCopy) 절대 쓰지 않는다. 작성본은 관리 건 폴더에 만든다.
 */

/** 관리 건의 사실로 상황 코드를 정한다. 조건은 M_SITUATION.condition_json (예: {"signals":["S03"],"result_class":"채권 검토 필요"}) */
function matchSituations_(c, signals, latestTrend) {
  var activeRules = {};
  signals.forEach(function (s) { if (s.status === '연결' || s.status === '발생' || s.status === '보류') activeRules[s.rule_id] = s; });
  var out = [];
  readTable_('DB_MASTER', 'M_SITUATION').forEach(function (sit) {
    if (sit.is_deleted) return;
    var cond = {};
    try { cond = JSON.parse(sit.condition_json || '{}'); } catch (e) { return; }
    var ok = true;
    (cond.signals || []).forEach(function (r) { if (!activeRules[r]) ok = false; });
    if (cond.result_class && (!latestTrend || latestTrend.result_class !== cond.result_class)) ok = false;
    if (cond.min_overdue_days !== undefined) {
      var s3 = activeRules.S03 ? JSON.parse(activeRules.S03.evidence_json || '{}') : null;
      if (!s3 || Number(s3.overdueDays) < Number(cond.min_overdue_days)) ok = false;
    }
    if (cond.case_status && cond.case_status.indexOf(c.status) < 0) ok = false;
    if (ok) out.push({ situation_code: sit.situation_code, label: sit.label, condition: cond });
  });
  return out;
}

/** 상황 코드별 절차·근거·서식. 기준일에 유효한 문서 버전만 쓴다. */
function proceduresFor_(situationCode, asOf) {
  var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= asOf && asOf <= (v.effective_to || APP.OPEN_END); });
  var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { docs[d.doc_id] = d; });
  var validVer = {}; vers.forEach(function (v) { validVer[v.doc_id + '|' + v.version] = v; });
  var forms = readTable_('DB_MASTER', 'M_PROC_FORM');
  var steps = readTable_('DB_MASTER', 'M_PROCEDURE').filter(function (p) { return p.situation_code === situationCode && !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version]; })
    .sort(function (a, b) { return a.doc_id === b.doc_id ? a.step_no - b.step_no : (a.doc_id < b.doc_id ? -1 : 1); })
    .map(function (p) {
      var v = validVer[p.doc_id + '|' + p.doc_version], d = docs[p.doc_id] || {};
      return { step_no: p.step_no, content: p.content, checks: p.checks, doc_id: p.doc_id, doc_name: d.doc_name || p.doc_id, version: p.doc_version,
        article: p.article, page: p.page, effective_from: v.effective_from,
        forms: forms.filter(function (f) { return f.proc_step_id === p.proc_step_id && !f.is_deleted; }).map(function (f) {
          var fv = vers.filter(function (x) { return x.doc_id === f.form_doc_id; }).sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
          return { form_doc_id: f.form_doc_id, form_name: (docs[f.form_doc_id] || {}).doc_name || f.form_doc_id, version: fv ? fv.version : '', file_id: fv ? fv.file_id : '', required: f.required, available: !!fv };
        }) };
    });
  var docIds = {}; steps.forEach(function (s) { docIds[s.doc_id] = true; });
  var conflict = Object.keys(docIds).length > 1;
  // 절차가 아직 없을 때: 상황에 연결된 "근거 후보 문서"(M_SITUATION.note 의 doc:ID 목록)를 보여 준다. 절차 내용은 만들지 않는다
  var candidates = [];
  if (!steps.length) {
    var sit = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return x.situation_code === situationCode; })[0];
    ((sit && sit.note) || '').split(/[;,\s]+/).forEach(function (tok) {
      var m = tok.match(/^doc:(.+)$/); if (!m) return;
      var d = docs[m[1]]; var v = vers.filter(function (x) { return x.doc_id === m[1]; }).sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
      if (d) candidates.push({ doc_id: d.doc_id, doc_name: d.doc_name, version: v ? v.version : '', file_id: v ? v.file_id : '' });
    });
  }
  return { situation_code: situationCode, steps: steps, candidates: candidates, status: steps.length ? (conflict ? '충돌' : '정상') : '확인 필요',
    message: steps.length ? (conflict ? '같은 상황에 서로 다른 문서의 절차가 등록되어 있습니다. 문서 담당자 확인 전까지 우선순위를 정하지 않습니다.' : '')
      : (candidates.length ? '절차(조항·쪽수)가 아직 등록되지 않았습니다. 아래 근거 후보 문서를 열어 해당 조항을 확인한 뒤 "절차 단계 등록"으로 입력하세요. 절차를 임의로 만들지 않습니다.'
        : '등록된 근거 문서·절차가 없습니다. 절차를 임의로 만들지 않습니다. 문서 담당자에게 등록을 요청하세요.') };
}

/* ───────────── 매뉴얼 폴더 자동 등록 ───────────── */

/** 파일명 → 문서명·버전·시행일. "(2023.12.29 개정)" 이 있으면 그 날짜가 시행일, 없으면 시행일 미확인 */
function parseManualName_(fileName) {
  var base = String(fileName).replace(/\.(hwpx?|pdf|docx?|txt)$/i, '').replace(/의 사본$/, '').trim();
  var m = base.match(/\((\d{4})[.\-](\d{1,2})[.\-](\d{1,2})\s*개정\)/);
  var name = base.replace(/\s*\(\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\s*개정\)/, '').trim();
  var eff = m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  return { doc_name: name, version: eff ? 'v' + eff.replace(/-/g, '.') : 'v1', effective_from: eff, doc_id: 'DOC-' + fnv1a_(name).toUpperCase(),
    doc_type: /서식|양식|신청서|확인서|요청서/.test(name) ? '서식' : '매뉴얼', family: name.split(/[_\s]/)[0] };
}

/**
 * 폴더의 문서 파일을 모두 문서·버전으로 등록한다(이미 등록된 파일 ID·버전은 건너뜀).
 * HWP 는 본문을 읽을 수 없으므로 링크·버전만 등록된다. 조항·쪽수는 담당자가 "절차 단계 등록"에서 입력한다.
 */
function registerManualFolder_(user, folderIdOrName) {
  var folder = null;
  try { folder = DriveApp.getFolderById(folderIdOrName); } catch (e) { folder = null; }
  if (!folder) { var it0 = DriveApp.getFoldersByName(folderIdOrName); if (!it0.hasNext()) throw new Error('폴더를 찾을 수 없습니다: ' + folderIdOrName); folder = it0.next(); }
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC'); invalidate_('DB_MASTER', 'M_DOC_VER');
    var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { docs[d.doc_id] = d; });
    var vers = readTable_('DB_MASTER', 'M_DOC_VER');
    var stat = { docs: 0, versions: 0, skipped: 0, noDate: [] , files: [] };
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next(), name = f.getName();
      if (!/\.(hwpx?|pdf|docx?|txt)$/i.test(name) && String(f.getMimeType ? f.getMimeType() : '').indexOf('google-apps.document') < 0) continue;
      var p = parseManualName_(name);
      if (!docs[p.doc_id]) {
        var row = { doc_id: p.doc_id, doc_name: p.doc_name, doc_type: p.doc_type, owner_dept: '', note: '폴더 자동 등록(' + folder.getName() + ')' };
        Object.assign(row, newAuditFields_(user)); appendObjects_('DB_MASTER', 'M_DOC', [row]); docs[p.doc_id] = row; stat.docs++;
      }
      if (vers.some(function (v) { return v.doc_id === p.doc_id && (v.file_id === f.getId() || v.version === p.version); })) { stat.skipped++; continue; }
      var eff = p.effective_from || todayStr_();
      var prev = vers.filter(function (v) { return v.doc_id === p.doc_id && !v.is_deleted; });
      prev.forEach(function (v) { if ((v.effective_to || APP.OPEN_END) >= eff && v.effective_from < eff) { v.effective_to = addDays_(eff, -1); writeObject_('DB_MASTER', 'M_DOC_VER', v); } });
      var vrow = { doc_id: p.doc_id, version: p.version, effective_from: eff, effective_to: APP.OPEN_END, file_id: f.getId(),
        file_hash: sha256Hex_(f.getBlob().getBytes()), note: p.effective_from ? '파일명의 개정일을 시행일로 등록' : '시행일 미확인(파일명에 개정일 없음) — 등록일로 임시 설정, 확인 후 수정' };
      Object.assign(vrow, newAuditFields_(user)); appendObjects_('DB_MASTER', 'M_DOC_VER', [vrow]); vers.push(vrow); stat.versions++;
      if (!p.effective_from) stat.noDate.push(p.doc_name);
      stat.files.push({ file: name, doc_id: p.doc_id, doc_name: p.doc_name, version: p.version, effective_from: eff });
    }
    audit_(user, 'REGISTER_MANUALS', 'DB_MASTER', 'M_DOC', folder.getName(), null, { docs: stat.docs, versions: stat.versions, skipped: stat.skipped }, '매뉴얼 폴더 자동 등록');
    return stat;
  });
}

/**
 * 상황 코드 기본 세트와 "근거 후보 문서" 연결. 절차 내용은 만들지 않는다.
 * 후보 문서는 등록된 문서명에서 키워드로 찾는다(편·장 제목 기준). 조항·쪽수는 담당자가 입력.
 */
var SITUATION_SEED = [
  { code: 'SIT-OVD-NEW', label: '연체 발생(채권 검토 필요)', cond: { signals: ['S03'], result_class: '채권 검토 필요' }, keywords: ['임의회수', '여신관리', '총칙'] },
  { code: 'SIT-OVD-30', label: '연체 30일 이상 장기화', cond: { signals: ['S03'], min_overdue_days: 30 }, keywords: ['임의회수', '집행보전조치', '지급명령', '부실위험조사'] },
  { code: 'SIT-OVD-90', label: '연체 90일 이상·부실 우려', cond: { signals: ['S03'], min_overdue_days: 90 }, keywords: ['강제집행', '담보권 실행', '부실채권정리', '부실위험조사'] },
  { code: 'SIT-TURN-DROP', label: '회전율 저하 확인', cond: { signals: ['S01'] }, keywords: ['여신관리', '부실위험조사'] },
  { code: 'SIT-AR-UP', label: '미수금 증가', cond: { signals: ['S02'] }, keywords: ['여신관리'] },
  { code: 'SIT-BUY-DROP', label: '구매실적 급감', cond: { signals: ['S04'] }, keywords: ['여신관리', '부실위험조사'] },
  { code: 'SIT-LIMIT-HIGH', label: '한도 사용률 상승', cond: { signals: ['S05'] }, keywords: ['여신관리', '신용조사', '총칙'] },
  { code: 'SIT-COLL-EXPIRY', label: '담보·보증 기한 도래', cond: { signals: ['S06'] }, keywords: ['담보취득', '담보물', '감정평가'] },
  { code: 'SIT-MULTI', label: '복수 징후 동시 발생', cond: { signals: ['S07'] }, keywords: ['부실위험조사', '여신관리'] }
];

function seedSituations_(user) {
  invalidate_('DB_MASTER', 'M_SITUATION');
  var have = {}; readTable_('DB_MASTER', 'M_SITUATION').forEach(function (s) { have[s.situation_code] = s; });
  var docs = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return !d.is_deleted && d.doc_type === '매뉴얼'; });
  var out = { created: 0, updated: 0 };
  SITUATION_SEED.forEach(function (s) {
    var cands = docs.filter(function (d) { return s.keywords.some(function (k) { return d.doc_name.indexOf(k) >= 0; }); }).map(function (d) { return 'doc:' + d.doc_id; });
    var note = (cands.length ? '근거 후보 ' + cands.join(' ') : '근거 후보 없음') + ' — 조항·쪽수는 담당자 확인 후 절차 단계로 등록';
    var cur = have[s.code];
    if (!cur) { registerSituation_(user, { situation_code: s.code, label: s.label, condition_json: s.cond, note: note }, '상황 코드 기본 세트'); out.created++; }
    else if (cur.note !== note && !/^(가상)/.test(cur.note || '')) { registerSituation_(user, { situation_code: s.code, label: cur.label, condition_json: cur.condition_json, note: note }, '근거 후보 갱신'); out.updated++; }
  });
  return out;
}

/**
 * 절차 안내(설계 4.5.2 형식): 확인된 상황 → 추가 확인사항 → 적용 가능한 절차 → 근거 → 필요 서식 → 다음 할 일
 */
function procedureGuide_(c, signals, trends, actions) {
  var st = readStatus_(), today = todayStr_();
  var latestTrend = trends.filter(function (t) { return t.status === '제출'; }).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; })[0] || null;
  var rawSignals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === c.case_id; });
  var situations = matchSituations_(c, rawSignals, latestTrend);
  var facts = signals.filter(function (s) { return s.status !== '해소' && s.status !== '오탐확정'; }).map(function (s) {
    var e = s.evidence || {};
    var txt = s.label;
    if (s.rule_id === 'S01') txt += ' (회전율 ' + e.prevTurnover + '→' + e.turnover + ', ' + e.dropPct + '% 하락, 회수일수 ' + e.collectionDays + '일)';
    if (s.rule_id === 'S02') txt += ' (잔액 ' + Number(e.balance).toLocaleString() + '원, 평균 대비 ' + e.ratio + '배)';
    if (s.rule_id === 'S03') txt += ' (' + e.stage + ', 연체 ' + Number(e.overdueAmount).toLocaleString() + '원, ' + e.overdueDays + '일)';
    if (s.rule_id === 'S04') txt += ' (전년 ' + e.yoyPct + '%, 3개월 ' + e.ma3Pct + '%, 시장 대비 ' + e.vsMarketPp + '%p)';
    if (s.rule_id === 'S05') txt += ' (사용률 ' + e.usagePct + '%)';
    return txt;
  });
  if (latestTrend) facts.push('동향보고 결과: ' + latestTrend.result_class + ' (' + latestTrend.checked_date + ', ' + latestTrend.check_method + ')');
  var procs = situations.map(function (s) { var p = proceduresFor_(s.situation_code, today); p.label = s.label; return p; });
  var further = [];
  if (latestTrend && latestTrend.further_checks) further.push(latestTrend.further_checks);
  if (latestTrend && latestTrend.payment_plan) further.push('결제계획 이행 여부 확인: ' + latestTrend.payment_plan);
  var docVers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); });
  var next = [];
  if (c.status === '접수' || c.status === '동향확인중') next.push('동향보고 작성·제출 (기한 ' + (c.trend_due || '미정') + ')');
  else if (c.status === '확인완료') next.push('채권담당 확인 후 종결(재점검일 지정) 또는 조치 등록');
  else if (c.status === '조치진행') next.push(actions.some(function (a) { return a.status !== '완료'; }) ? '진행 중 조치 결과 등록' : '조치 등록 또는 종결');
  else if (c.status === '승인대기') next.push('승인권자 승인 대기');
  else if (c.status === '재점검대기') next.push('재점검일 ' + c.recheck_date + ' 도래 시 재점검');
  return {
    basis: { data_base_date: st.latest_base_date || '', data_status: st.data_status || '', manual_versions: docVers.map(function (v) { return v.doc_id + ' ' + v.version + '(시행 ' + v.effective_from + ')'; }) },
    situations: situations, facts: facts, furtherChecks: further, procedures: procs, nextSteps: next,
    noBasis: !situations.length || procs.every(function (p) { return p.status === '확인 필요'; })
  };
}

/* ───────────── 서식 ───────────── */

function caseFolder_(caseId) {
  var parent = folder_('CASES');
  var it = parent.getFoldersByName(caseId);
  return it.hasNext() ? it.next() : parent.createFolder(caseId);
}

/** 자리표시자 값: 중도매인 기본정보 + 기준일 */
function placeholderValues_(c) {
  var ws = findWs_(c.wholesaler_id), st = readStatus_(), base = st.latest_base_date || '';
  var m = {};
  readTable_('DB_AGG', 'A_METRIC').forEach(function (r) { if (r.wholesaler_id === ws.wholesaler_id && r.base_date === base && r.category === APP.ALL) m[r.metric] = r; });
  var names = userNameMap_();
  return {
    '중도매인코드': ws.wholesaler_id, '상호': ws.name, '대표자': ws.representative, '관리건ID': c.case_id,
    '기준일': base, '미수금': m['잔액'] && m['잔액'].status === '정상' ? Number(m['잔액'].value).toLocaleString() : '(자료 없음)',
    '연체금액': m['연체금액'] && m['연체금액'].status === '정상' ? Number(m['연체금액'].value).toLocaleString() : '(자료 없음)',
    '연체일수': m['연체일수'] && m['연체일수'].status === '정상' ? String(m['연체일수'].value) : '(자료 없음)',
    '담당경매사': names[c.auctioneer_id] || '', '작성일': todayStr_(), '작성자': ''
  };
}

/**
 * 서식 작성본 생성: 원본 복사 → 자리표시자 치환 → 관리 건 폴더 저장 → T_ATTACH(작성본) 기록
 * Google 문서면 DocumentApp 으로, 일반 텍스트면 문자열 치환으로 채운다. 그 밖의 형식은 복사만 한다.
 */
function createDraftForm_(user, caseId, formDocId) {
  var c = findCase_(caseId);
  requireWsAccess_(user, c.wholesaler_id);
  var today = todayStr_();
  var ver = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === formDocId && !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); })
    .sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
  if (!ver) throw new Error('유효한 서식 버전이 없습니다: ' + formDocId);
  var doc = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return d.doc_id === formDocId; })[0] || { doc_name: formDocId };
  var src = DriveApp.getFileById(ver.file_id);
  var vals = placeholderValues_(c); vals['작성자'] = user.name || user.user_id;
  var name = caseId + '_' + doc.doc_name + '_' + ver.version + '_작성본_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm');
  var copy = src.makeCopy(name, caseFolder_(caseId));   // 원본에는 쓰기 호출 없음
  var filled = 'copy_only';
  var mime = '';
  try { mime = String(copy.getMimeType ? copy.getMimeType() : ''); } catch (e) { mime = ''; }
  if (mime === 'application/vnd.google-apps.document' && typeof DocumentApp !== 'undefined') {
    var body = DocumentApp.openById(copy.getId()).getBody();
    Object.keys(vals).forEach(function (k) { body.replaceText('\\{\\{' + k + '\\}\\}', String(vals[k])); });
    filled = 'google_doc';
  } else if (mime.indexOf('text/') === 0 || /\.(txt|md|csv)$/i.test(src.getName())) {
    var text = copy.getBlob().getDataAsString('UTF-8');
    Object.keys(vals).forEach(function (k) { text = text.split('{{' + k + '}}').join(String(vals[k])); });
    copy.setContent(text);
    filled = 'text';
  }
  var row = { attach_id: uid_('AT'), case_id: caseId, ref_type: 'CASE', ref_id: caseId, kind: '작성본', form_doc_id: formDocId, form_version: ver.version,
    file_id: copy.getId(), file_name: name, file_hash: sha256Hex_(copy.getBlob().getBytes()), locked: false, created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_WORK', 'T_ATTACH', [row]);
  logAccess_(user.user_id, 'form.draft', formDocId, '허용', name + ' (' + filled + ')');
  audit_(user, 'CREATE_DRAFT', 'DB_WORK', 'T_ATTACH', row.attach_id, null, row, '서식 작성본 생성');
  return { attach: row, filled: filled, url: 'https://drive.google.com/file/d/' + copy.getId() + '/view' };
}

/** 제출본 등록: 업로드 파일을 관리 건 폴더에 저장하고 잠근다 */
function uploadFinalForm_(user, caseId, o) {
  var c = findCase_(caseId);
  requireWsAccess_(user, c.wholesaler_id);
  requireText_(o.file_name, '파일명');
  var bytes = Utilities.base64Decode(requireText_(o.base64, '파일 내용'));
  var kind = ['제출본', '증빙'].indexOf(o.kind) >= 0 ? o.kind : '제출본';
  var safe = String(o.file_name).replace(/[\\/:*?"<>|]/g, '_');
  var file = caseFolder_(caseId).createFile(Utilities.newBlob(bytes, o.mime_type || 'application/octet-stream', caseId + '_' + kind + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss') + '_' + safe));
  var row = { attach_id: uid_('AT'), case_id: caseId, ref_type: o.ref_type || 'CASE', ref_id: o.ref_id || caseId, kind: kind, form_doc_id: o.form_doc_id || '',
    form_version: o.form_version || '', file_id: file.getId(), file_name: file.getName(), file_hash: sha256Hex_(bytes), locked: kind === '제출본', created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_WORK', 'T_ATTACH', [row]);
  if (o.ref_type === 'ACTION' && o.ref_id) {
    var a = findAction_(o.ref_id);
    a.attach_ids = (a.attach_ids ? a.attach_ids + ',' : '') + row.attach_id; a.row_version = Number(a.row_version) + 1; a.updated_at = nowStr_(); a.updated_by = user.user_id;
    writeObject_('DB_WORK', 'T_ACTION', a);
  }
  logAccess_(user.user_id, 'form.final', caseId, '허용', row.file_name);
  audit_(user, 'UPLOAD', 'DB_WORK', 'T_ATTACH', row.attach_id, null, row, kind + ' 등록');
  return row;
}

/** 빈 서식 다운로드 링크(원본은 읽기 전용; 다운로드 기록) */
function blankFormLink_(user, formDocId) {
  var today = todayStr_();
  var ver = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === formDocId && !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); })
    .sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
  if (!ver) throw new Error('유효한 서식 버전이 없습니다: ' + formDocId);
  logAccess_(user.user_id, 'form.blank', formDocId, '허용', ver.version);
  return { doc_id: formDocId, version: ver.version, url: 'https://drive.google.com/file/d/' + ver.file_id + '/view' };
}

/* ───────────── 문서·절차 등록(관리자) ───────────── */

function registerDoc_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.doc_id, '문서 ID');
  if (['매뉴얼', '서식'].indexOf(o.doc_type) < 0) throw new Error('문서 유형은 매뉴얼/서식 중 하나입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC');
    var cur = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return d.doc_id === id; })[0];
    if (cur) {
      var before = JSON.parse(JSON.stringify(cur));
      cur.doc_name = o.doc_name || cur.doc_name; cur.owner_dept = o.owner_dept || cur.owner_dept; cur.note = o.note || cur.note;
      cur.updated_at = nowStr_(); cur.updated_by = user.user_id; cur.row_version = Number(cur.row_version) + 1;
      writeObject_('DB_MASTER', 'M_DOC', cur); audit_(user, 'UPDATE', 'DB_MASTER', 'M_DOC', id, before, cur, reason);
      return stripInternal_(cur);
    }
    var row = { doc_id: id, doc_name: requireText_(o.doc_name, '문서명'), doc_type: o.doc_type, owner_dept: o.owner_dept || '', note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_DOC', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_DOC', id, null, row, reason);
    return row;
  });
}

function registerDocVersion_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.doc_id, '문서 ID'), version = requireText_(o.version, '버전');
  var from = optDate_(requireText_(o.effective_from, '시행일'), '시행일');
  var fileId = requireText_(o.file_id, 'Drive 파일 ID');
  var file = DriveApp.getFileById(fileId);
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC_VER');
    if (!readTable_('DB_MASTER', 'M_DOC').some(function (d) { return d.doc_id === id; })) throw new Error('문서를 먼저 등록하세요: ' + id);
    var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === id && !v.is_deleted; });
    if (vers.some(function (v) { return v.version === version; })) throw new Error('이미 있는 버전입니다: ' + version);
    vers.forEach(function (v) {
      if ((v.effective_to || APP.OPEN_END) >= from && v.effective_from < from) {
        var b = JSON.parse(JSON.stringify(v)); v.effective_to = addDays_(from, -1); v.updated_at = nowStr_(); v.updated_by = user.user_id; v.row_version = Number(v.row_version) + 1;
        writeObject_('DB_MASTER', 'M_DOC_VER', v); audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_DOC_VER', id + '|' + v.version, b, v, '새 버전 ' + version);
      }
    });
    var row = { doc_id: id, version: version, effective_from: from, effective_to: optDate_(o.effective_to, '폐지일') || APP.OPEN_END, file_id: fileId,
      file_hash: sha256Hex_(file.getBlob().getBytes()), note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_DOC_VER', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_DOC_VER', id + '|' + version, null, row, reason);
    return row;
  });
}

function registerProcedure_(user, o, reason) {
  requireText_(reason, '변경 사유');
  requireText_(o.situation_code, '상황 코드'); requireText_(o.content, '절차 내용'); requireText_(o.doc_id, '근거 문서'); requireText_(o.doc_version, '문서 버전');
  return withLock_(function () {
    if (!readTable_('DB_MASTER', 'M_SITUATION').some(function (s) { return s.situation_code === o.situation_code && !s.is_deleted; })) throw new Error('상황 코드를 먼저 등록하세요.');
    if (!readTable_('DB_MASTER', 'M_DOC_VER').some(function (v) { return v.doc_id === o.doc_id && v.version === o.doc_version; })) throw new Error('문서 버전이 없습니다.');
    var row = { proc_step_id: uid_('PS'), situation_code: o.situation_code, step_no: Number(o.step_no) || 1, content: o.content, checks: o.checks || '',
      doc_id: o.doc_id, doc_version: o.doc_version, article: o.article || '', page: o.page || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_PROCEDURE', [row]);
    (o.form_doc_ids || []).forEach(function (f) {
      var fr = { proc_step_id: row.proc_step_id, form_doc_id: f, required: true }; Object.assign(fr, newAuditFields_(user));
      appendObjects_('DB_MASTER', 'M_PROC_FORM', [fr]);
    });
    audit_(user, 'CREATE', 'DB_MASTER', 'M_PROCEDURE', row.proc_step_id, null, row, reason);
    return row;
  });
}

function registerSituation_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var code = requireText_(o.situation_code, '상황 코드');
  var cond = typeof o.condition_json === 'string' ? o.condition_json : JSON.stringify(o.condition_json || {});
  JSON.parse(cond);
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_SITUATION');
    var cur = readTable_('DB_MASTER', 'M_SITUATION').filter(function (s) { return s.situation_code === code; })[0];
    if (cur) {
      var b = JSON.parse(JSON.stringify(cur)); cur.label = o.label || cur.label; cur.condition_json = cond; cur.note = o.note || cur.note;
      cur.updated_at = nowStr_(); cur.updated_by = user.user_id; cur.row_version = Number(cur.row_version) + 1;
      writeObject_('DB_MASTER', 'M_SITUATION', cur); audit_(user, 'UPDATE', 'DB_MASTER', 'M_SITUATION', code, b, cur, reason); return stripInternal_(cur);
    }
    var row = { situation_code: code, label: requireText_(o.label, '상황명'), condition_json: cond, note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_SITUATION', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_SITUATION', code, null, row, reason);
    return row;
  });
}
