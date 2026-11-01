/**
 * Backtest.gs — 신호 기준값 백테스트와 그림자 운영 집계
 * 백테스트: 과거 기준일(표본 간격마다)에서 현재(또는 임시) 기준값으로 신호를 다시 판정하고,
 *           정답 표본(M_BACKTEST_TRUTH: 과거 실제 사안)과 대조해 포착률·적중률·선행기간·업무량을 낸다.
 * 실행시간 제한 때문에 기준일 단위로 나눠 처리하고 진행 상태를 A_BACKTEST_RUN 에 남긴다.
 * 정답 표본이 적으면(수십 건 이하) 통계적 최적화가 불가능하므로 결과에 표본 수를 함께 표시한다.
 */

var BT_STATE_KEY = 'BACKTEST_RUN_ID';

function startBacktest_(user, opts) {
  opts = opts || {};
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var settings = readSettings_();
  var overrides = opts.overrides || {};
  Object.keys(overrides).forEach(function (k) { if (!(k in settings)) throw new Error('없는 설정 키: ' + k); });
  var sample = Math.max(1, Number(opts.sampleDays) || settingNum_(settings, 'BACKTEST_SAMPLE_DAYS', 5));
  var from = optDate_(opts.dateFrom, '시작일') || addMonths_(ymOf_(base), -12) + '-01';
  var to = optDate_(opts.dateTo, '종료일') || base;
  if (to > base) to = base;
  var dates = readTable_('DB_MASTER', 'M_CALENDAR').filter(function (c) { return c.is_auction_day && c.date >= from && c.date <= to; }).map(function (c) { return c.date; }).sort()
    .filter(function (d, i) { return i % sample === 0; });
  if (!dates.length) throw new Error('기간 내 경매일이 없습니다.');
  return withLock_(function () {
    if (prop_(BT_STATE_KEY)) throw new Error('진행 중인 백테스트가 있습니다(' + prop_(BT_STATE_KEY) + '). 완료 후 다시 시도하세요.');
    var run = { run_id: uid_('BT'), status: '진행', params_json: JSON.stringify({ overrides: overrides, user: user.user_id }), date_from: dates[0], date_to: dates[dates.length - 1],
      sample_days: sample, dates_total: dates.length, dates_done: 0, next_index: 0, started_at: nowStr_(), finished_at: '', summary_json: '', message: '' };
    appendObjects_('DB_AGG', 'A_BACKTEST_RUN', [run]);
    setProp_(BT_STATE_KEY, run.run_id);
    setProp_('BT_DATES_' + run.run_id, JSON.stringify(dates));
    audit_(user, 'START_BACKTEST', 'DB_AGG', 'A_BACKTEST_RUN', run.run_id, null, run, '백테스트 시작');
    return run;
  });
}

/** 진행: 시간 예산 안에서 기준일을 처리하고 남으면 이어서 실행 트리거를 건다 */
function continueBacktest_(timeBudgetMs, trigger) {
  var runId = prop_(BT_STATE_KEY);
  if (!runId) return { status: '없음' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: '건너뜀' };
  var t0 = Date.now(), started = nowStr_();
  try {
    invalidate_('DB_AGG', 'A_BACKTEST_RUN');
    var run = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
    var dates = JSON.parse(prop_('BT_DATES_' + runId) || '[]');
    var params = JSON.parse(run.params_json || '{}');
    var settings = readSettings_();
    Object.keys(params.overrides || {}).forEach(function (k) { settings[k] = String(params.overrides[k]); });
    var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
    var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
    var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), limitsAll = readTable_('DB_MASTER', 'M_LIMIT');
    var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
    var hits = [], i = Number(run.next_index) || 0;
    for (; i < dates.length; i++) {
      if (Date.now() - t0 > timeBudgetMs) break;
      var d = dates[i];
      var active = wholesalers.filter(function (w) { return statusOn_(statusHist, w.wholesaler_id, d) === '정상'; }).map(function (w) { return w.wholesaler_id; });
      var market = marketGrowth_(daily, calendar, active, d);
      wholesalers.forEach(function (w) {
        var ws = w.wholesaler_id;
        if (w.trade_start_date && w.trade_start_date > d) return;
        var m = computeMetrics_({ ws: ws, baseDate: d, daily: dailyByWs[ws] || [], monthly: monthly, calendar: calendar, limits: asOfVersions_(limitsAll, 'limit_id', ws, d),
          balByDate: balIdx[ws] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: market });
        evaluateSignals_({ settings: settings, metrics: m, bizStatus: statusOn_(statusHist, ws, d), expiring: [] }).forEach(function (h) {
          if (h.rule_id === 'S06') return;
          hits.push({ run_id: runId, base_date: d, wholesaler_id: ws, rule_id: h.rule_id, severity: h.severity, evidence_json: JSON.stringify(h.evidence) });
        });
      });
    }
    appendObjects_('DB_AGG', 'A_BACKTEST_HIT', hits);
    run.dates_done = i; run.next_index = i;
    if (i >= dates.length) {
      run.status = '완료'; run.finished_at = nowStr_();
      run.summary_json = JSON.stringify(backtestSummary_(runId, settings));
      PropertiesService.getScriptProperties().deleteProperty(BT_STATE_KEY);
      PropertiesService.getScriptProperties().deleteProperty('BT_DATES_' + runId);
      clearBacktestTriggers_();
    } else {
      run.message = dates.length + '개 기준일 중 ' + i + '개 처리';
      clearBacktestTriggers_();
      ScriptApp.newTrigger('triggerContinueBacktest').timeBased().after(APP.CONTINUE_AFTER_MS).create();
    }
    writeObject_('DB_AGG', 'A_BACKTEST_RUN', run);
    logJob_(runId, 'BACKTEST', run.status, started, i, 0, run.message || '완료', trigger || '');
    return { status: run.status, done: i, total: dates.length, run_id: runId };
  } catch (e) {
    try {
      var r2 = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
      if (r2) { r2.status = '실패'; r2.message = String(e && e.message ? e.message : e); r2.finished_at = nowStr_(); writeObject_('DB_AGG', 'A_BACKTEST_RUN', r2); }
      PropertiesService.getScriptProperties().deleteProperty(BT_STATE_KEY);
      logJob_(runId, 'BACKTEST', '실패', started, 0, 1, String(e && e.message ? e.message : e), trigger || '');
    } catch (ignore) { /* 기록 실패가 원래 오류를 가리지 않도록 */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function clearBacktestTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'triggerContinueBacktest') ScriptApp.deleteTrigger(t); });
}

/** [트리거] 백테스트 이어서 실행 */
function triggerContinueBacktest() {
  requireOwnerOrTrigger_();
  return continueBacktest_(APP.JOB_TIME_BUDGET_MS, '이어서');
}

/**
 * 요약: 포착률(사안 전 LEAD_MAX 일 이내 신호), 적중률(신호 후 HORIZON 일 이내 사안), 선행기간, 주당 경보량
 * 신호 구간: 같은 (ws, rule) 의 연속 표본 기준일을 한 "경보"로 센다(운영의 신호 구간과 같은 개념)
 */
function backtestSummary_(runId, settings) {
  var hits = readTable_('DB_AGG', 'A_BACKTEST_HIT').filter(function (h) { return h.run_id === runId; });
  var run = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
  var truth = readTable_('DB_MASTER', 'M_BACKTEST_TRUTH').filter(function (t) { return !t.is_deleted && t.event_date >= addDays_(run.date_from, -settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90)) && t.event_date <= addDays_(run.date_to, settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90)); });
  var leadMax = settingNum_(settings, 'BACKTEST_LEAD_MAX_DAYS', 90), horizon = settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90);
  var dates = JSON.parse(prop_('BT_DATES_' + runId) || 'null') || hits.map(function (h) { return h.base_date; }).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  var gap = Number(run.sample_days) || 1;
  // 경보(구간) 만들기
  var byKey = {};
  hits.forEach(function (h) { (byKey[h.wholesaler_id + '|' + h.rule_id] = byKey[h.wholesaler_id + '|' + h.rule_id] || []).push(h.base_date); });
  var alerts = [];
  Object.keys(byKey).forEach(function (k) {
    var ds = byKey[k].sort(), p = k.split('|'), cur = null;
    ds.forEach(function (d) {
      var idx = dates.indexOf(d), prevIdx = cur ? dates.indexOf(cur.last) : -1;
      if (cur && idx - prevIdx <= 1) cur.last = d;
      else { if (cur) alerts.push(cur); cur = { wholesaler_id: p[0], rule_id: p[1], first: d, last: d }; }
    });
    if (cur) alerts.push(cur);
  });
  var riskAlerts = alerts.filter(function (a) { return a.rule_id !== 'S07'; });
  // 포착률: 사안별로 [event-leadMax, event] 안에 시작/진행 중인 경보가 있는가
  var captured = 0, leads = [];
  var truthDetail = truth.map(function (t) {
    var hit = riskAlerts.filter(function (a) { return a.wholesaler_id === t.wholesaler_id && a.first <= t.event_date && a.last >= addDays_(t.event_date, -leadMax); })
      .sort(function (x, y) { return x.first < y.first ? -1 : 1; })[0];
    if (hit) { captured++; leads.push(daysBetween_(hit.first, t.event_date)); }
    return { wholesaler_id: t.wholesaler_id, event_date: t.event_date, event_type: t.event_type, captured: !!hit, first_signal: hit ? hit.first : '', rule: hit ? hit.rule_id : '', lead_days: hit ? daysBetween_(hit.first, t.event_date) : null };
  });
  // 적중률: 경보 중 horizon 안에 같은 ws 의 사안이 있는 비율
  var precise = riskAlerts.filter(function (a) { return truth.some(function (t) { return t.wholesaler_id === a.wholesaler_id && t.event_date >= a.first && t.event_date <= addDays_(a.last, horizon); }); }).length;
  // 업무량: 경매사별 주당 경보 시작 수 (표본 간격 보정 없음 — 표본일 기준 그대로)
  var asg = readTable_('DB_MASTER', 'M_ASSIGNMENT'), names = userNameMap_();
  var weeks = Math.max(1, daysBetween_(run.date_from, run.date_to) / 7);
  var byAuc = {};
  riskAlerts.forEach(function (a) {
    var who = asg.filter(function (x) { return x.wholesaler_id === a.wholesaler_id && !x.is_deleted && x.valid_from <= a.first && a.first <= (x.valid_to || APP.OPEN_END); })[0];
    var k = who ? (names[who.user_id] || who.user_id) : '(미지정)';
    byAuc[k] = (byAuc[k] || 0) + 1;
  });
  var byRule = {};
  alerts.forEach(function (a) { byRule[a.rule_id] = (byRule[a.rule_id] || 0) + 1; });
  return {
    dates: dates.length, sample_days: gap, period: run.date_from + ' ~ ' + run.date_to, truth_count: truth.length, alerts: riskAlerts.length,
    capture_rate: truth.length ? captured / truth.length : null, captured: captured,
    precision: riskAlerts.length ? precise / riskAlerts.length : null, precise: precise,
    lead_days_median: median_(leads), lead_days: leads,
    alerts_per_week: riskAlerts.length / weeks, alerts_per_auctioneer_week: Object.keys(byAuc).map(function (k) { return { auctioneer: k, per_week: round2_(byAuc[k] / weeks), total: byAuc[k] }; }),
    by_rule: byRule, truth_detail: truthDetail,
    caveat: truth.length < 30 ? '정답 표본이 ' + truth.length + '건으로 적어 통계적 최적화는 불가능합니다. 업무량 상한(경매사 1인당 주간 경보 수)을 기준으로 정하고 운영하며 조정하세요.' : ''
  };
}

/** 그림자 운영 집계: 운영 신호의 오탐·일시적 변화 비율, 경매사별 주간 경보량 (최근 N주) */
function shadowStats_(weeks) {
  weeks = Number(weeks) || 8;
  var today = todayStr_(), from = addDays_(today, -weeks * 7);
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.first_date >= from && s.rule_id !== 'S06'; });
  var cases = readTable_('DB_WORK', 'T_CASE');
  var names = userNameMap_(), asg = readTable_('DB_MASTER', 'M_ASSIGNMENT');
  var byRule = {}, byAuc = {}, falseAlarm = 0, temporary = 0, resolvedNoAction = 0;
  signals.forEach(function (s) {
    var r = byRule[s.rule_id] = byRule[s.rule_id] || { rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id].label, total: 0, false_alarm: 0, resolved: 0, active: 0 };
    r.total++;
    if (s.status === '오탐확정') { r.false_alarm++; falseAlarm++; }
    else if (s.status === '해소') r.resolved++;
    else r.active++;
    var who = asg.filter(function (x) { return x.wholesaler_id === s.wholesaler_id && !x.is_deleted && x.valid_from <= s.first_date && s.first_date <= (x.valid_to || APP.OPEN_END); })[0];
    var k = who ? (names[who.user_id] || who.user_id) : '(미지정)';
    byAuc[k] = (byAuc[k] || 0) + 1;
  });
  cases.forEach(function (c) {
    if (c.opened_date < from) return;
    if (c.result_class === '일시적 변화') temporary++;
    if (c.close_reason === '해소 확인' && !readTable_('DB_WORK', 'T_ACTION').some(function (a) { return a.case_id === c.case_id; })) resolvedNoAction++;
  });
  var total = signals.length;
  return { weeks: weeks, from: from, to: today, total_signals: total,
    false_alarm_rate: total ? (falseAlarm + temporary) / total : null, false_alarm: falseAlarm, temporary_change_cases: temporary, resolved_without_action: resolvedNoAction,
    by_rule: Object.keys(byRule).map(function (k) { return byRule[k]; }),
    per_auctioneer_week: Object.keys(byAuc).map(function (k) { return { auctioneer: k, per_week: round2_(byAuc[k] / weeks), total: byAuc[k] }; }),
    note: '불필요한 경보 비율 = (오탐 확정 + 일시적 변화 종결) ÷ 전체 신호. 그림자 운영 기간에는 업무 배정 없이 이 수치와 경매사별 주간 경보량만 관찰한다.' };
}
