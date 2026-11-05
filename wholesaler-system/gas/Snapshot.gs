/**
 * Snapshot.gs — 사내망 배포용 스냅샷 HTML 생성 + 오프라인 동향보고 파일 적재
 *
 * 스냅샷: 정기 처리 후 역할별로 HTML 파일(JS·CSS·데이터 한 파일)을 40_배포 폴더에 만든다.
 *  - 전체용 1개: 채권담당·관리자 시점(모든 중도매인)
 *  - 경매사별 N개: 담당 중도매인만
 *  - 포함: 오늘 처리할 일, 신호·근거, 중도매인별 실적·회수 요약, 매트릭스, 관리 건, 절차 안내(상황 코드별), 동향보고 입력 폼
 *  - 제외: 보증인 성명·연락처·증빙·변경 이력(개인정보·내부 기록). 파일을 받은 사람은 파일 안 자료를 모두 볼 수 있으므로 역할별로 분리한다
 * 동향보고 파일(TREND_*.json): 스냅샷의 폼에서 내려받은 파일을 담당자가 가져오기 폴더에 넣으면 정기 처리가 보고서로 적재한다.
 */

function snapshotUserFor_(auctioneerId) {
  if (!auctioneerId) return ownerAsUser_();
  var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === auctioneerId; })[0];
  return { user_id: u.user_id, name: u.name, role: u.role, roleLabel: ROLES[u.role] };
}

/** 스냅샷에 넣을 자료(개인정보·내부 기록 제외) */
function snapshotData_(user) {
  var st = readStatus_(), today = todayStr_();
  var queues = workQueues_(user);
  var perf = performanceSummary_(user);
  var matrix = matrix_(user, APP.ALL);
  var names = userNameMap_();
  var mine = {}; accessibleWs_(user).forEach(function (w) { mine[w.wholesaler_id] = w; });
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return mine[s.wholesaler_id] && s.status !== '해소' && s.status !== '오탐확정'; })
    .map(function (s) { return { signal_id: s.signal_id, wholesaler_id: s.wholesaler_id, rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id, severity: s.severity, status: s.status, first_date: s.first_date, last_date: s.last_date, case_id: s.case_id, evidence: JSON.parse(s.evidence_json || '{}') }; });
  var cases = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return mine[c.wholesaler_id] && !c.is_deleted && (c.status !== '종결' || c.closed_date >= addDays_(today, -90)); })
    .map(function (c) { return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, status: c.status, opened_date: c.opened_date, auctioneer: names[c.auctioneer_id] || '', auctioneer_id: c.auctioneer_id, owner: names[c.owner_id] || '', trend_due: c.trend_due, action_due: c.action_due, recheck_date: c.recheck_date, result_class: c.result_class, close_reason: c.close_reason, is_recurrence: c.is_recurrence }; });
  var trends = readTable_('DB_WORK', 'T_TREND').filter(function (t) { return mine[t.wholesaler_id] && t.status === '제출'; })
    .map(function (t) { return { case_id: t.case_id, version: t.version, checked_date: t.checked_date, check_method: t.check_method, result_class: t.result_class, facts: JSON.parse(t.facts_json || '[]').map(function (f) { return f.text; }), writer: names[t.writer_id] || '', submitted_at: t.submitted_at, official_source: t.official_source }; });
  var actions = readTable_('DB_WORK', 'T_ACTION').filter(function (a) { return mine[a.wholesaler_id] && !a.is_deleted; })
    .map(function (a) { return { case_id: a.case_id, action_type: a.action_type, content: a.content, owner: names[a.owner_id] || '', due_date: a.due_date, approval_status: a.needs_approval ? a.approval_status : '불필요', status: a.status, result: a.result, done_date: a.done_date, dunning_round: a.dunning_round, sent_method: a.sent_method, sent_date: a.sent_date }; });
  var situations = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; }).map(function (x) {
    var p = proceduresFor_(x.situation_code, today);
    return { situation_code: x.situation_code, label: x.label, condition: x.condition_json, status: p.status, message: p.message,
      steps: p.steps.map(function (s) { return { step_no: s.step_no, content: s.content, checks: s.checks, basis: s.doc_name + ' ' + s.version + ' ' + s.article + (s.page ? ' p.' + s.page : ''), effective_from: s.effective_from, forms: s.forms.map(function (f) { return f.form_name + ' ' + f.version; }) }; }) };
  });
  var wsList = perf.rows.map(function (r) {
    var w = mine[r.wholesaler_id];
    return { wholesaler_id: r.wholesaler_id, name: r.name, biz_status: r.biz_status, isNew: r.isNew, categories: w ? w.categories : '', dataState: r.dataState,
      assignee: currentAssignees_(r.wholesaler_id, today, names).map(function (a) { return a.name; }).join(', '),
      byCategory: r.byCategory, turnover: r.turnover, turnoverInfo: r.turnoverInfo, collectionDays: r.collectionDays, balance: r.balance, overdue: r.overdue, overdueDays: r.overdueDays, limitUsage: r.limitUsage, limitUsageInfo: r.limitUsageInfo,
      limits: asOfVersions_(readTable_('DB_MASTER', 'M_LIMIT'), 'limit_id', r.wholesaler_id, today).map(function (l) { return { limit_type: l.limit_type, amount: l.amount, valid_from: l.valid_from, valid_to: l.valid_to }; }),
      collaterals: asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', r.wholesaler_id, today).map(function (c) { return { type: c.collateral_type, set_amount: c.set_amount, recognized_amount: c.recognized_amount, expiry_date: c.expiry_date, review_status: c.review_status }; }),
      guarantee: asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', r.wholesaler_id, today).map(function (g) { return { has: g.has_guarantee, scope: g.scope, period_to: g.period_to }; })[0] || null };
  });
  return {
    generated_at: nowStr_(), for_user: { name: user.name, role: user.roleLabel, user_id: user.user_id }, app: { name: APP.NAME, version: APP.VERSION },
    status: { base_date: st.latest_base_date || '', data_status: st.data_status || '', status_reasons: st.status_reasons || '', last_updated: st.last_updated_at || '', ar_available: st.ar_available || '예', signal_base_date: st.signal_base_date || '' },
    meta: perf.meta, queues: queues, signals: signals, cases: cases, trends: trends, actions: actions, wholesalers: wsList,
    matrix: { xMode: matrix.xMode, growthRank: matrix.growthRank || null, boundaries: matrix.boundaries, counts: matrix.counts, points: matrix.points, excluded: matrix.excluded, disclaimer: matrix.disclaimer, axes: matrix.axes, quadrants: matrix.quadrants },
    situations: situations, resultClasses: RESULT_CLASSES, rules: SIGNAL_RULES, quadrants: MATRIX_QUADRANTS,
    notes: { turnover: perf.meta.turnoverNote, partial: perf.meta.partialNote, privacy: '이 파일에는 보증인 성명·연락처·증빙·변경 이력이 들어 있지 않습니다. 파일을 받은 사람은 파일 안 자료를 모두 볼 수 있으므로 외부로 전달하지 마세요.' }
  };
}

/**
 * 주간 요약(웹 홈·스냅샷 공용): 이상 징후 / 동향보고 / 조치사항 세 흐름 + 4분면 + 조치 안내 + 체크리스트
 */
function weeklySummary_(user) {
  var d = snapshotData_(user), today = todayStr_();
  var byCase = {}; d.cases.forEach(function (c) { byCase[c.case_id] = c; });
  var wsIdx = {}; d.wholesalers.forEach(function (w) { wsIdx[w.wholesaler_id] = w; });
  // ① 이상 징후: 중도매인별로 묶음(활성 신호가 있거나 관리 건이 열려 있는 경우)
  var sigByWs = {};
  d.signals.forEach(function (s) { (sigByWs[s.wholesaler_id] = sigByWs[s.wholesaler_id] || []).push(s); });
  var flagged = Object.keys(sigByWs).map(function (ws) {
    var sg = sigByWs[ws], c = d.cases.filter(function (x) { return x.wholesaler_id === ws && x.status !== '종결'; })[0];
    var w = wsIdx[ws] || {};
    var latestTrend = d.trends.filter(function (t) { return c && t.case_id === c.case_id; }).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; })[0];
    var sev = sg.some(function (s) { return s.severity === '위험'; }) ? '위험' : sg.some(function (s) { return s.severity === '경고'; }) ? '경고' : sg.some(function (s) { return s.severity === '주의'; }) ? '주의' : '정보';
    return { wholesaler_id: ws, name: w.name || ws, assignee: w.assignee || '', severity: sev, signals: sg, case_id: c ? c.case_id : '', case_status: c ? c.status : '', trend_due: c ? c.trend_due : '',
      latest_trend: latestTrend ? { checked_date: latestTrend.checked_date, result_class: latestTrend.result_class, check_method: latestTrend.check_method } : null,
      balance: w.balance, overdue: w.overdue, overdueDays: w.overdueDays, turnover: w.turnover, yoy: w.byCategory ? w.byCategory[APP.ALL].lastMonth.yoy : null, lastMonth: w.byCategory ? w.byCategory[APP.ALL].lastMonth : null };
  }).sort(function (a, b) { var o = { '위험': 0, '경고': 1, '주의': 2, '정보': 3 }; return o[a.severity] - o[b.severity] || (b.overdue || 0) - (a.overdue || 0); });
  // ② 동향보고: 최근 제출 + 확인 대기
  var trendWait = d.cases.filter(function (c) { return c.status === '접수' || c.status === '동향확인중'; }).map(function (c) {
    return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, name: (wsIdx[c.wholesaler_id] || {}).name || '', auctioneer: c.auctioneer, trend_due: c.trend_due, overdue: c.trend_due && c.trend_due < today,
      signals: (sigByWs[c.wholesaler_id] || []).map(function (s) { return s.rule_id; }) };
  });
  var recentTrends = d.trends.slice().sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; }).slice(0, 30).map(function (t) {
    return Object.assign({ name: (wsIdx[(byCase[t.case_id] || {}).wholesaler_id] || {}).name || '', wholesaler_id: (byCase[t.case_id] || {}).wholesaler_id || '' }, t);
  });
  // ③ 조치사항: 진행 중 조치 + 승인 대기 + 재점검 + 최근 완료
  var actions = d.actions.map(function (a) { return Object.assign({ wholesaler_id: (byCase[a.case_id] || {}).wholesaler_id || '', name: (wsIdx[(byCase[a.case_id] || {}).wholesaler_id] || {}).name || '', case_status: (byCase[a.case_id] || {}).status || '' }, a); });
  var openActions = actions.filter(function (a) { return a.status !== '완료'; });
  var doneActions = actions.filter(function (a) { return a.status === '완료'; }).sort(function (a, b) { return a.done_date < b.done_date ? 1 : -1; }).slice(0, 20);
  var recheck = d.cases.filter(function (c) { return c.status === '재점검대기'; }).map(function (c) { return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, name: (wsIdx[c.wholesaler_id] || {}).name || '', recheck_date: c.recheck_date, due: c.recheck_date && c.recheck_date <= today, close_reason: c.close_reason }; });
  // 조치 안내(1줄 + 조항) 와 징후별 매칭: 상황 코드의 신호가 현재 활성 신호와 겹치면 해당
  var guides = actionGuides_();
  flagged.forEach(function (f) {
    var ids = f.signals.map(function (s) { return s.rule_id; });
    var od = (f.signals.filter(function (s) { return s.rule_id === 'S03'; })[0] || {}).evidence || {};
    f.guides = guides.filter(function (g) {
      if (!g.signals.length || !g.signals.every(function (r) { return ids.indexOf(r) >= 0; })) return false;
      if (g.min_overdue_days && Number(od.overdueDays || 0) < Number(g.min_overdue_days)) return false;
      if (g.result_class && (!f.latest_trend || f.latest_trend.result_class !== g.result_class)) return false;
      return true;
    }).map(function (g) { return { situation_code: g.situation_code, label: g.label, status: g.status, first: g.steps[0] || null, candidates: g.candidates }; });
  });
  // 체크리스트 인쇄 대상: 동향 확인 대기 관리 건
  var checklists = trendWait.map(function (t) { var c = byCase[t.case_id]; return checklistPrintData_({ case_id: c.case_id, wholesaler_id: c.wholesaler_id, auctioneer_id: c.auctioneer, opened_date: c.opened_date, trend_due: c.trend_due }, sigByWs[c.wholesaler_id] || [], t.name); });
  return {
    generated_at: d.generated_at, for_user: d.for_user, app: d.app, status: d.status, meta: d.meta, notes: d.notes, resultClasses: d.resultClasses, rules: d.rules, quadrants: d.quadrants,
    kpis: { flagged: flagged.length, flaggedHigh: flagged.filter(function (f) { return f.severity === '위험' || f.severity === '경고'; }).length, trendWait: trendWait.length, trendLate: trendWait.filter(function (t) { return t.overdue; }).length,
      trendsThisWeek: d.trends.filter(function (t) { return t.submitted_at && t.submitted_at.substring(0, 10) >= addDays_(today, -7); }).length,
      openActions: openActions.length, pendingApproval: openActions.filter(function (a) { return a.approval_status === '승인대기'; }).length, recheck: recheck.length, recheckDue: recheck.filter(function (r) { return r.due; }).length, wholesalers: d.wholesalers.length },
    flagged: flagged, trendWait: trendWait, recentTrends: recentTrends, openActions: openActions, doneActions: doneActions, recheck: recheck,
    matrix: d.matrix, guides: guides, checklists: checklists, checklistItems: checklistItems_(), wholesalers: d.wholesalers, cases: d.cases
  };
}

function snapshotHtml_(data) {
  var tpl = htmlFile_('SnapshotTemplate');
  var css = htmlFile_('Styles');
  var view = htmlFile_('SummaryView');
  var json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  return tpl.replace('<!--STYLES-->', css).replace('<!--SUMMARYVIEW-->', view).replace('/*DATA*/null', json);
}

/** [트리거·정기 처리] 역할별 스냅샷 생성 → 40_배포 폴더. 같은 날 파일은 덮어쓴다(이름 동일 파일 삭제 후 생성) */
function buildSnapshots_(runId, trigger) {
  var started = nowStr_(), out = [], settings = readSettings_();
  var folder = folder_('DEPLOY'), stamp = todayStr_();
  var targets = [{ id: '', label: '전체' }];
  readTable_('DB_MASTER', 'M_USER').forEach(function (u) { if (u.role === 'AUCTIONEER' && u.status === '사용' && !u.is_deleted) targets.push({ id: u.user_id, label: u.name }); });
  var mails = [];
  targets.forEach(function (t) {
    var user = snapshotUserFor_(t.id);
    var data = weeklySummary_(user);
    var html = snapshotHtml_(data);
    var name = '중도매인관리_' + stamp + '_' + t.label.replace(/[\\/:*?"<>|]/g, '_') + '.html';
    var it = folder.getFilesByName(name);
    while (it.hasNext()) it.next().setTrashed(true);
    var f = folder.createFile(name, html, 'text/html');
    out.push({ target: t.label, file_id: f.getId(), name: name, bytes: html.length, wholesalers: data.wholesalers.length });
    if (t.id && (settings.SNAPSHOT_EMAIL || '아니오') === '예') mails.push({ to: t.id, name: name, blob: Utilities.newBlob(html, 'text/html', name) });
  });
  var sent = 0;
  if (mails.length && MailApp.getRemainingDailyQuota() >= mails.length) {
    mails.forEach(function (m) { MailApp.sendEmail({ to: m.to, subject: '[' + APP.NAME + '] ' + stamp + ' 담당 중도매인 현황', body: '첨부 HTML 파일을 열어 확인하세요. 외부로 전달하지 마세요.', attachments: [m.blob] }); sent++; });
  }
  mergeStatus_({ snapshot_at: nowStr_(), snapshot_files: String(out.length) });
  logJob_(runId, 'SNAPSHOT', '완료', started, out.length, 0, out.map(function (o) { return o.target + '(' + Math.round(o.bytes / 1024) + 'KB)'; }).join(', ') + (sent ? ' / 메일 ' + sent : ''), trigger);
  return out;
}

/** [편집기 실행] 스냅샷 지금 생성 */
function buildSnapshotsNow() { requireOwner_(); return buildSnapshots_(uid_('SNAP'), '수동'); }

/* ───────────── 동향보고 파일 적재 ───────────── */

/**
 * TREND_*.json: { case_id, writer_id, checked_date, check_method, counterpart, facts[], business_status, payment_plan, opinion,
 *                 further_checks, result_class, recheck_date, followup, followup_owner, followup_due, submitted_at }
 * 작성자는 그 관리 건의 담당 경매사(또는 채권담당·관리자)여야 한다. 공식 원본 = 파일 제출(화면 입력과 구분 기록)
 */
function importTrendFile_(file, batch) {
  var o;
  try { o = JSON.parse(file.getBlob().getDataAsString('UTF-8')); } catch (e) { return { ok: false, status: '형식오류', message: 'JSON 을 읽을 수 없음', dest: 'ERROR' }; }
  if (!o || !o.case_id) return { ok: false, status: '형식오류', message: 'case_id 없음', dest: 'ERROR' };
  var users = readTable_('DB_MASTER', 'M_USER');
  var writer = users.filter(function (u) { return u.user_id === String(o.writer_id || '').toLowerCase() && u.status === '사용' && !u.is_deleted; })[0];
  if (!writer) return { ok: false, status: '실패', message: '작성자(writer_id)가 등록 사용자가 아님: ' + o.writer_id, dest: 'ERROR' };
  var user = { user_id: writer.user_id, name: writer.name, role: writer.role, roleLabel: ROLES[writer.role] };
  if (!can_(user.role, 'trend.write')) return { ok: false, status: '실패', message: '동향보고 작성 권한 없음: ' + user.role, dest: 'ERROR' };
  try {
    var c = findCase_(o.case_id);
    if (!canAccessWs_(user, c.wholesaler_id, readTable_('DB_MASTER', 'M_ASSIGNMENT'), todayStr_())) return { ok: false, status: '실패', message: '작성자가 담당하지 않는 중도매인: ' + c.wholesaler_id, dest: 'ERROR' };
    o.official_source = '파일 제출(' + file.getName() + ')';
    o.evidence_ids = '';
    var submit = !!o.result_class;
    var r = saveTrendReport_(user, o, submit);
    appendObjects_('DB_WORK', 'T_ATTACH', [{ attach_id: uid_('AT'), case_id: c.case_id, ref_type: 'TREND', ref_id: r.report_id, kind: '제출본', form_doc_id: '', form_version: '',
      file_id: file.getId(), file_name: file.getName(), file_hash: batch.file_hash, locked: true, created_at: nowStr_(), created_by: user.user_id }]);
    return { ok: true, status: '완료', message: '동향보고 ' + (submit ? '제출' : '임시 저장') + ' → ' + c.case_id + ' v' + r.version + ' (작성 ' + writer.name + ', 결과 ' + (o.result_class || '미분류') + ')', dest: 'DONE' };
  } catch (e) {
    return { ok: false, status: '실패', message: String(e && e.message ? e.message : e), dest: 'ERROR' };
  }
}
