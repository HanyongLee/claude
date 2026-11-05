/**
 * VirtualData.gs — 가상 테스트 데이터 생성 (순수 함수, 실제 중도매인과 무관)
 * 같은 seed 이면 항상 같은 자료가 만들어진다.
 *
 * 포함된 가상 사례
 *  W0123 (가상)한빛청과  : 최근 3개월 결제 지연(회전율 저하·연체 발생), 담보 재평가·한도 감액 이력
 *  W0207 (가상)사계과일  : 과일 전문, 여름철 계절적 구매 감소(매년 반복) — 부실 아님
 *  W0310 (가상)새싹채소  : 2026-05 신규 거래
 *  W0405 (가상)동녘상회  : 2026-08-01 휴업 (구매 중단, 잔액 정리)
 *  W0512 (가상)다온유통  : 반품·취소가 잦음
 *  그 외 W0101~W0115    : 일반
 */

var VD_HOLIDAYS = ['2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-10-05', '2025-10-06', '2025-10-07',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-09-24', '2026-09-25', '2026-09-26'];

var VD_SEASON = {
  '과일': [1.15, 1.25, 0.9, 0.85, 0.9, 1.0, 1.05, 1.2, 1.35, 1.15, 1.0, 1.1],
  '채소': [1.05, 1.0, 1.0, 1.05, 1.0, 0.95, 0.95, 1.0, 1.05, 1.0, 1.0, 1.05],
  '계절과일': [1.2, 1.3, 1.0, 0.9, 0.7, 0.45, 0.4, 0.6, 1.3, 1.3, 1.1, 1.2]
};

function vdRng_(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vdProfiles_(rng) {
  var names = ['새벽청과', '가람농산', '푸른들', '한마음상회', '대흥청과', '미래농산', '금강유통', '들녘상회',
    '참좋은청과', '성실농산', '해오름', '바른유통', '농원상회', '으뜸청과', '보람농산'];
  var list = [];
  names.forEach(function (n, i) {
    var cats = i % 5 === 0 ? ['과일'] : (i % 7 === 0 ? ['채소'] : ['과일', '채소']);
    var base = {};
    cats.forEach(function (c) { base[c] = Math.round((600000 + rng() * 2400000) / 10000) * 10000; });
    list.push({ id: 'W01' + (i + 1 < 10 ? '0' : '') + (i + 1), name: '(가상)' + n, cats: cats, base: base,
      creditRatio: 0.7 + rng() * 0.25, payLag: 7 + Math.floor(rng() * 9), payProb: 0.35, buyProb: 0.85,
      returnRate: 0.01, tradeStart: '20' + (15 + Math.floor(rng() * 8)) + '-0' + (1 + Math.floor(rng() * 9)) + '-01',
      auctioneer: 1 + (i % 3) });
  });
  list.push({ id: 'W0123', name: '(가상)한빛청과', cats: ['과일', '채소'], base: { '과일': 2600000, '채소': 1500000 },
    creditRatio: 0.9, payLag: 10, payProb: 0.35, buyProb: 0.88, returnRate: 0.01, tradeStart: '2016-03-01', auctioneer: 1,
    slowFrom: '2026-07-27', slowLag: 38, slowPart: 0.55 });
  list.push({ id: 'W0207', name: '(가상)사계과일', cats: ['과일'], base: { '과일': 2200000 }, season: '계절과일',
    creditRatio: 0.8, payLag: 9, payProb: 0.35, buyProb: 0.85, returnRate: 0.01, tradeStart: '2018-04-01', auctioneer: 2 });
  list.push({ id: 'W0310', name: '(가상)새싹채소', cats: ['채소'], base: { '채소': 900000 },
    creditRatio: 0.75, payLag: 8, payProb: 0.35, buyProb: 0.8, returnRate: 0.01, tradeStart: '2026-05-04', auctioneer: 3 });
  list.push({ id: 'W0405', name: '(가상)동녘상회', cats: ['과일', '채소'], base: { '과일': 1000000, '채소': 800000 },
    creditRatio: 0.8, payLag: 9, payProb: 0.35, buyProb: 0.85, returnRate: 0.01, tradeStart: '2017-06-01', auctioneer: 2,
    closedFrom: '2026-08-01' });
  list.push({ id: 'W0512', name: '(가상)다온유통', cats: ['과일', '채소'], base: { '과일': 1400000, '채소': 1100000 },
    creditRatio: 0.85, payLag: 11, payProb: 0.35, buyProb: 0.86, returnRate: 0.06, tradeStart: '2019-09-01', auctioneer: 3 });
  return list;
}

/**
 * @param opt { startDate, endDate, seed, ownerEmail }
 * @return { master: {...테이블별 행}, files: [{name, content}], summary }
 */
function genVirtualData_(opt) {
  var start = opt.startDate, end = opt.endDate, rng = vdRng_(opt.seed || 20261027);
  var holiday = {};
  VD_HOLIDAYS.forEach(function (d) { holiday[d] = true; });
  // 경매 일정은 당월 말일까지 미리 등록(실무에서도 연간 일정은 사전에 확정됨)
  var calendar = dateRange_(start, monthEnd_(ymOf_(end))).map(function (d) {
    var aud = dowOf_(d) !== 0 && !holiday[d];
    return { date: d, is_auction_day: aud, note: holiday[d] ? '휴장(가상 일정)' : (dowOf_(d) === 0 ? '일요일' : '') };
  });
  var auctionDays = calendar.filter(function (c) { return c.is_auction_day && c.date <= end; }).map(function (c) { return c.date; });
  var profiles = vdProfiles_(rng);

  var sales = [], receipts = [], arRows = [];
  profiles.forEach(function (p) {
    var from = p.tradeStart > start ? p.tradeStart : start;
    var queue = [];          // 미결제 외상 {date, amt, txn}
    var balance = 0;
    var pendingRet = {};     // 반품 예정 {date: [rows]}
    var postAdj = {};        // 반영일별 입금 {date: amount}
    var catCode = { '과일': 'F', '채소': 'V' };
    auctionDays.forEach(function (d) {
      if (d < from) return;
      var closed = p.closedFrom && d >= p.closedFrom;
      var m = +d.substring(5, 7) - 1;
      // 1) 구매
      if (!closed) {
        p.cats.forEach(function (c) {
          if (rng() > p.buyProb) return;
          var season = VD_SEASON[p.season || c][m];
          var growth = 1 + 0.04 * (daysBetween_(start, d) / 365);
          var amt = Math.round(p.base[c] * season * growth * (0.6 + 0.8 * rng()) / 1000) * 1000;
          if (amt <= 0) return;
          var credit = Math.round(amt * p.creditRatio / 1000) * 1000, cash = amt - credit;
          var ymd = d.replace(/-/g, '');
          if (credit > 0) {
            var no = 'S' + ymd + p.id + catCode[c] + 'C';
            sales.push({ source_txn_no: no, line_no: '1', txn_date: d, wholesaler_id: p.id, category: c, amount: credit,
              txn_type: '외상', correction_type: '정상', orig_txn_no: '' });
            queue.push({ date: d, amt: credit, txn: no });
            balance += credit;   // 외상은 전기일에 잔액 증가
            if (rng() < p.returnRate) {
              var rd = d, k = 1 + Math.floor(rng() * 4);
              for (var j = 0; j < k; j++) rd = addDays_(rd, 1);
              var ramt = -Math.round(credit * (0.05 + 0.25 * rng()) / 1000) * 1000;
              if (ramt < 0 && rd <= end) (pendingRet[rd] = pendingRet[rd] || []).push({ source_txn_no: 'R' + rd.replace(/-/g, '') + p.id + catCode[c] + ymd.substring(4),
                line_no: '1', txn_date: rd, wholesaler_id: p.id, category: c, amount: ramt, txn_type: '외상',
                correction_type: rng() < 0.7 ? '반품' : '취소', orig_txn_no: no, _orig: no });
            }
          }
          if (cash > 0) {
            sales.push({ source_txn_no: 'S' + ymd + p.id + catCode[c] + 'H', line_no: '1', txn_date: d, wholesaler_id: p.id,
              category: c, amount: cash, txn_type: '현금', correction_type: '정상', orig_txn_no: '' });
          }
        });
      }
      // 2) 이 날 처리되는 반품 (전기일 기준 잔액 감소)
      Object.keys(pendingRet).forEach(function (rd) {
        if (rd > d) return;
        pendingRet[rd].forEach(function (r) {
          var row = Object.assign({}, r); delete row._orig;
          row.txn_date = d < rd ? rd : d;
          row.source_txn_no = 'R' + row.txn_date.replace(/-/g, '') + r.source_txn_no.substring(9);
          sales.push(row);
          balance += row.amount;
          var left = -row.amount;
          var target = queue.filter(function (q) { return q.txn === r._orig; })[0];
          var order = target ? [target].concat(queue) : queue;
          for (var i = 0; i < order.length && left > 0; i++) {
            var cut = Math.min(order[i].amt, left); order[i].amt -= cut; left -= cut;
          }
          queue = queue.filter(function (q) { return q.amt > 0; });
        });
        delete pendingRet[rd];
      });
      // 3) 결제: 지연 기간이 지난 외상을 묶어서 입금
      var slow = p.slowFrom && d >= p.slowFrom;
      var lag = slow ? p.slowLag : p.payLag;
      if (rng() < p.payProb || closed) {
        var due = queue.filter(function (q) { return daysBetween_(q.date, d) >= (closed ? 0 : lag); });
        var dueAmt = due.reduce(function (s, q) { return s + q.amt; }, 0);
        if (slow) dueAmt = Math.round(dueAmt * p.slowPart / 1000) * 1000;
        if (dueAmt > 0) {
          var left2 = dueAmt;
          for (var i = 0; i < queue.length && left2 > 0; i++) {
            var cut = Math.min(queue[i].amt, left2); queue[i].amt -= cut; left2 -= cut;
          }
          queue = queue.filter(function (q) { return q.amt > 0; });
          var posted = rng() < 0.06 ? addDays_(d, 1) : d;   // 입금 반영 지연(가상)
          if (posted > end) posted = d;
          receipts.push({ source_receipt_no: 'P' + d.replace(/-/g, '') + p.id, receipt_date: d, posted_date: posted,
            wholesaler_id: p.id, amount: dueAmt, receipt_type: rng() < 0.8 ? '계좌이체' : '현금' });
          postAdj[posted] = (postAdj[posted] || 0) + dueAmt;
        }
      }
      // 4) 반영일이 오늘인 입금을 잔액에 반영 (휴장일 반영분은 다음 경매일 잔액에 포함)
      Object.keys(postAdj).forEach(function (pd) {
        if (pd <= d) { balance -= postAdj[pd]; delete postAdj[pd]; }
      });
      // 5) 경매일 잔액 (연체 = 약정 30일(가상) 초과 미결제)
      var overdue = 0, maxDays = 0;
      queue.forEach(function (q) {
        var age = daysBetween_(q.date, d) - 30;
        if (age > 0) { overdue += q.amt; maxDays = Math.max(maxDays, age); }
      });
      arRows.push({ base_date: d, wholesaler_id: p.id, balance: balance, overdue_amount: overdue, max_overdue_days: maxDays });
    });
  });

  // 반영일이 휴장일인 입금: 잔액 연속성 검사(달력일 누적)와 맞도록 반영일을 다음 경매일로 조정
  var isAuction = {};
  auctionDays.forEach(function (d) { isAuction[d] = true; });
  receipts.forEach(function (r) { while (!isAuction[r.posted_date] && r.posted_date <= end) r.posted_date = addDays_(r.posted_date, 1); });

  var master = vdMaster_(profiles, opt);
  master.M_CALENDAR = calendar;
  var files = vdFiles_(sales, receipts, arRows, start, end);
  return {
    master: master, files: files,
    summary: { wholesalers: profiles.length, sales: sales.length, receipts: receipts.length, arRows: arRows.length,
      files: files.length, period: start + ' ~ ' + end }
  };
}

function vdFiles_(sales, receipts, arRows, start, end) {
  var files = [];
  function emit(prefix, cols, rows, dateField, amtField) {
    var byYm = {};
    rows.forEach(function (r) { (byYm[ymOf_(r[dateField])] = byYm[ymOf_(r[dateField])] || []).push(r); });
    Object.keys(byYm).sort().forEach(function (ym) {
      var list = byYm[ym], sum = 0;
      var lines = [cols.join(',')];
      list.forEach(function (r) { lines.push(toCsvLine_(cols.map(function (c) { return r[c]; }))); sum += Number(r[amtField]); });
      lines.push('#CONTROL,' + list.length + ',' + sum);
      files.push({ name: prefix + ym.replace('-', '') + '.csv', content: lines.join('\n') + '\n' });
    });
  }
  emit('SALES_', SOURCE_SPEC.SALES.cols, sales, 'txn_date', 'amount');
  emit('RECEIPT_', SOURCE_SPEC.RECEIPT.cols, receipts, 'posted_date', 'amount');
  emit('AR_BAL_', SOURCE_SPEC.AR_BAL.cols, arRows, 'base_date', 'balance');
  return files;
}

function vdMaster_(profiles, opt) {
  var by = 'virtual-data', now = '2026-01-01 00:00:00';
  var aud = { created_at: now, created_by: by, updated_at: now, updated_by: by, row_version: 1, is_deleted: false };
  var ver = function (from, to, reason) {
    return { valid_from: from, valid_to: to || APP.OPEN_END, approval_status: '승인', change_reason: reason || '가상 초기자료',
      requested_by: by, requested_at: now, approved_by: by + '-approver', approved_at: now, reject_reason: '' };
  };
  var users = [
    { user_id: 'auctioneer1@example.invalid', name: '(가상)경매사1', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'auctioneer2@example.invalid', name: '(가상)경매사2', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'auctioneer3@example.invalid', name: '(가상)경매사3', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'credit1@example.invalid', name: '(가상)채권담당1', role: 'CREDIT', status: '사용' },
    { user_id: 'viewer1@example.invalid', name: '(가상)조회자1', role: 'VIEWER', status: '사용' },
    { user_id: 'admin2@example.invalid', name: '(가상)관리자2', role: 'ADMIN', status: '사용' }
  ].map(function (u) { return Object.assign(u, aud); });

  var M = { M_USER: users, M_WHOLESALER: [], M_WS_STATUS_HIST: [], M_ASSIGNMENT: [], M_CONTACT: [],
    M_COLLATERAL: [], M_GUARANTEE: [], M_LIMIT: [], P_GUARANTOR: [] };
  profiles.forEach(function (p, i) {
    var closed = !!p.closedFrom;
    M.M_WHOLESALER.push(Object.assign({ wholesaler_id: p.id, name: p.name, representative: '(가상)대표' + (i + 1),
      biz_status: closed ? '휴업' : '정상', trade_start_date: p.tradeStart, categories: p.cats.join(','),
      settle_group: 'A', note: '가상 데이터' }, aud));
    M.M_WS_STATUS_HIST.push({ status_hist_id: 'ST-' + p.id + '-1', wholesaler_id: p.id, status: '정상', valid_from: p.tradeStart,
      valid_to: closed ? addDays_(p.closedFrom, -1) : APP.OPEN_END, change_reason: '가상 초기자료', created_at: now, created_by: by });
    if (closed) M.M_WS_STATUS_HIST.push({ status_hist_id: 'ST-' + p.id + '-2', wholesaler_id: p.id, status: '휴업',
      valid_from: p.closedFrom, valid_to: APP.OPEN_END, change_reason: '(가상) 휴업 신고', created_at: now, created_by: by });
    M.M_ASSIGNMENT.push(Object.assign({ assign_id: 'AS-' + p.id, wholesaler_id: p.id, user_id: 'auctioneer' + p.auctioneer + '@example.invalid',
      valid_from: '2024-01-01', valid_to: APP.OPEN_END, change_reason: '가상 초기자료' }, aud));
    M.M_CONTACT.push(Object.assign({ contact_id: 'CT-' + p.id, wholesaler_id: p.id, contact_type: '사무실 전화(가상)',
      value: '000-0000-' + (1000 + i) }, aud));

    var monthly = Object.keys(p.base).reduce(function (s, c) { return s + p.base[c]; }, 0) * 26;
    var setAmt = Math.round(monthly * 1.2 / 1000000) * 1000000;
    // 담보 1: 부동산 근저당 (설정금액 ≠ 회수 가능액: 평가·내부 인정금액 별도)
    M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-01', version_no: 1, wholesaler_id: p.id,
      collateral_type: '부동산(근저당)', set_amount: setAmt, appraised_amount: Math.round(setAmt * 1.1), appraisal_date: '2023-12-10',
      recognized_amount: Math.round(setAmt * 0.7), confirmed_date: '2023-12-10', review_status: '검토완료', expiry_date: '', evidence_ids: '' },
      ver('2024-01-01', p.id === 'W0123' ? '2026-05-31' : null)));
    if (p.id === 'W0123') {
      M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-01', version_no: 2, wholesaler_id: p.id,
        collateral_type: '부동산(근저당)', set_amount: setAmt, appraised_amount: Math.round(setAmt * 0.85), appraisal_date: '2026-05-20',
        recognized_amount: Math.round(setAmt * 0.5), confirmed_date: '2026-05-25', review_status: '검토완료', expiry_date: '', evidence_ids: '' },
        ver('2026-06-01', null, '(가상) 재평가 결과 반영')));
    }
    // 담보 2: 일부는 보증보험(만기 있음) — 기한 도래 확인용
    if (i % 3 === 0) {
      var exp = addDays_(opt.endDate, 20 + (i * 7) % 90);
      M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-02', version_no: 1, wholesaler_id: p.id,
        collateral_type: '보증보험증권', set_amount: 30000000, appraised_amount: 30000000, appraisal_date: '2025-11-01',
        recognized_amount: 30000000, confirmed_date: '2025-11-01', review_status: '검토완료', expiry_date: exp, evidence_ids: '' },
        ver('2025-11-01')));
    }
    // 연대보증
    var hasG = i % 2 === 0;
    var gref = hasG ? 'GR-' + p.id : '';
    M.M_GUARANTEE.push(Object.assign({ guarantee_id: 'G' + p.id + '-01', version_no: 1, wholesaler_id: p.id,
      has_guarantee: hasG ? '있음' : '없음', guarantor_ref: gref, scope: hasG ? '포괄 근보증(가상)' : '',
      guarantee_limit: hasG ? setAmt : '', period_from: hasG ? '2024-01-01' : '', period_to: hasG ? (i % 4 === 0 ? addDays_(opt.endDate, 45) : '2027-12-31') : '',
      confirmed_date: '2024-01-01', doc_ids: '' }, ver('2024-01-01')));
    if (hasG) M.P_GUARANTOR.push(Object.assign({ guarantor_ref: gref, name: '(가상)보증인' + (i + 1), relation: '(가상)가족', note: '' }, aud));
    // 한도: 유형별 별도 행. 합산하지 않음
    var basic = Math.round(monthly * 1.5 / 1000000) * 1000000;
    M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-B', version_no: 1, wholesaler_id: p.id, limit_type: '기본한도',
      amount: basic, approval_basis: '(가상) 연간 한도 심사', approver: '(가상)승인권자' }, ver('2024-01-01', p.id === 'W0123' ? '2026-02-28' : null)));
    if (p.id === 'W0123') {
      M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-B', version_no: 2, wholesaler_id: p.id, limit_type: '기본한도',
        amount: Math.round(basic * 0.8 / 1000000) * 1000000, approval_basis: '(가상) 담보 재평가 예정에 따른 감액', approver: '(가상)승인권자' },
        ver('2026-03-01', null, '(가상) 한도 감액')));
    }
    if (i % 4 === 1) M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-M', version_no: 1, wholesaler_id: p.id, limit_type: '마감한도',
      amount: Math.round(basic * 0.3 / 1000000) * 1000000, approval_basis: '(가상) 마감 정산용', approver: '(가상)승인권자' }, ver('2024-01-01')));
    if (i % 6 === 2) M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-A', version_no: 1, wholesaler_id: p.id, limit_type: '추가한도',
      amount: 20000000, approval_basis: '(가상) 성수기 추가', approver: '(가상)승인권자' }, ver('2026-09-01', '2026-10-31')));
  });
  return M;
}
