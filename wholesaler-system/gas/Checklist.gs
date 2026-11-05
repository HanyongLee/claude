/**
 * Checklist.gs — 이상징후 체크리스트 (현장 확인용)
 * 흐름: 징후가 뜬 중도매인별 서면 체크리스트 인쇄(스냅샷·웹) → 경매사가 대면·경매 현장에서 체크 → 채권 담당자가 결과를 입력하거나 스캔 파일 업로드
 *       → 동향보고(확인 방법 '현장 체크리스트')로 기록되고 관리 건 흐름으로 이어진다.
 * 판정 제안(가능성 높음/보통/낮음)은 가중 합계 기준의 가정값이며 담당자의 결과 분류를 대신하지 않는다.
 */

function seedChecklist_(user) {
  invalidate_('DB_MASTER', 'M_CHECKLIST');
  if (readTable_('DB_MASTER', 'M_CHECKLIST').length) return 0;
  var rows = CHECKLIST_SEED.map(function (c, i) {
    var r = { item_id: 'CK' + ('0' + (i + 1)).slice(-2), sort_no: i + 1, category: c[0], text: c[1], weight: c[2], is_assumed: true, active: true };
    Object.assign(r, newAuditFields_(user)); return r;
  });
  appendObjects_('DB_MASTER', 'M_CHECKLIST', rows);
  return rows.length;
}

function checklistItems_() {
  return readTable_('DB_MASTER', 'M_CHECKLIST').filter(function (r) { return r.active && !r.is_deleted; })
    .sort(function (a, b) { return a.sort_no - b.sort_no; })
    .map(function (r) { return { item_id: r.item_id, category: r.category, text: r.text, weight: Number(r.weight) || 1, is_assumed: !!r.is_assumed }; });
}

/** 체크리스트 점수 → 제안. 가정값(CHECKLIST_HIGH_SCORE) */
function checklistScore_(items, answers, settings) {
  var yes = 0, total = 0, unknown = 0;
  items.forEach(function (it) {
    var a = answers[it.item_id];
    total += it.weight;
    if (a === '예') yes += it.weight; else if (a === '미확인' || a === undefined) unknown++;
  });
  var high = settingNum_(settings, 'CHECKLIST_HIGH_SCORE', 3);
  var level = yes >= high ? '높음' : (yes > 0 ? '보통' : '낮음');
  return { yes: yes, total: total, unknown: unknown, level: level, threshold: high, note: '가정값 기준 제안. 담당자의 확인 결과 분류가 우선합니다.' };
}

/**
 * 체크 결과 입력 → 동향보고 제출. answers: {item_id: '예'|'아니오'|'미확인'}, remarks: {item_id: 비고}
 */
function saveChecklistResult_(user, o) {
  var c = findCase_(requireText_(o.case_id, '관리건ID'));
  requireWsAccess_(user, c.wholesaler_id);
  requireText_(o.checked_date, '확인일'); optDate_(o.checked_date, '확인일');
  if (RESULT_CLASSES.indexOf(o.result_class) < 0) throw new Error('확인 결과 분류를 선택하세요.');
  requireText_(o.recheck_date, '재점검일');
  var items = checklistItems_(), answers = o.answers || {}, remarks = o.remarks || {};
  var score = checklistScore_(items, answers, readSettings_());
  var facts = [], further = [];
  items.forEach(function (it) {
    var a = answers[it.item_id] || '미확인';
    var line = '[' + it.category + '] ' + it.text + ' → ' + a + (remarks[it.item_id] ? ' (' + remarks[it.item_id] + ')' : '');
    if (a === '예') facts.push({ text: line, item_id: it.item_id });
    else if (a === '미확인') further.push(it.category + ': ' + it.text);
  });
  if (!facts.length) facts.push({ text: '체크리스트 전 항목 "아니오" 또는 "미확인" (확인일 ' + o.checked_date + ')' });
  var checker = o.checker_name ? ' (현장 확인자: ' + o.checker_name + ')' : '';
  var report = saveTrendReport_(user, {
    case_id: c.case_id, checked_date: o.checked_date, check_method: '현장 체크리스트' + (o.by_paper ? '(서면)' : ''), counterpart: o.counterpart || '',
    facts: facts, business_status: o.business_status || '', payment_plan: o.payment_plan || '',
    opinion: (o.opinion || '') + (o.opinion ? ' / ' : '') + '체크리스트 점수 ' + score.yes + '/' + score.total + ' → 제안 ' + score.level + checker,
    further_checks: further.join('; ') + (o.further_checks ? ' / ' + o.further_checks : ''), result_class: o.result_class, recheck_date: o.recheck_date,
    followup: o.followup || '', official_source: o.by_paper ? '서면 체크리스트(담당자 전산 입력)' : '시스템 입력(체크리스트)'
  }, true);
  audit_(user, 'CHECKLIST', 'DB_WORK', 'T_TREND', report.report_id, null, { score: score, answers: answers }, '체크리스트 결과');
  return { report: report, score: score };
}

/** 인쇄용 체크리스트 자료(스냅샷·웹 공용) */
function checklistPrintData_(caseRow, signals, wsName) {
  return { case_id: caseRow.case_id, wholesaler_id: caseRow.wholesaler_id, name: wsName, auctioneer: caseRow.auctioneer_id, opened_date: caseRow.opened_date,
    trend_due: caseRow.trend_due, signals: signals.map(function (s) { return s.rule_id + ' ' + (SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : ''); }), items: checklistItems_() };
}

/**
 * 서면 체크리스트 스캔·사진 파일 적재: 파일명 CHECK_<관리건ID>_<yyyymmdd>.(pdf|jpg|png)
 * 관리 건의 증빙(잠금)으로 첨부만 한다. 결과 입력은 담당자가 화면에서 한다.
 */
function importChecklistFile_(file, batch) {
  var m = String(file.getName()).match(/^CHECK_(C-\d{4}-\d{4})_/i);
  if (!m) return { ok: false, status: '형식오류', message: '파일명은 CHECK_<관리건ID>_<날짜> 형식이어야 합니다', dest: 'ERROR' };
  try {
    var c = findCase_(m[1]);
    var copy = file.makeCopy(file.getName(), caseFolder_(c.case_id));
    appendObjects_('DB_WORK', 'T_ATTACH', [{ attach_id: uid_('AT'), case_id: c.case_id, ref_type: 'CASE', ref_id: c.case_id, kind: '증빙', form_doc_id: '', form_version: '',
      file_id: copy.getId(), file_name: '체크리스트(서면) ' + file.getName(), file_hash: batch.file_hash, locked: true, created_at: nowStr_(), created_by: 'import' }]);
    return { ok: true, status: '완료', message: '서면 체크리스트 → ' + c.case_id + ' 증빙 첨부. 결과는 화면 "체크리스트 결과 입력"에서 기록하세요', dest: 'DONE' };
  } catch (e) { return { ok: false, status: '실패', message: String(e && e.message ? e.message : e), dest: 'ERROR' }; }
}
