/**
 * Logic.gs — 공통 업무 로직 (순수 함수)
 * Google 서비스를 호출하지 않는다. 날짜는 모두 'yyyy-MM-dd' 문자열로 다룬다.
 * 같은 산식·판정을 화면·정기 처리·테스트가 함께 쓰도록 이 파일에만 둔다.
 */

/* ───────────── 날짜 ───────────── */

function ymdToUtc_(ymd) {
  var p = String(ymd).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function utcToYmd_(ms) {
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
function addDays_(ymd, n) { return utcToYmd_(ymdToUtc_(ymd) + n * 86400000); }
function daysBetween_(a, b) { return Math.round((ymdToUtc_(b) - ymdToUtc_(a)) / 86400000); }
function ymOf_(ymd) { return String(ymd).substring(0, 7); }
function dowOf_(ymd) { return new Date(ymdToUtc_(ymd)).getUTCDay(); }
function addMonths_(ym, n) {
  var y = +ym.substring(0, 4), m = +ym.substring(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function monthEnd_(ym) { return addDays_(addMonths_(ym, 1) + '-01', -1); }
function isYmd_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  return utcToYmd_(ymdToUtc_(s)) === s;
}
function dateRange_(from, to) {
  var out = [];
  for (var d = from; d <= to; d = addDays_(d, 1)) out.push(d);
  return out;
}

/* ───────────── 해시 (변경 감지용, 보안 목적 아님) ───────────── */

function fnv1a_(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* ───────────── CSV ───────────── */

function parseCsv_(text) {
  text = String(text).replace(/^﻿/, '');
  var rows = [], row = [], field = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
}

function toCsvLine_(arr) {
  return arr.map(function (v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

function detectSource_(fileName) {
  var n = String(fileName).toUpperCase();
  for (var k in SOURCE_SPEC) if (n.indexOf(SOURCE_SPEC[k].prefix) === 0) return k;
  return null;
}

/* ───────────── 가져오기 검증 ───────────── */

/**
 * 원천 파일 1개를 검증·분류한다.
 * @param text 파일 내용
 * @param source SALES | RECEIPT | AR_BAL
 * @param ctx { wholesalerIds: {id:true}, existing: {row_key: content_hash} }  existing 은 이 함수가 갱신한다
 * @return {accepted[], duplicates, revisions, rejects[], control, controlResult, dateFrom, dateTo, acceptedAmount, rowCount}
 */
function validateImport_(text, source, ctx) {
  var spec = SOURCE_SPEC[source];
  var lines = parseCsv_(text);
  var res = { accepted: [], duplicates: 0, revisions: 0, rejects: [], control: null,
    controlResult: '', dateFrom: '', dateTo: '', acceptedAmount: 0, rowCount: 0, fatal: '' };
  if (!lines.length) { res.fatal = '빈 파일'; return res; }

  var header = lines[0].map(function (h) { return String(h).trim(); });
  var missing = spec.cols.filter(function (c) { return header.indexOf(c) < 0; });
  if (missing.length) { res.fatal = '헤더 누락: ' + missing.join(', '); return res; }

  var seenInFile = {};
  for (var i = 1; i < lines.length; i++) {
    var ln = lines[i];
    if (String(ln[0]).trim() === '#CONTROL') {
      res.control = { rows: Number(ln[1]), amount: Number(ln[2]) };
      continue;
    }
    res.rowCount++;
    var o = {};
    header.forEach(function (h, j) { o[h] = ln[j] === undefined ? '' : String(ln[j]).trim(); });
    var err = validateRow_(source, o, ctx);
    if (err) { res.rejects.push({ line: i + 1, code: err[0], msg: err[1], raw: toCsvLine_(ln) }); continue; }

    var rec = normalizeRow_(source, o);
    rec.row_key = spec.key.map(function (k) { return rec[k]; }).join('|');
    rec.content_hash = fnv1a_(spec.cols.map(function (k) { return rec[k]; }).join('|'));

    if (seenInFile[rec.row_key]) {
      res.rejects.push({ line: i + 1, code: 'DUP_IN_FILE', msg: '같은 파일 안에 같은 키가 중복됨: ' + rec.row_key, raw: toCsvLine_(ln) });
      continue;
    }
    seenInFile[rec.row_key] = true;

    var prev = ctx.existing[rec.row_key];
    if (prev !== undefined) {
      if (prev === rec.content_hash) { res.duplicates++; continue; }   // 이미 적재된 같은 자료
      if (spec.onConflict === 'REJECT') {
        res.rejects.push({ line: i + 1, code: 'KEY_CONFLICT',
          msg: '이미 적재된 키의 내용이 다름(정정은 새 거래번호로 보내야 함): ' + rec.row_key, raw: toCsvLine_(ln) });
        continue;
      }
      rec.is_revision = true;
      res.revisions++;
    } else if (source === 'AR_BAL') rec.is_revision = false;

    ctx.existing[rec.row_key] = rec.content_hash;
    res.accepted.push(rec);
    res.acceptedAmount += Number(rec[spec.amountField]);
    var d = rec[spec.dateField];
    if (!res.dateFrom || d < res.dateFrom) res.dateFrom = d;
    if (!res.dateTo || d > res.dateTo) res.dateTo = d;
  }

  // 관리 합계 대조: 원천이 보낸 행 수·금액 합계 vs 이 파일에서 실제로 읽은 행 수·금액 합계
  // (전송 중 잘림·누락 확인용. 거부·중복 행도 원천 합계에는 포함되므로 읽은 값 전체와 비교)
  if (!res.control) res.controlResult = '관리합계없음';
  else {
    var amtIdx = header.indexOf(spec.amountField), readAmount = 0;
    for (var r = 1; r < lines.length; r++) {
      if (String(lines[r][0]).trim() === '#CONTROL') continue;
      readAmount += Number(lines[r][amtIdx]) || 0;
    }
    var fileOk = res.control.rows === res.rowCount && Math.abs(res.control.amount - readAmount) < 0.5;
    res.controlResult = fileOk ? (res.rejects.length ? '파일일치·일부거부' : '일치') : '불일치';
  }
  return res;
}

function validateRow_(source, o, ctx) {
  var num = function (v) { return v !== '' && isFinite(Number(v)); };
  if (!ctx.wholesalerIds[o.wholesaler_id]) return ['UNKNOWN_WS', '기초자료에 없는 중도매인코드: ' + o.wholesaler_id];
  if (source === 'SALES') {
    if (!o.source_txn_no) return ['REQUIRED', '거래번호 없음'];
    if (!isYmd_(o.txn_date)) return ['BAD_DATE', '거래일 형식 오류: ' + o.txn_date];
    if (APP.CATEGORIES.indexOf(o.category) < 0) return ['BAD_CATEGORY', '부류 오류: ' + o.category];
    if (!num(o.amount)) return ['BAD_AMOUNT', '금액 오류: ' + o.amount];
    if (['현금', '외상'].indexOf(o.txn_type) < 0) return ['BAD_TXN_TYPE', '거래구분 오류(현금/외상): ' + o.txn_type];
    var ct = o.correction_type || '정상';
    if (['정상', '반품', '취소', '정정'].indexOf(ct) < 0) return ['BAD_CORRECTION', '정정구분 오류: ' + ct];
    if (ct === '정상' && Number(o.amount) < 0) return ['NEGATIVE_AMOUNT', '정상 거래의 음수 금액'];
    if (ct !== '정상' && !o.orig_txn_no) return ['ORIG_REQUIRED', '반품·취소·정정은 원거래번호 필요'];
  } else if (source === 'RECEIPT') {
    if (!o.source_receipt_no) return ['REQUIRED', '입금번호 없음'];
    if (!isYmd_(o.receipt_date) || !isYmd_(o.posted_date)) return ['BAD_DATE', '입금일·반영일 형식 오류'];
    if (o.posted_date < o.receipt_date) return ['BAD_DATE', '반영일이 입금일보다 빠름'];
    if (!num(o.amount)) return ['BAD_AMOUNT', '금액 오류: ' + o.amount];
  } else if (source === 'AR_BAL') {
    if (!isYmd_(o.base_date)) return ['BAD_DATE', '기준일 형식 오류: ' + o.base_date];
    if (!num(o.balance)) return ['BAD_AMOUNT', '잔액 오류: ' + o.balance];
    if (o.overdue_amount !== '' && !num(o.overdue_amount)) return ['BAD_AMOUNT', '연체금액 오류'];
    if (o.max_overdue_days !== '' && !num(o.max_overdue_days)) return ['BAD_AMOUNT', '연체일수 오류'];
  }
  return null;
}

function normalizeRow_(source, o) {
  var r = {};
  SOURCE_SPEC[source].cols.forEach(function (c) { r[c] = o[c]; });
  if (source === 'SALES') {
    r.amount = Number(r.amount);
    r.correction_type = r.correction_type || '정상';
    r.line_no = r.line_no || '1';
  } else if (source === 'RECEIPT') {
    r.amount = Number(r.amount);
  } else if (source === 'AR_BAL') {
    r.balance = Number(r.balance);
    r.overdue_amount = r.overdue_amount === '' ? 0 : Number(r.overdue_amount);
    r.max_overdue_days = r.max_overdue_days === '' ? 0 : Number(r.max_overdue_days);
  }
  return r;
}

/* ───────────── 집계·데이터 품질 ───────────── */

/** 같은 (중도매인, 기준일) 잔액이 여러 번 들어오면 나중에 적재된 행을 쓴다 */
function latestArRows_(arRows) {
  var m = {};
  arRows.forEach(function (r) { m[r.wholesaler_id + '|' + r.base_date] = r; });
  return Object.keys(m).map(function (k) { return m[k]; });
}

/**
 * 원천 자료로 일·월 집계와 데이터 품질 점검 결과를 만든다.
 * @param p { sales, receipts, arRows, calendar:[{date,is_auction_day}], wholesalers, statusHist, calcRunId, today }
 */
function buildAggregates_(p) {
  var calc = p.calcRunId, ALL = APP.ALL;
  var ar = latestArRows_(p.arRows);
  var daily = {}, monthly = {}, issues = [];
  function dkey(ws, d, c) { return ws + '|' + d + '|' + c; }
  function drow(ws, d, c) {
    var k = dkey(ws, d, c);
    if (!daily[k]) daily[k] = { wholesaler_id: ws, date: d, category: c, purchase_amount: 0, credit_sales: 0,
      cash_sales: 0, correction_amount: 0, receipts: 0, ar_balance: '', overdue_amount: '', max_overdue_days: '', calc_run_id: calc };
    return daily[k];
  }
  function mrow(ws, ym, c) {
    var k = ws + '|' + ym + '|' + c;
    if (!monthly[k]) monthly[k] = { wholesaler_id: ws, ym: ym, category: c, purchase_amount: 0, purchase_days: 0,
      auction_days: 0, credit_sales: 0, cash_sales: 0, receipts: '', month_end_balance: '', avg_daily_balance: '',
      avg_method: '', calc_run_id: calc, _days: {} };
    return monthly[k];
  }

  // 원거래일 조회표 (반품·취소의 월 귀속용)
  var origDate = {};
  p.sales.forEach(function (s) { if (s.correction_type === '정상') origDate[s.source_txn_no] = s.txn_date; });

  // 판매: 일 집계는 전기일, 월 집계는 원거래일 귀속
  p.sales.forEach(function (s) {
    var amt = Number(s.amount), credit = s.txn_type === '외상';
    [s.category, ALL].forEach(function (c) {
      var r = drow(s.wholesaler_id, s.txn_date, c);
      r.purchase_amount += amt;
      if (credit) r.credit_sales += amt; else r.cash_sales += amt;
      if (s.correction_type !== '정상') r.correction_amount += amt;
    });
    var attr = s.txn_date;
    if (s.correction_type !== '정상') {
      if (origDate[s.orig_txn_no]) attr = origDate[s.orig_txn_no];
      else issues.push({ wholesaler_id: s.wholesaler_id, date: s.txn_date, status: '경고', reason_code: 'ORIG_NOT_FOUND',
        detail: '원거래 ' + s.orig_txn_no + ' 없음 → 처리일 월로 집계', calc_run_id: calc });
    }
    [s.category, ALL].forEach(function (c) {
      var m = mrow(s.wholesaler_id, ymOf_(attr), c);
      m.purchase_amount += amt;
      if (credit) m.credit_sales += amt; else m.cash_sales += amt;
      if (s.correction_type === '정상' && amt > 0) m._days[s.txn_date] = true;
    });
  });

  // 입금: 반영일 기준
  var receiptsByWs = {};
  p.receipts.forEach(function (r) {
    drow(r.wholesaler_id, r.posted_date, ALL).receipts += Number(r.amount);
    var m = mrow(r.wholesaler_id, ymOf_(r.posted_date), ALL);
    m.receipts = (m.receipts === '' ? 0 : m.receipts) + Number(r.amount);
    (receiptsByWs[r.wholesaler_id] = receiptsByWs[r.wholesaler_id] || []).push(r);
  });

  // 잔액
  var arByWs = {};
  ar.forEach(function (a) {
    var r = drow(a.wholesaler_id, a.base_date, ALL);
    r.ar_balance = Number(a.balance);
    r.overdue_amount = Number(a.overdue_amount) || 0;
    r.max_overdue_days = Number(a.max_overdue_days) || 0;
    (arByWs[a.wholesaler_id] = arByWs[a.wholesaler_id] || []).push(a);
  });

  // 경매일
  var auction = {}, auctionDaysByYm = {};
  p.calendar.forEach(function (c) {
    if (c.is_auction_day) {
      auction[c.date] = true;
      auctionDaysByYm[ymOf_(c.date)] = (auctionDaysByYm[ymOf_(c.date)] || 0) + 1;
    }
  });
  var latestBase = ar.reduce(function (mx, a) { return a.base_date > mx ? a.base_date : mx; }, '');
  var dataStart = ar.reduce(function (mn, a) { return !mn || a.base_date < mn ? a.base_date : mn; }, '');

  // 1) 잔액 연속성: 전일잔액 + 외상순증 − 입금 = 당일잔액
  var creditPosted = {}, receiptPosted = {};
  p.sales.forEach(function (s) {
    if (s.txn_type !== '외상') return;
    var k = s.wholesaler_id + '|' + s.txn_date;
    creditPosted[k] = (creditPosted[k] || 0) + Number(s.amount);
  });
  p.receipts.forEach(function (r) {
    var k = r.wholesaler_id + '|' + r.posted_date;
    receiptPosted[k] = (receiptPosted[k] || 0) + Number(r.amount);
  });
  Object.keys(arByWs).forEach(function (ws) {
    var list = arByWs[ws].slice().sort(function (a, b) { return a.base_date < b.base_date ? -1 : 1; });
    for (var i = 1; i < list.length; i++) {
      var prev = list[i - 1], cur = list[i], expected = Number(prev.balance);
      for (var d = addDays_(prev.base_date, 1); d <= cur.base_date; d = addDays_(d, 1)) {
        expected += (creditPosted[ws + '|' + d] || 0) - (receiptPosted[ws + '|' + d] || 0);
      }
      var diff = Number(cur.balance) - expected;
      if (Math.abs(diff) >= 0.5) {
        issues.push({ wholesaler_id: ws, date: cur.base_date, status: '불일치', reason_code: 'ROLLFWD_MISMATCH',
          detail: '잔액 연속성 차이 ' + diff + '원 (전일잔액+외상−입금=' + expected + ', 원천잔액=' + cur.balance + ')',
          calc_run_id: calc });
      }
    }
  });

  // 2) 잔액 누락: 영업 중(폐업 아님)이고 거래 시작 이후인 경매일에 잔액이 없으면 누락
  var arSet = {};
  ar.forEach(function (a) { arSet[a.wholesaler_id + '|' + a.base_date] = true; });
  if (dataStart) {
    p.wholesalers.forEach(function (w) {
      var from = w.trade_start_date && w.trade_start_date > dataStart ? w.trade_start_date : dataStart;
      for (var d = from; d <= latestBase; d = addDays_(d, 1)) {
        if (!auction[d] || arSet[w.wholesaler_id + '|' + d]) continue;
        var st = statusOn_(p.statusHist, w.wholesaler_id, d);
        if (st === '폐업') continue;
        issues.push({ wholesaler_id: w.wholesaler_id, date: d, status: '누락', reason_code: 'AR_MISSING',
          detail: '경매일 잔액 자료 없음', calc_run_id: calc });
      }
    });
  }

  // 월 집계 마무리: 구매일수·경매일수·월말잔액·일평균잔액
  var arDaily = {};
  ar.forEach(function (a) { arDaily[a.wholesaler_id + '|' + a.base_date] = Number(a.balance); });
  Object.keys(monthly).forEach(function (k) {
    var m = monthly[k];
    m.purchase_days = Object.keys(m._days).length;
    m.auction_days = auctionDaysByYm[m.ym] || 0;
    delete m._days;
  });
  Object.keys(arByWs).forEach(function (ws) {
    var list = arByWs[ws].map(function (a) { return a.base_date; }).sort();
    var first = list[0];
    var ymFrom = ymOf_(first), ymTo = ymOf_(latestBase);
    var carry = null;
    for (var ym = ymFrom; ym <= ymTo; ym = addMonths_(ym, 1)) {
      var end = monthEnd_(ym) < latestBase ? monthEnd_(ym) : latestBase;
      var sum = 0, n = 0, gaps = 0, last = '';
      for (var d = ym + '-01'; d <= end; d = addDays_(d, 1)) {
        if (d < first) continue;
        var v = arDaily[ws + '|' + d];
        if (v !== undefined) { carry = v; last = v; }
        else if (auction[d]) gaps++;
        if (carry !== null) { sum += carry; n++; }
      }
      if (!n) continue;
      var m = mrow(ws, ym, ALL);
      if (m._days) { m.purchase_days = 0; m.auction_days = auctionDaysByYm[ym] || 0; delete m._days; }
      m.month_end_balance = last === '' ? carry : last;
      m.avg_daily_balance = Math.round(sum / n);
      // 방식 코드: DAILY=일별 잔액(휴장일은 직전 잔액 유지), DAILY_GAP=경매일 잔액 일부 누락 → 직전 잔액으로 대체
      m.avg_method = gaps ? 'DAILY_GAP(' + gaps + ')' : 'DAILY';
    }
  });

  return {
    daily: Object.keys(daily).map(function (k) { return daily[k]; }).sort(cmpBy_(['wholesaler_id', 'date', 'category'])),
    monthly: Object.keys(monthly).map(function (k) { return monthly[k]; }).sort(cmpBy_(['wholesaler_id', 'ym', 'category'])),
    issues: issues,
    latestBase: latestBase,
    dataStart: dataStart
  };
}

function cmpBy_(fields) {
  return function (a, b) {
    for (var i = 0; i < fields.length; i++) {
      var x = a[fields[i]], y = b[fields[i]];
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };
}

/** 기간형 이력에서 특정 일자의 영업 상태 */
function statusOn_(statusHist, ws, d) {
  var st = '';
  statusHist.forEach(function (h) {
    if (h.wholesaler_id === ws && h.valid_from <= d && d <= (h.valid_to || APP.OPEN_END)) st = h.status;
  });
  return st;
}

/**
 * 대사: 원천 합계 ↔ 시스템 집계 합계
 * @return [{item, period, source_value, system_value, diff, result, note}]
 */
function reconcile_(p, agg) {
  var out = [], ALL = APP.ALL;
  function push(item, period, src, sys, note) {
    var diff = Math.round((sys - src) * 100) / 100;
    out.push({ item: item, period: period, source_value: src, system_value: sys, diff: diff,
      result: Math.abs(diff) < 0.5 ? '일치' : '불일치', note: note || '' });
  }
  function sumBy(rows, keyFn, valFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + valFn(r); });
    return m;
  }
  var dAll = agg.daily.filter(function (r) { return r.category === ALL; });

  // 판매(전기월): 원천 ↔ 일 집계
  var rawSales = sumBy(p.sales, function (r) { return ymOf_(r.txn_date); }, function (r) { return Number(r.amount); });
  var aggSales = sumBy(dAll, function (r) { return ymOf_(r.date); }, function (r) { return r.purchase_amount; });
  Object.keys(rawSales).sort().forEach(function (ym) { push('판매금액(전기월)', ym, rawSales[ym], aggSales[ym] || 0); });

  // 판매 총액: 원천 ↔ 월 집계(원거래월 귀속이라 월별은 다를 수 있으나 총액은 같아야 함)
  var rawTotal = p.sales.reduce(function (s, r) { return s + Number(r.amount); }, 0);
  var monTotal = agg.monthly.filter(function (r) { return r.category === ALL; })
    .reduce(function (s, r) { return s + r.purchase_amount; }, 0);
  push('판매금액 총액(월집계)', '전체', rawTotal, monTotal, '월 집계는 반품·취소를 원거래월로 귀속');

  // 부류 합 = 전체 (월 집계)
  var catSum = sumBy(agg.monthly.filter(function (r) { return r.category !== ALL; }),
    function (r) { return r.ym; }, function (r) { return r.purchase_amount; });
  var allSum = sumBy(agg.monthly.filter(function (r) { return r.category === ALL; }),
    function (r) { return r.ym; }, function (r) { return r.purchase_amount; });
  var badCat = Object.keys(allSum).filter(function (ym) { return Math.abs((catSum[ym] || 0) - allSum[ym]) >= 0.5; });
  push('부류합계=전체(월)', '전체', Object.keys(allSum).length, Object.keys(allSum).length - badCat.length,
    badCat.length ? '불일치 월: ' + badCat.join(',') : '');

  // 입금(반영월)
  var rawRc = sumBy(p.receipts, function (r) { return ymOf_(r.posted_date); }, function (r) { return Number(r.amount); });
  var aggRc = sumBy(dAll, function (r) { return ymOf_(r.date); }, function (r) { return r.receipts; });
  Object.keys(rawRc).sort().forEach(function (ym) { push('입금금액(반영월)', ym, rawRc[ym], aggRc[ym] || 0); });

  // 미수 잔액: 월말 경매일·최신 기준일
  var ar = latestArRows_(p.arRows);
  var rawBal = sumBy(ar, function (r) { return r.base_date; }, function (r) { return Number(r.balance); });
  var aggBal = sumBy(dAll.filter(function (r) { return r.ar_balance !== ''; }),
    function (r) { return r.date; }, function (r) { return r.ar_balance; });
  var lastOfMonth = {};
  Object.keys(rawBal).forEach(function (d) {
    var ym = ymOf_(d);
    if (!lastOfMonth[ym] || d > lastOfMonth[ym]) lastOfMonth[ym] = d;
  });
  Object.keys(lastOfMonth).sort().forEach(function (ym) {
    var d = lastOfMonth[ym];
    push('미수잔액 합계', d, rawBal[d], aggBal[d] || 0);
  });

  // 잔액 연속성 위반 건수 (0이어야 일치)
  var rf = agg.issues.filter(function (i) { return i.reason_code === 'ROLLFWD_MISMATCH'; }).length;
  push('잔액 연속성 위반 건수', '전체', 0, rf, '전일잔액+외상−입금=당일잔액');
  return out;
}

/**
 * 전체 데이터 상태 판정. 자료가 불완전하면 '정상'으로 표시하지 않는다.
 * @param p { latestBase, expectedBase, issuesOnLatest, reconFail, lastBatchProblem }
 */
function overallDataStatus_(p) {
  var reasons = [];
  if (!p.latestBase) return { status: '자료없음', reasons: ['적재된 잔액 자료 없음'] };
  if (p.expectedBase && p.latestBase < p.expectedBase) reasons.push('지연: 최신 기준일 ' + p.latestBase + ' < 예정 ' + p.expectedBase);
  if (p.issuesOnLatest) reasons.push('최신 기준일 데이터 이상 ' + p.issuesOnLatest + '건');
  if (p.reconFail) reasons.push('대사 불일치 ' + p.reconFail + '건');
  if (p.lastBatchProblem) reasons.push('최근 가져오기 문제: ' + p.lastBatchProblem);
  var status = '정상';
  if (reasons.length) status = p.reconFail || p.issuesOnLatest ? '불일치' : (p.lastBatchProblem ? '오류' : '지연');
  return { status: status, reasons: reasons };
}

/** 기준일 직전의 마지막 경매일(오늘 제외) = 오늘 아침 기준 예정 기준일 */
function expectedBaseDate_(calendar, today) {
  var best = '';
  calendar.forEach(function (c) { if (c.is_auction_day && c.date < today && c.date > best) best = c.date; });
  return best;
}

/* ───────────── 유효기간형 버전 ───────────── */

/**
 * 기준일에 유효한 승인 버전만 고른다. 같은 ID에 겹치는 승인 버전이 있으면 가장 높은 version_no.
 */
function asOfVersions_(rows, idField, wsId, asOf) {
  var best = {};
  rows.forEach(function (r) {
    if (wsId && r.wholesaler_id !== wsId) return;
    if (r.approval_status !== '승인' || r.is_deleted) return;
    if (!(r.valid_from <= asOf && asOf <= (r.valid_to || APP.OPEN_END))) return;
    var id = r[idField];
    if (!best[id] || Number(r.version_no) > Number(best[id].version_no)) best[id] = r;
  });
  return Object.keys(best).sort().map(function (k) { return best[k]; });
}

/**
 * 새 버전을 승인할 때 직전 승인 버전의 종료일을 정한다.
 * @return [{row, newValidTo}] 수정이 필요한 이전 버전 목록
 */
function closePreviousVersions_(rows, idField, newRow) {
  var out = [];
  rows.forEach(function (r) {
    if (r[idField] !== newRow[idField] || r.approval_status !== '승인') return;
    if (Number(r.version_no) === Number(newRow.version_no)) return;
    var to = r.valid_to || APP.OPEN_END;
    if (r.valid_from < newRow.valid_from && to >= newRow.valid_from) {
      out.push({ row: r, newValidTo: addDays_(newRow.valid_from, -1) });
    }
  });
  return out;
}

/* ───────────── 권한 ───────────── */

var PERMS = {
  'home.view': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'ws.view': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'ws.viewContacts': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'ws.viewGuarantorPII': ['CREDIT', 'ADMIN'],
  'ws.viewHistory': ['CREDIT', 'ADMIN'],
  'ws.viewEvidence': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'master.edit': ['CREDIT', 'ADMIN'],
  'master.approve': ['ADMIN'],
  'evidence.upload': ['CREDIT', 'ADMIN'],
  'user.manage': ['ADMIN'],
  'import.view': ['CREDIT', 'ADMIN'],
  'import.run': ['ADMIN'],
  'audit.view': ['ADMIN']
};

function can_(role, action) {
  return !!(PERMS[action] && PERMS[action].indexOf(role) >= 0);
}

/** 경매사는 기준일에 유효한 담당 지정이 있는 중도매인만. 다른 역할은 전체. */
function canAccessWs_(user, wsId, assignments, onDate) {
  if (!user || !user.role) return false;
  if (user.role !== 'AUCTIONEER') return true;
  return assignments.some(function (a) {
    return a.wholesaler_id === wsId && a.user_id === user.user_id && !a.is_deleted &&
      a.valid_from <= onDate && onDate <= (a.valid_to || APP.OPEN_END);
  });
}

/** 역할에 따라 응답에서 필드를 제거한다(화면 숨김이 아니라 전송 자체를 하지 않음). */
function filter360ByRole_(view, role) {
  if (!can_(role, 'ws.viewContacts')) delete view.contacts;
  if (!can_(role, 'ws.viewGuarantorPII')) {
    delete view.guarantors;
    (view.guarantees || []).forEach(function (g) { delete g.guarantor_ref; delete g.doc_ids; });
  }
  if (!can_(role, 'ws.viewEvidence')) (view.collaterals || []).forEach(function (c) { delete c.evidence_ids; });
  if (!can_(role, 'ws.viewHistory')) delete view.history;
  return view;
}

/* ───────────── 실적 요약 (통합 상세용) ───────────── */

/**
 * 최근 n개월과 전년 대응 월 구매금액. 진행 중인 월은 '동일 경과 경매일' 기준으로 전년과 비교한다.
 */
function monthlyTrend_(monthlyRows, dailyRows, calendar, ws, baseDate, n) {
  var endYm = ymOf_(baseDate), cats = APP.CATEGORIES.concat([APP.ALL]);
  var idx = {};
  monthlyRows.forEach(function (r) { if (r.wholesaler_id === ws) idx[r.ym + '|' + r.category] = r; });
  var monthComplete = baseDate >= lastAuctionDayOfMonth_(calendar, endYm);
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var ym = addMonths_(endYm, -i), py = addMonths_(ym, -12);
    var item = { ym: ym, partial: ym === endYm && !monthComplete, byCategory: {} };
    cats.forEach(function (c) {
      var cur = idx[ym + '|' + c], prev = idx[py + '|' + c];
      item.byCategory[c] = {
        amount: cur ? cur.purchase_amount : 0,
        prevYearAmount: prev ? prev.purchase_amount : null,
        purchaseDays: cur ? cur.purchase_days : 0
      };
    });
    if (item.partial) item.mtd = mtdCompare_(dailyRows, calendar, ws, baseDate);
    out.push(item);
  }
  // 전년 대비 증감률(완결 월만)
  out.forEach(function (it) {
    cats.forEach(function (c) {
      var b = it.byCategory[c];
      b.yoy = it.partial ? null : growthRate_(b.amount, b.prevYearAmount);
    });
  });
  return out;
}

/** 월의 마지막 경매일. 경매 일정이 월말까지 등록되지 않았으면 월말일로 본다(완결 여부를 알 수 없으므로 진행 중 취급). */
function lastAuctionDayOfMonth_(calendar, ym) {
  var last = '', covered = false, end = monthEnd_(ym);
  calendar.forEach(function (c) {
    if (c.date >= end) covered = true;
    if (c.is_auction_day && ymOf_(c.date) === ym && c.date > last) last = c.date;
  });
  return covered && last ? last : end;
}

/** 구매 증감률 = 당기 ÷ 비교기간 − 1. 비교기간 0·없음이면 비교불가 */
function growthRate_(cur, prev) {
  if (prev === null || prev === undefined) return { status: '비교불가', reason: '전년 자료 없음' };
  if (Number(prev) === 0) return { status: '비교불가', reason: '전년 실적 0' };
  return { status: '정상', value: Number(cur) / Number(prev) - 1 };
}

/** 진행 중인 월: 당월 경과 경매일 수 k 만큼 전년 같은 달 처음 k 경매일과 비교 */
function mtdCompare_(dailyRows, calendar, ws, baseDate) {
  var ym = ymOf_(baseDate), pym = addMonths_(ym, -12);
  var curDays = calendar.filter(function (c) { return c.is_auction_day && ymOf_(c.date) === ym && c.date <= baseDate; })
    .map(function (c) { return c.date; }).sort();
  var prevDaysAll = calendar.filter(function (c) { return c.is_auction_day && ymOf_(c.date) === pym; })
    .map(function (c) { return c.date; }).sort();
  var k = curDays.length;
  var basis = '동일 경과 경매일';
  var prevDays = prevDaysAll.slice(0, k);
  if (!prevDaysAll.length) {   // 전년 경매 일정이 없으면 달력일로 대체
    basis = '동일 달력일(경매 일정 없음)';
    prevDays = dateRange_(pym + '-01', pym + '-' + baseDate.substring(8, 10));
  }
  var curSet = {}, prevSet = {};
  curDays.forEach(function (d) { curSet[d] = true; });
  prevDays.forEach(function (d) { prevSet[d] = true; });
  var res = { basis: basis, elapsedAuctionDays: k, prevPeriod: prevDays.length ? prevDays[0] + '~' + prevDays[prevDays.length - 1] : '', byCategory: {} };
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) {
    var cur = 0, prev = 0;
    dailyRows.forEach(function (r) {
      if (r.wholesaler_id !== ws || r.category !== c) return;
      if (curSet[r.date]) cur += r.purchase_amount;
      else if (prevSet[r.date]) prev += r.purchase_amount;
    });
    res.byCategory[c] = { amount: cur, prevAmount: prev, growth: growthRate_(cur, prevDays.length ? prev : null) };
  });
  return res;
}
