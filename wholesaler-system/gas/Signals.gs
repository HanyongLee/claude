/**
 * Signals.gs — 정기 처리의 지표·신호 단계 (저장소 접근 포함)
 * 순서: 설정 읽기 → 중도매인별 지표 계산 → A_METRIC 저장 → 신호 판정 → 신호 구간 갱신 → 관리 건 연결/생성 → 기한 갱신
 * 데이터 상태가 정상이 아닌 기준일에는 신호를 판정하지 않고 기존 신호를 '보류'로 둔다.
 */

function readSettings_() {
  var m = {};
  readTable_('DB_MASTER', 'M_SETTING').forEach(function (r) { if (!r.is_deleted) m[r.key] = r.value; });
  return m;
}

function settingsSnapshotJson_(settings) {
  var keys = Object.keys(settings).filter(function (k) { return /^S0\d_|^RESOLVE|^TURNOVER|^NEW_WS|^LIMIT|^OVERDUE|^CATEGORY/.test(k); }).sort();
  var o = {};
  keys.forEach(function (k) { o[k] = settings[k]; });
  return JSON.stringify(o);
}

function expiringFor_(wsId, asOf, settings) {
  var warnTo = addDays_(asOf, settingNum_(settings, 'S06_DAYS', 60)), out = [];
  asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', wsId, asOf).forEach(function (c) {
    if (c.expiry_date && c.expiry_date >= asOf && c.expiry_date <= warnTo)
      out.push({ kind: '담보', id: c.collateral_id, label: c.collateral_type, date: c.expiry_date, dday: daysBetween_(asOf, c.expiry_date) });
  });
  asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', wsId, asOf).forEach(function (g) {
    if (g.period_to && g.period_to >= asOf && g.period_to <= warnTo)
      out.push({ kind: '보증', id: g.guarantee_id, label: g.scope || '연대보증', date: g.period_to, dday: daysBetween_(asOf, g.period_to) });
  });
  return out;
}

/**
 * 지표·신호 단계. aggregateAll_ 뒤에 실행한다.
 * @return { metrics, signalsCreated, signalsUpdated, casesCreated, held }
 */
function evaluateAll_(runId, trigger) {
  var started = nowStr_();
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) { logJob_(runId, 'SIGNALS', '건너뜀', started, 0, 0, '기준일 없음', trigger); return { held: true }; }
  var settings = readSettings_(), paramsJson = settingsSnapshotJson_(settings);
  var dataOk = st.data_status === '정상';
  var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var dq = readTable_('DB_AGG', 'A_DQ');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');
  var limitsAll = readTable_('DB_MASTER', 'M_LIMIT');
  var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
  var activeIds = wholesalers.filter(function (w) { return statusOn_(statusHist, w.wholesaler_id, base) === '정상'; }).map(function (w) { return w.wholesaler_id; });
  var market = marketGrowth_(daily, calendar, activeIds, base);

  var metricRows = [], hitsByWs = {}, wsDataOk = {};
  wholesalers.forEach(function (w) {
    var ws = w.wholesaler_id;
    var limits = asOfVersions_(limitsAll, 'limit_id', ws, base);
    var m = computeMetrics_({ ws: ws, baseDate: base, daily: dailyByWs[ws] || [], monthly: monthly, calendar: calendar, limits: limits,
      balByDate: balIdx[ws] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: market });
    m.rows.forEach(function (r) { r.calc_run_id = runId; metricRows.push(r); });
    // 중도매인 단위 데이터 상태: 전체 정상 + 최근 30일 누락·불일치 없음
    var from = addDays_(base, -APP.DQ_LOOKBACK_DAYS);
    var bad = dq.some(function (d) { return d.wholesaler_id === ws && d.date > from && d.date <= base && d.status !== '경고'; });
    wsDataOk[ws] = dataOk && !bad;
    hitsByWs[ws] = wsDataOk[ws] ? evaluateSignals_({ settings: settings, metrics: m, bizStatus: statusOn_(statusHist, ws, base),
      expiring: expiringFor_(ws, base, settings) }) : [];
  });
  // 기준일별 스냅샷: 같은 기준일 행은 교체, 다른 기준일은 보존
  var kept = readTable_('DB_AGG', 'A_METRIC').filter(function (r) { return r.base_date !== base; }).map(stripInternal_);
  rewriteTable_('DB_AGG', 'A_METRIC', kept.concat(metricRows));

  // 신호 구간 갱신 + 관리 건
  var signals = readTable_('DB_WORK', 'T_SIGNAL'), cases = readTable_('DB_WORK', 'T_CASE');
  var created = 0, updated = 0, casesCreated = 0, newRows = [], now = nowStr_();
  var sys = ownerAsUser_();
  wholesalers.forEach(function (w) {
    var ws = w.wholesaler_id;
    var open = signals.filter(function (s) { return s.wholesaler_id === ws && (s.status === '연결' || s.status === '보류' || s.status === '발생'); });
    var d = diffSignals_(open, hitsByWs[ws], base, wsDataOk[ws], settings, paramsJson);
    d.update.forEach(function (s) { s.updated_at = now; writeObject_('DB_WORK', 'T_SIGNAL', s); updated++; });
    if (!d.create.length) return;
    var wsCases = cases.filter(function (c) { return c.wholesaler_id === ws; });
    var decision = decideCase_(wsCases, d.create, base, settings);
    var caseId = '';
    if (decision.action === 'link') caseId = decision.caseId;
    else if (decision.action === 'new' || decision.action === 'recur') {
      var c = createCase_(sys, ws, base, decision.action === 'recur' ? decision.parentId : '', '자동(신호)', settings, calendar);
      cases.push(c); caseId = c.case_id; casesCreated++;
    }
    d.create.forEach(function (s) {
      s.signal_id = uid_('SG'); s.wholesaler_id = ws; s.case_id = caseId; s.status = caseId ? '연결' : '발생'; s.updated_at = now;
      newRows.push(s); created++;
    });
  });
  appendObjects_('DB_WORK', 'T_SIGNAL', newRows);
  invalidate_('DB_WORK', 'T_SIGNAL');
  mergeStatus_({ signal_base_date: base, signal_params: paramsJson, signals_open: String(readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.status === '연결' || s.status === '보류'; }).length) });
  logJob_(runId, 'SIGNALS', '완료', started, metricRows.length, 0,
    '지표 ' + metricRows.length + ' / 신호 생성 ' + created + ' 갱신 ' + updated + ' / 관리 건 생성 ' + casesCreated + (dataOk ? '' : ' / 데이터 상태 ' + st.data_status + ' → 신호 판정 보류'), trigger);
  return { metrics: metricRows.length, signalsCreated: created, signalsUpdated: updated, casesCreated: casesCreated, held: !dataOk };
}

/** 관리 건 생성(잠금 밖에서 호출하지 않는다: evaluateAll_ 은 파이프라인 잠금 안, 수동 생성은 withLock_ 안) */
function createCase_(user, wsId, openedDate, parentId, origin, settings, calendar) {
  var assignees = readTable_('DB_MASTER', 'M_ASSIGNMENT').filter(function (a) {
    return a.wholesaler_id === wsId && !a.is_deleted && a.valid_from <= openedDate && openedDate <= (a.valid_to || APP.OPEN_END);
  });
  var seq = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return c.case_id.indexOf('C-' + openedDate.substring(0, 4)) === 0; }).length + 1;
  var row = {
    case_id: 'C-' + openedDate.substring(0, 4) + '-' + ('0000' + seq).slice(-4), wholesaler_id: wsId,
    status: assignees.length ? '동향확인중' : '접수', owner_id: '', auctioneer_id: assignees.length ? assignees[0].user_id : '',
    opened_date: openedDate, origin: origin, parent_case_id: parentId || '', is_recurrence: !!parentId,
    trend_due: assignees.length ? addAuctionDays_(calendar, openedDate, settingNum_(settings, 'SLA_TREND_DAYS', 3)) : '',
    action_due: '', result_class: '', close_reason: '', closed_date: '', recheck_date: '', basis_snapshot_id: '', summary: ''
  };
  Object.assign(row, newAuditFields_(user));
  appendObjects_('DB_WORK', 'T_CASE', [row]);
  appendObjects_('DB_WORK', 'T_CASE_HIST', [{ hist_id: uid_('CH'), case_id: row.case_id, from_status: '', to_status: row.status,
    reason: origin + (parentId ? ' / 재발(이전 ' + parentId + ')' : ''), at: nowStr_(), user_id: user.user_id }]);
  audit_(user, 'CREATE', 'DB_WORK', 'T_CASE', row.case_id, null, row, origin);
  return row;
}
