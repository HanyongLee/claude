/**
 * Performance.gs — 실적관리(조회·분석 전용)와 거래·회수 매트릭스
 * - 구매 실적은 부류별(과일·채소·전체), 회전율·회수일수·한도 사용률은 전체 기준만 (배분 근거 없음)
 * - 진행 중인 월은 전년 전체 월과 직접 비교하지 않고 "동일 경과 경매일" 기준으로만 비교한다
 * - 매트릭스는 관리 우선순위 참고용이며 신호·조치에 연결되지 않는다 (MATRIX_DISCLAIMER)
 */

function indexDailyByWs_(daily) {
  var m = {};
  daily.forEach(function (r) { (m[r.wholesaler_id] = m[r.wholesaler_id] || []).push(r); });
  return m;
}

function median_(arr) {
  var a = arr.filter(function (v) { return v !== null && v !== undefined && isFinite(v); }).sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** 월 집계 조회표: ws|ym|cat → row */
function monthlyIndex_(monthly) {
  var idx = {};
  monthly.forEach(function (r) { idx[r.wholesaler_id + '|' + r.ym + '|' + r.category] = r; });
  return idx;
}

function sumMonths_(idx, ws, cat, fromYm, toYm) {
  var amt = 0, days = 0, months = 0;
  for (var ym = fromYm; ym <= toYm; ym = addMonths_(ym, 1)) {
    var r = idx[ws + '|' + ym + '|' + cat];
    if (r) { amt += Number(r.purchase_amount) || 0; days += Number(r.purchase_days) || 0; months++; }
  }
  return { amount: amt, days: days, months: months };
}

/**
 * 중도매인별 실적·회수 요약 (기준일 = 최신 자료일)
 * @return { meta, rows:[{wholesaler_id, name, biz_status, flags, byCategory:{cat:{...}}, turnover, collectionDays, balance, overdue, overdueDays, limitUsage, dataState}] }
 */
function performanceSummary_(user) {
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var settings = readSettings_();
  var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var metrics = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.base_date === (st.signal_base_date || base); });
  var dq = readTable_('DB_AGG', 'A_DQ'), statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');
  var idx = monthlyIndex_(monthly), dailyByWs = indexDailyByWs_(daily);
  var curYm = ymOf_(base), monthComplete = base >= lastAuctionDayOfMonth_(calendar, curYm);
  var lastCompleteYm = monthComplete ? curYm : addMonths_(curYm, -1);
  var from12 = addMonths_(curYm, -11), yearStart = curYm.substring(0, 4) + '-01';
  var mt = {};
  metrics.forEach(function (m) { (mt[m.wholesaler_id] = mt[m.wholesaler_id] || {})[m.metric + '|' + m.category] = m; });
  var dqFrom = addDays_(base, -APP.DQ_LOOKBACK_DAYS), dqBad = {};
  dq.forEach(function (d) { if (d.date > dqFrom && d.date <= base && d.status !== '경고') dqBad[d.wholesaler_id] = true; });
  var newMonths = settingNum_(settings, 'NEW_WS_MONTHS', 12);
  var cats = APP.CATEGORIES.concat([APP.ALL]);
  var market = {};
  cats.forEach(function (c) { market[c] = { amount12: 0, ytd: 0, ytdPrev: 0 }; });

  var rows = accessibleWs_(user).map(function (w) {
    var ws = w.wholesaler_id, m = mt[ws] || {};
    var bizStatus = statusOn_(statusHist, ws, base) || w.biz_status;
    var isNew = w.trade_start_date && addMonths_(ymOf_(w.trade_start_date), newMonths) + '-01' > base;
    var mtd = mtdCompare_(dailyByWs[ws] || [], calendar, ws, base);
    var byCat = {};
    cats.forEach(function (c) {
      var p12 = sumMonths_(idx, ws, c, from12, curYm), ytd = sumMonths_(idx, ws, c, yearStart, lastCompleteYm);
      var ytdPrev = sumMonths_(idx, ws, c, addMonths_(yearStart, -12), addMonths_(lastCompleteYm, -12));
      var lastM = idx[ws + '|' + lastCompleteYm + '|' + c], lastPrev = idx[ws + '|' + addMonths_(lastCompleteYm, -12) + '|' + c];
      byCat[c] = {
        amount12: p12.amount, days12: p12.days, months12: p12.months,
        lastMonth: { ym: lastCompleteYm, amount: lastM ? lastM.purchase_amount : 0, days: lastM ? lastM.purchase_days : 0, prevAmount: lastPrev ? lastPrev.purchase_amount : null, yoy: isNew ? { status: '비교불가', reason: '신규' } : growthRate_(lastM ? lastM.purchase_amount : 0, lastPrev ? lastPrev.purchase_amount : null) },
        ytd: { from: yearStart, to: lastCompleteYm, amount: ytd.amount, prevAmount: ytdPrev.amount, growth: isNew ? { status: '비교불가', reason: '신규' } : growthRate_(ytd.amount, ytdPrev.months ? ytdPrev.amount : null) },
        mtd: monthComplete ? null : { ym: curYm, amount: mtd.byCategory[c].amount, prevAmount: mtd.byCategory[c].prevAmount, growth: mtd.byCategory[c].growth, basis: mtd.basis, elapsed: mtd.elapsedAuctionDays }
      };
      market[c].amount12 += p12.amount; market[c].ytd += ytd.amount; market[c].ytdPrev += ytdPrev.amount;
    });
    var total12 = byCat[APP.ALL].amount12;
    APP.CATEGORIES.forEach(function (c) { byCat[c].shareInWs = total12 > 0 ? byCat[c].amount12 / total12 : null; });
    var g = function (k) { var x = m[k + '|' + APP.ALL]; return x && (x.status === '정상' || x.status === '참고') ? Number(x.value) : null; };
    var gs = function (k) { var x = m[k + '|' + APP.ALL]; return x ? { status: x.status, reason: x.reason, method: x.method, period: x.period_from + '~' + x.period_to } : { status: '산출불가', reason: '지표 없음' }; };
    return { wholesaler_id: ws, name: w.name, biz_status: bizStatus, isNew: !!isNew, categories: w.categories,
      dataState: dqBad[ws] || st.data_status !== '정상' ? '판정보류' : '정상',
      byCategory: byCat, turnover: g('회전율'), turnoverInfo: gs('회전율'), collectionDays: g('회수일수'), balance: g('잔액'),
      overdue: g('연체금액'), overdueDays: g('연체일수'), limitUsage: g('한도사용률'), limitUsageInfo: gs('한도사용률'), avgBalance: g('평균잔액') };
  });
  rows.forEach(function (r) { cats.forEach(function (c) { r.byCategory[c].shareOfMarket = market[c].amount12 > 0 ? r.byCategory[c].amount12 / market[c].amount12 : null; }); });
  var marketGrowth = {};
  cats.forEach(function (c) { marketGrowth[c] = growthRate_(market[c].ytd, market[c].ytdPrev); });
  return {
    meta: { baseDate: base, metricBaseDate: st.signal_base_date || base, lastUpdated: st.last_updated_at || '', dataStatus: st.data_status || '', period12: from12 + ' ~ ' + curYm,
      monthComplete: monthComplete, lastCompleteYm: lastCompleteYm, currentYm: curYm, ytdPeriod: yearStart + ' ~ ' + lastCompleteYm,
      turnoverNote: '회전율·회수일수·한도 사용률은 부류 구분 없이 전체 기준입니다. 부류별 채권 배분 근거가 없어 부류별 회전율을 산출하지 않습니다.',
      partialNote: monthComplete ? '' : curYm + '은 진행 중인 월입니다. 전년 비교는 ' + (rows[0] && rows[0].byCategory[APP.ALL].mtd ? rows[0].byCategory[APP.ALL].mtd.basis : '동일 경과 경매일') + ' 기준으로만 표시하며, 월 전체 증감률은 월 마감 후 표시합니다.',
      monthsAvailable: Object.keys(monthly.reduce(function (o, r) { o[r.ym] = 1; return o; }, {})).length },
    market: market, marketGrowth: marketGrowth, rows: rows
  };
}

/** 상세: 한 중도매인의 24개월 월별 표 + 전년 대응 */
function performanceDetail_(user, wsId) {
  requireWsAccess_(user, wsId);
  var st = readStatus_(), base = st.latest_base_date;
  var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var trend = monthlyTrend_(monthly, indexDailyByWs_(daily)[wsId] || [], calendar, wsId, base, 24);
  var mt = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.wholesaler_id === wsId; });
  var dates = {}; mt.forEach(function (m) { dates[m.base_date] = true; });
  // 회전율 추이: 저장된 기준일별 스냅샷(월말 또는 최신)
  var turnoverHist = mt.filter(function (m) { return m.metric === '회전율' && m.category === APP.ALL && (m.status === '정상' || m.status === '참고'); })
    .map(function (m) { return { base_date: m.base_date, value: Number(m.value), period: m.period_from + '~' + m.period_to }; }).sort(cmpBy_(['base_date']));
  return { wholesaler: stripInternal_(findWs_(wsId)), trend: trend, turnoverHistory: turnoverHist, baseDate: base };
}

/* ───────────── 거래·회수 매트릭스 ───────────── */

function quadrantOf_(x, y, bx, by) {
  var hi = x >= bx, hy = y >= by;
  return hi ? (hy ? 'HH' : 'HL') : (hy ? 'LH' : 'LL');
}

/**
 * @param category 과일|채소|전체 (가로축·색상에만 적용. 세로축 회전율은 전체 기준)
 */
function matrix_(user, category) {
  category = APP.CATEGORIES.indexOf(category) >= 0 ? category : APP.ALL;
  var sum = performanceSummary_(user), settings = readSettings_();
  var included = [], excluded = [];
  var xMode = settings.MATRIX_X_MODE || '전년동월증감';   // 전년동월증감: 가로 = 마감 월 실적의 전년 동월 대비 증감률(%), 경계 0
  sum.rows.forEach(function (r) {
    var c = r.byCategory[category];
    var reason = '';
    if (r.isNew) reason = '신규(거래 ' + settingNum_(settings, 'NEW_WS_MONTHS', 12) + '개월 미만)';
    else if (r.biz_status !== '정상') reason = r.biz_status;
    else if (r.dataState !== '정상') reason = '판정보류(자료 불완전)';
    else if (r.turnover === null) reason = '회전율 ' + (r.turnoverInfo.reason || '산출불가');
    else if (!c.amount12) reason = '해당 부류 구매 없음';
    else if (xMode === '전년동월증감' && c.lastMonth.yoy.status !== '정상') reason = '전년 동월 비교불가(' + c.lastMonth.yoy.reason + ')';
    var x = xMode === '전년동월증감' ? c.lastMonth.yoy.value * 100 : c.amount12;
    var pt = { wholesaler_id: r.wholesaler_id, name: r.name, x: x, y: r.turnover, size: xMode === '전년동월증감' ? c.lastMonth.amount : (r.balance || 0), amount12: c.amount12,
      lastMonth: c.lastMonth.amount, prevYearMonth: c.lastMonth.prevAmount, growth: c.lastMonth.yoy, balance: r.balance, collectionDays: r.collectionDays, overdue: r.overdue };
    if (reason) { pt.reason = reason; excluded.push(pt); } else included.push(pt);
  });
  // 전년 동월 위치(점선 원): 가로 = 전년 동월의 전전년 대비 증감률, 세로 = 전년 동월 말 기준 회전율, 크기 = 전년 동월 실적
  if (xMode === '전년동월증감' && included.length) {
    var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
    var idx = monthlyIndex_(monthly), balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
    var wsAll = {}; readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { wsAll[w.wholesaler_id] = w; });
    var prevYm = addMonths_(sum.meta.lastCompleteYm, -12), prev2Ym = addMonths_(sum.meta.lastCompleteYm, -24);
    var prevEnd = lastAuctionDayOfMonth_(calendar, prevYm);
    included.forEach(function (p) {
      var m1 = idx[p.wholesaler_id + '|' + prevYm + '|' + category], m2 = idx[p.wholesaler_id + '|' + prev2Ym + '|' + category];
      var g = growthRate_(m1 ? m1.purchase_amount : 0, m2 ? m2.purchase_amount : null);
      var w = wsAll[p.wholesaler_id] || {};
      var mt = computeMetrics_({ ws: p.wholesaler_id, baseDate: prevEnd, daily: dailyByWs[p.wholesaler_id] || [], monthly: monthly, calendar: calendar, limits: [], balByDate: balIdx[p.wholesaler_id] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: null });
      var t = mt.byName['회전율|' + APP.ALL];
      p.prev = { ym: prevYm, x: g.status === '정상' ? g.value * 100 : null, y: t && t.status === '정상' ? Number(t.value) : null, size: m1 ? m1.purchase_amount : 0,
        available: g.status === '정상' && !!(t && t.status === '정상'), reason: g.status !== '정상' ? '전전년 실적 없음' : (!t || t.status !== '정상' ? '전년 회전율 산출불가' : '') };
    });
  }
  var bx = xMode === '전년동월증감' ? 0 : median_(included.map(function (p) { return p.x; }));
  var yMode = settings.MATRIX_Y_MODE || '당기중앙값', yFixed = settingNum_(settings, 'MATRIX_Y_FIXED', NaN);
  var by, ySource;
  if ((yMode === '전년고정' || yMode === '목표값') && isFinite(yFixed) && yFixed > 0) { by = yFixed; ySource = yMode + ' (' + (settings.MATRIX_Y_FIXED_SOURCE || '출처 미기재') + ')'; }
  else { by = median_(included.map(function (p) { return p.y; })); ySource = '당기중앙값' + (yMode !== '당기중앙값' ? ' (고정값 미설정으로 대체)' : ''); }
  var counts = { HH: 0, HL: 0, LH: 0, LL: 0 };
  included.forEach(function (p) { p.quadrant = quadrantOf_(p.x, p.y, bx, by); p.quadrantLabel = MATRIX_QUADRANTS[p.quadrant].label; counts[p.quadrant]++; });
  return {
    meta: sum.meta, category: category,
    xMode: xMode,
    axes: xMode === '전년동월증감'
      ? { x: sum.meta.lastCompleteYm + ' 사업실적의 전년 동월 대비 증감률(' + category + ')', y: '최근 3개월 미수금 회전율(전체 기준)', color: '4분면 분류', size: sum.meta.lastCompleteYm + ' 사업실적(구매금액)' }
      : { x: '최근 12개월 구매금액(' + category + ') ' + sum.meta.period12, y: '최근 3개월 미수금 회전율(전체 기준)', color: '전년 동기 누적 대비 구매 증감률', size: '현재 미수금(' + sum.meta.metricBaseDate + ')' },
    boundaries: { x: bx, xSource: xMode === '전년동월증감' ? '전년 동월과 같음(0%)' : '당기중앙값(' + included.length + '명)', y: by, ySource: ySource, computedAt: nowStr_() },
    quadrants: MATRIX_QUADRANTS, counts: counts, points: included, excluded: excluded, disclaimer: MATRIX_DISCLAIMER
  };
}

/**
 * 세로축 고정 기준선 산정: 전년도 각 월말 경매일 기준 회전율을 전 중도매인에 대해 계산하고 그 중앙값들의 중앙값을 쓴다.
 * 결과는 MATRIX_Y_FIXED 에 저장(출처 기록). 연 1회 갱신 권장.
 */
function computeMatrixBaseline_(user) {
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var prevYear = String(Number(base.substring(0, 4)) - 1);
  var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), settings = readSettings_();
  var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
  var monthMedians = [], detail = [];
  for (var m = 1; m <= 12; m++) {
    var ym = prevYear + '-' + (m < 10 ? '0' : '') + m;
    var d = lastAuctionDayOfMonth_(calendar, ym);
    if (d > base || !calendar.some(function (c) { return c.date === d; })) continue;
    var vals = [];
    wholesalers.forEach(function (w) {
      if (statusOn_(statusHist, w.wholesaler_id, d) !== '정상') return;
      var r = computeMetrics_({ ws: w.wholesaler_id, baseDate: d, daily: dailyByWs[w.wholesaler_id] || [], monthly: monthly, calendar: calendar, limits: [],
        balByDate: balIdx[w.wholesaler_id] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: null });
      var t = r.byName['회전율|' + APP.ALL];
      if (t && t.status === '정상') vals.push(Number(t.value));
    });
    var med = median_(vals);
    if (med !== null) { monthMedians.push(med); detail.push({ ym: ym, base_date: d, n: vals.length, median: round2_(med) }); }
  }
  var value = median_(monthMedians);
  if (value === null) throw new Error('전년도(' + prevYear + ') 회전율 자료가 부족합니다.');
  var src = prevYear + '년 월말 회전율 중앙값의 중앙값 (산정 ' + nowStr_() + ', ' + detail.length + '개월)';
  updateSetting_(user, 'MATRIX_Y_FIXED', String(round2_(value)), false, src, '기준선 자동 산정');
  updateSetting_(user, 'MATRIX_Y_FIXED_SOURCE', src, false, '', '기준선 자동 산정');
  return { value: round2_(value), source: src, months: detail };
}
