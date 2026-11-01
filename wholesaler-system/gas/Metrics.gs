/**
 * Metrics.gs — 공통 지표 계산 (순수 함수)
 * 산식(설계 6.1, 내부 기준과 대조 필요):
 *   미수금 회전율 = 기간 외상매출액 ÷ 기간 평균 미수금(일별 잔액 평균, 휴장일은 직전 잔액 유지)
 *   회수일수     = 기간 일수 ÷ 회전율
 *   구매 증감률  = 당기 ÷ 비교기간 − 1
 *   한도 사용률  = 한도 산정 대상 채권액 ÷ 적용 한도  (적용 한도 결합 방식이 '미확인'이면 산출불가)
 * 부류별 채권 배분 근거(CATEGORY_AR_SPLIT)가 없으면 회전율·회수일수·한도 사용률은 '전체'만 산출한다.
 */

function settingNum_(settings, key, fallback) {
  var v = settings[key];
  var n = Number(v);
  return v === undefined || v === '' || !isFinite(n) ? fallback : n;
}

/** 중도매인별 일자 → 잔액 조회표(전체 부류, 경매일 값) */
function balanceIndex_(daily) {
  var idx = {};
  daily.forEach(function (r) {
    if (r.category !== APP.ALL || r.ar_balance === '') return;
    (idx[r.wholesaler_id] = idx[r.wholesaler_id] || {})[r.date] = Number(r.ar_balance);
  });
  return idx;
}

/** 기간 평균 미수금(달력일 기준, 직전 잔액 유지). 기간 시작 전 마지막 잔액을 초기값으로 쓴다. */
function avgBalance_(balByDate, from, to) {
  var dates = Object.keys(balByDate).sort();
  var carry = null, firstKnown = '';
  for (var i = 0; i < dates.length; i++) {
    if (dates[i] < from) carry = balByDate[dates[i]];
    else { firstKnown = dates[i]; break; }
  }
  if (carry === null && !firstKnown) return { avg: null, days: 0, gaps: 0, method: '' };
  var sum = 0, n = 0, known = 0;
  for (var d = from; d <= to; d = addDays_(d, 1)) {
    if (balByDate[d] !== undefined) { carry = balByDate[d]; known++; }
    if (carry !== null) { sum += carry; n++; }
  }
  if (!n) return { avg: null, days: 0, gaps: 0, method: '' };
  return { avg: sum / n, days: n, known: known, method: carry === null ? '' : 'DAILY' };
}

function sumCredit_(daily, ws, category, from, to) {
  var s = 0;
  daily.forEach(function (r) {
    if (r.wholesaler_id === ws && r.category === category && r.date >= from && r.date <= to) s += Number(r.credit_sales) || 0;
  });
  return s;
}

/**
 * 한 중도매인의 기준일 지표 묶음
 * @param p { ws, baseDate, daily, monthly, calendar, limits(유효 승인 버전), statusOn, tradeStart, settings, marketGrowth }
 * @return 지표 배열(A_METRIC 행 형태) + byName 조회
 */
function computeMetrics_(p) {
  var s = p.settings, ws = p.ws, base = p.baseDate, out = [];
  var win = settingNum_(s, 'TURNOVER_WINDOW_DAYS', 91);
  var catSplit = s.CATEGORY_AR_SPLIT && s.CATEGORY_AR_SPLIT !== '불가';
  function push(m) { m.wholesaler_id = ws; m.base_date = base; m.metric_key = ws + '|' + base + '|' + m.metric + '|' + m.category; out.push(m); return m; }
  function ok(metric, cat, value, num, den, from, to, method) {
    return push({ metric: metric, category: cat, value: value, numerator: num, denominator: den, period_from: from, period_to: to, status: '정상', reason: '', method: method || '' });
  }
  function na(metric, cat, status, reason, from, to) {
    return push({ metric: metric, category: cat, value: '', numerator: '', denominator: '', period_from: from || '', period_to: to || '', status: status, reason: reason, method: '' });
  }

  var bal = p.balByDate || {};
  var dates = Object.keys(bal).sort();
  var latestDate = '';
  for (var i = dates.length - 1; i >= 0; i--) if (dates[i] <= base) { latestDate = dates[i]; break; }
  var balance = latestDate ? bal[latestDate] : null;
  if (balance === null) na('잔액', APP.ALL, '산출불가', '잔액 자료 없음');
  else ok('잔액', APP.ALL, balance, balance, 1, latestDate, latestDate);

  // 최근/직전 기간
  var curFrom = addDays_(base, -(win - 1)), prevTo = addDays_(curFrom, -1), prevFrom = addDays_(prevTo, -(win - 1));
  var isNew = p.tradeStart && addMonths_(ymOf_(p.tradeStart), settingNum_(s, 'NEW_WS_MONTHS', 12)) + '-01' > base;

  // 회전율·회수일수 (전체만, 또는 배분 가능 시 부류별)
  var cats = catSplit ? APP.CATEGORIES.concat([APP.ALL]) : [APP.ALL];
  cats.forEach(function (c) {
    [['최근', curFrom, base], ['직전', prevFrom, prevTo]].forEach(function (w) {
      var tag = w[0] === '최근' ? '' : '_직전';
      var credit = sumCredit_(p.daily, ws, c, w[1], w[2]);
      var ab = avgBalance_(bal, w[1], w[2]);
      if (ab.avg === null) { na('회전율' + tag, c, '산출불가', '기간 잔액 자료 없음', w[1], w[2]); na('회수일수' + tag, c, '산출불가', '기간 잔액 자료 없음', w[1], w[2]); return; }
      if (ab.avg <= 0) {
        na('회전율' + tag, c, '산출불가', credit > 0 ? '평균 미수금 0' : '외상거래·미수 없음', w[1], w[2]);
        na('회수일수' + tag, c, '산출불가', '평균 미수금 0', w[1], w[2]);
        return;
      }
      var t = credit / ab.avg;
      var m = ok('회전율' + tag, c, t, credit, Math.round(ab.avg), w[1], w[2], ab.method);
      if (isNew) { m.status = '참고'; m.reason = '신규(거래 ' + settingNum_(s, 'NEW_WS_MONTHS', 12) + '개월 미만)'; }
      if (t > 0) ok('회수일수' + tag, c, ab.days / t, ab.days, t, w[1], w[2], ab.method);
      else na('회수일수' + tag, c, '산출불가', '외상매출 0', w[1], w[2]);
    });
  });
  if (!catSplit) na('회전율', '부류별', '미산출', '부류별 채권 배분 근거 없음(CATEGORY_AR_SPLIT=불가)');

  // 최근 3개월 평균 잔액 (S02)
  var ab3 = avgBalance_(bal, curFrom, base);
  if (ab3.avg !== null) ok('평균잔액', APP.ALL, Math.round(ab3.avg), Math.round(ab3.avg), 1, curFrom, base, ab3.method);

  // 연체 (원천 제공값)
  var latestDaily = null;
  p.daily.forEach(function (r) { if (r.wholesaler_id === ws && r.category === APP.ALL && r.ar_balance !== '' && r.date <= base && (!latestDaily || r.date > latestDaily.date)) latestDaily = r; });
  if (latestDaily) {
    ok('연체금액', APP.ALL, Number(latestDaily.overdue_amount) || 0, Number(latestDaily.overdue_amount) || 0, 1, latestDaily.date, latestDaily.date, s.OVERDUE_DEFINITION || '원천값');
    ok('연체일수', APP.ALL, Number(latestDaily.max_overdue_days) || 0, Number(latestDaily.max_overdue_days) || 0, 1, latestDaily.date, latestDaily.date, s.OVERDUE_DEFINITION || '원천값');
  }

  // 한도 사용률: 결합 방식이 확정되지 않으면 산출하지 않는다
  var applicable = applicableLimit_(p.limits || [], s.LIMIT_COMBINE);
  if (applicable.status !== '정상') na('한도사용률', APP.ALL, '산출불가', applicable.reason);
  else if (balance === null) na('한도사용률', APP.ALL, '산출불가', '잔액 자료 없음');
  else if (applicable.amount <= 0) na('한도사용률', APP.ALL, '산출불가', '적용 한도 0');
  else ok('한도사용률', APP.ALL, balance / applicable.amount, balance, applicable.amount, latestDate, latestDate, applicable.method);

  // 구매 증감 (S04): 당월 동일 경과 경매일, 직전 3개월 평균, 부류 전체 대비
  var mtd = mtdCompare_(p.daily, p.calendar, ws, base);
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) {
    var g = mtd.byCategory[c];
    if (isNew) { na('구매증감_전년', c, '비교불가', '신규'); return; }
    if (g.growth.status !== '정상') na('구매증감_전년', c, '비교불가', g.growth.reason, mtd.prevPeriod);
    else ok('구매증감_전년', c, g.growth.value, g.amount, g.prevAmount, mtd.prevPeriod, base, mtd.basis);
    // 직전 3개월 평균 대비: 당월 경과 경매일 수 × (직전 3개월 일평균)
    var ym = ymOf_(base), sum = 0, days = 0;
    for (var k = 1; k <= 3; k++) {
      var m = p.monthly.filter(function (r) { return r.wholesaler_id === ws && r.ym === addMonths_(ym, -k) && r.category === c; })[0];
      if (m) { sum += Number(m.purchase_amount) || 0; days += Number(m.auction_days) || 0; }
    }
    if (!days || !mtd.elapsedAuctionDays) na('구매증감_3개월', c, '비교불가', '비교기간 자료 없음');
    else {
      var expected = sum / days * mtd.elapsedAuctionDays;
      if (expected <= 0) na('구매증감_3개월', c, '비교불가', '직전 3개월 실적 0');
      else ok('구매증감_3개월', c, g.amount / expected - 1, g.amount, Math.round(expected), addMonths_(ym, -3) + '-01', monthEnd_(addMonths_(ym, -1)), '동일 경과 경매일 환산');
    }
    var mk = p.marketGrowth && p.marketGrowth[c];
    if (mk && mk.status === '정상' && g.growth.status === '정상') ok('구매증감_시장대비', c, g.growth.value - mk.value, g.growth.value, mk.value, mtd.prevPeriod, base, '중도매인 증감률 − 부류 전체 증감률');
    else na('구매증감_시장대비', c, '비교불가', mk ? mk.reason || '중도매인 증감률 없음' : '부류 전체 증감률 없음');
  });

  var byName = {};
  out.forEach(function (m) { byName[m.metric + '|' + m.category] = m; });
  return { rows: out, byName: byName, isNew: !!isNew };
}

/** 적용 한도 결정. 결합 방식은 내부 규정 확인 전까지 '미확인' → 산출불가 */
function applicableLimit_(limits, mode) {
  var by = {};
  limits.forEach(function (l) { by[l.limit_type] = (by[l.limit_type] || 0) + Number(l.amount || 0); });
  if (!mode || mode === '미확인') return { status: '산출불가', reason: '적용 한도 결합 방식 미확인(설정 LIMIT_COMBINE)' };
  if (mode === '기본한도만') return by['기본한도'] ? { status: '정상', amount: by['기본한도'], method: '기본한도만' } : { status: '산출불가', reason: '기본한도 없음' };
  if (mode === '기본+추가') return { status: '정상', amount: (by['기본한도'] || 0) + (by['추가한도'] || 0), method: '기본+추가' };
  if (mode === '전체합산') return { status: '정상', amount: Object.keys(by).reduce(function (s, k) { return s + by[k]; }, 0), method: '전체합산' };
  return { status: '산출불가', reason: '알 수 없는 결합 방식: ' + mode };
}

/** 부류 전체(시장) 증감률: 모든 영업 중 중도매인의 당월 동일 경과일 합계 vs 전년 */
function marketGrowth_(daily, calendar, wsIds, baseDate) {
  var tot = {};
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) { tot[c] = { cur: 0, prev: 0 }; });
  wsIds.forEach(function (ws) {
    var m = mtdCompare_(daily, calendar, ws, baseDate);
    APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) { tot[c].cur += m.byCategory[c].amount; tot[c].prev += m.byCategory[c].prevAmount; });
  });
  var out = {};
  Object.keys(tot).forEach(function (c) { var g = growthRate_(tot[c].cur, tot[c].prev); out[c] = g; out[c].cur = tot[c].cur; out[c].prev = tot[c].prev; });
  return out;
}

/* ───────────── 신호 판정 ───────────── */

/**
 * 규칙별 판정. 데이터 상태가 정상이 아니면 호출하지 않는다(판정 보류).
 * @return [{ rule_id, severity, evidence:{...} }]
 */
function evaluateSignals_(p) {
  var s = p.settings, m = p.metrics.byName, hits = [], bizStatus = p.bizStatus;
  var ALL = APP.ALL;
  function g(name, cat) { return m[name + '|' + (cat || ALL)]; }
  function ev(rule, evidence, severity) { hits.push({ rule_id: rule, severity: severity || SIGNAL_RULES[rule].severity, evidence: evidence }); }

  var inactive = bizStatus === '휴업' || bizStatus === '폐업';
  // S01 회전율 저하
  var t = g('회전율'), tp = g('회전율_직전'), cd = g('회수일수');
  if (t && tp && t.status === '정상' && tp.status === '정상' && cd && cd.status === '정상') {
    var drop = tp.value > 0 ? (1 - t.value / tp.value) * 100 : 0;
    if (drop >= settingNum_(s, 'S01_DROP_PCT', 30) && cd.value >= settingNum_(s, 'S01_MIN_DAYS', 20)) {
      ev('S01', { turnover: round2_(t.value), prevTurnover: round2_(tp.value), dropPct: round2_(drop), collectionDays: round2_(cd.value), period: t.period_from + '~' + t.period_to, prevPeriod: tp.period_from + '~' + tp.period_to, method: t.method });
    }
  }
  // S02 미수금 증가
  var b = g('잔액'), ab = g('평균잔액');
  if (b && ab && b.status === '정상' && ab.status === '정상' && ab.value > 0) {
    var inc = b.value - ab.value;
    if (b.value >= ab.value * settingNum_(s, 'S02_RATIO', 1.3) && inc >= settingNum_(s, 'S02_MIN_AMOUNT', 0)) {
      ev('S02', { balance: b.value, avgBalance: ab.value, ratio: round2_(b.value / ab.value), increase: inc, period: ab.period_from + '~' + ab.period_to });
    }
  }
  // S03 연체
  var od = g('연체금액'), odd = g('연체일수');
  if (od && odd && od.status === '정상' && od.value > 0) {
    var longD = settingNum_(s, 'S03_LONG_DAYS', 30);
    ev('S03', { overdueAmount: od.value, overdueDays: odd.value, stage: odd.value >= longD ? '장기화' : '발생', definition: od.method }, odd.value >= longD ? '위험' : '경고');
  }
  // S04 구매 급감 (신규·휴업·폐업 제외, 이중 조건 + 시장 대비)
  if (!p.metrics.isNew && !inactive) {
    var y = g('구매증감_전년'), m3 = g('구매증감_3개월'), mk = g('구매증감_시장대비');
    if (y && m3 && mk && y.status === '정상' && m3.status === '정상' && mk.status === '정상') {
      if (y.value * 100 <= settingNum_(s, 'S04_YOY_PCT', -40) && m3.value * 100 <= settingNum_(s, 'S04_MA3_PCT', -30) && mk.value * 100 <= settingNum_(s, 'S04_MARKET_GAP_PP', -20)) {
        ev('S04', { yoyPct: round2_(y.value * 100), ma3Pct: round2_(m3.value * 100), vsMarketPp: round2_(mk.value * 100), marketPct: round2_(mk.denominator * 100), basis: y.method, amount: y.numerator, prevAmount: y.denominator });
      }
    }
  }
  // S05 한도 사용률 (결합 방식 미확인이면 참고 신호로만: 산출불가 상태이므로 자동 생성하지 않음)
  var lu = g('한도사용률');
  if (lu && lu.status === '정상') {
    var pct = lu.value * 100, warn = settingNum_(s, 'S05_WARN_PCT', 80), alert = settingNum_(s, 'S05_ALERT_PCT', 95);
    if (pct >= warn) ev('S05', { usagePct: round2_(pct), balance: lu.numerator, limit: lu.denominator, method: lu.method }, pct >= alert ? '경고' : '주의');
  }
  // S06 기한 도래
  (p.expiring || []).forEach(function (x) {
    if (x.dday <= settingNum_(s, 'S06_DAYS', 60)) ev('S06', { kind: x.kind, id: x.id, label: x.label, date: x.date, dday: x.dday }, '정보');
  });
  // S07 복수 징후 (S01~S05 중 2개 이상)
  var risk = hits.filter(function (h) { return ['S01', 'S02', 'S03', 'S04', 'S05'].indexOf(h.rule_id) >= 0; });
  if (risk.length >= settingNum_(s, 'S07_MIN_SIGNALS', 2)) {
    ev('S07', { rules: risk.map(function (h) { return h.rule_id; }) }, '경고');
    risk.forEach(function (h) { h.severity = escalate_(h.severity); });
  }
  return hits;
}

function escalate_(sev) { return { '정보': '주의', '주의': '경고', '경고': '위험', '위험': '위험' }[sev] || sev; }
function round2_(v) { return Math.round(v * 100) / 100; }

/**
 * 신호 구간 갱신(순수): 기존 열린 신호와 이번 판정 결과를 맞춰 변경 목록을 낸다.
 * @param existing 해당 중도매인의 status in (연결, 보류) 신호
 * @param hits 이번 판정
 * @param dataOk 이번 기준일 데이터 정상 여부
 * @return { create:[], update:[] }  (update 는 기존 행 객체를 수정해 반환)
 */
function diffSignals_(existing, hits, baseDate, dataOk, settings, paramsJson) {
  var create = [], update = [], seen = {};
  var missN = settingNum_(settings, 'RESOLVE_MISS_N', 5);
  existing.forEach(function (sg) {
    seen[sg.rule_id] = sg;
    if (!dataOk) { if (sg.status !== '보류') { sg.status = '보류'; update.push(sg); } return; }
    var hit = hits.filter(function (h) { return h.rule_id === sg.rule_id; })[0];
    if (hit) {
      sg.status = '연결'; sg.last_date = baseDate; sg.miss_count = 0; sg.severity = hit.severity;
      sg.evidence_json = JSON.stringify(hit.evidence); sg.params_json = paramsJson;
      update.push(sg);
    } else {
      sg.miss_count = Number(sg.miss_count || 0) + 1;
      if (sg.status === '보류') sg.status = '연결';
      if (sg.miss_count >= missN) { sg.status = '해소'; sg.resolved_date = baseDate; }
      update.push(sg);
    }
  });
  if (dataOk) hits.forEach(function (h) {
    if (seen[h.rule_id]) return;
    create.push({ rule_id: h.rule_id, severity: h.severity, status: '발생', first_date: baseDate, last_date: baseDate,
      miss_count: 0, evidence_json: JSON.stringify(h.evidence), params_json: paramsJson, resolved_date: '', false_alarm_reason: '' });
  });
  return { create: create, update: update };
}

/**
 * 관리 건 연결 규칙(설계 5.5): 열린 관리 건이 있으면 연결, 종결 후 재발 기간 내 같은 계열이면 재발, 아니면 신규.
 * S06(기한 도래)만 있으면 관리 건을 만들지 않는다.
 * @return { action: 'link' | 'recur' | 'new' | 'none', caseId?, parentId? }
 */
function decideCase_(cases, newSignals, baseDate, settings) {
  var risky = newSignals.filter(function (s) { return s.rule_id !== 'S06'; });
  if (!risky.length) return { action: 'none' };
  var open = cases.filter(function (c) { return c.status !== '종결' && !c.is_deleted; })[0];
  if (open) return { action: 'link', caseId: open.case_id };
  var recurDays = settingNum_(settings, 'RECURRENCE_DAYS', 90);
  var recent = cases.filter(function (c) { return c.status === '종결' && c.closed_date && daysBetween_(c.closed_date, baseDate) <= recurDays; })
    .sort(function (a, b) { return a.closed_date < b.closed_date ? 1 : -1; })[0];
  if (recent) return { action: 'recur', parentId: recent.case_id };
  return { action: 'new' };
}

/** 경매일 기준 n일 뒤 */
function addAuctionDays_(calendar, from, n) {
  var days = calendar.filter(function (c) { return c.is_auction_day && c.date > from; }).map(function (c) { return c.date; }).sort();
  return days[n - 1] || addDays_(from, n);
}
