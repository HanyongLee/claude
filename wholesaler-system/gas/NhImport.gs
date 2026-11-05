/**
 * NhImport.gs — 농협 전산 추출 파일(엑셀) 어댑터
 *
 * 지원 형식(헤더 행으로 자동 판별, 파일명 무관)
 *  NH_SALES_DAILY   EBFW916007 일별: 번호,조직구분,사업장,사업장명,기표일자,농협대분류,농협대분류명,...,중도매인,중도매인명,거래인허가번호,중량,금액(A)
 *  NH_SALES_MONTHLY EBFW916007 월별: 번호,조직구분,사업장,사업장명,기표년월,중도매인,중도매인명,중량,금액(A)
 *  NH_COLLATERAL    담보현황(중도매인): 연번,허가번호,성명,품목,갱신년도,약정구분,마감한도,외상한도금액,최고한도금액,배수,추가한도,합계,거래보증금,부동산,보증보험,예금담보,보험(공제),...
 *  NH_MART          EBFW916004 계통마트 거래실적: 참고자료로만 기록(적재하지 않음)
 *
 * 이 파일들에는 입금·미수잔액·연체 자료가 없다. 따라서 회전율·연체·한도 사용률은 별도 미수 자료(AR_BAL_/RECEIPT_)가 들어오기 전까지 산출불가로 남는다.
 * 담보현황의 NICE 신용점수 열은 개인신용정보이므로 적재하지 않는다.
 */

var NH_HEADERS = {
  NH_SALES_DAILY: ['번호', '조직구분', '사업장', '사업장명', '기표일자', '농협대분류', '농협대분류명'],
  NH_SALES_MONTHLY: ['번호', '조직구분', '사업장', '사업장명', '기표년월', '중도매인', '중도매인명'],
  NH_COLLATERAL: ['허가 번호', '성명', '품목', '갱신 년도'],
  NH_MART: ['번호', '유통거래처지역본부', '유통거래처지역본부명']
};

function nhNorm_(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); }
function nhKey_(v) { return nhNorm_(v).replace(/\s/g, ''); }
function nhNum_(v) {
  if (typeof v === 'number') return v;
  var s = nhNorm_(v).replace(/[,\s원]/g, '');
  if (s === '' || s === '-') return 0;
  var n = Number(s);
  return isFinite(n) ? n : 0;
}
/** 2027-07-29 / 8/5/2022 / 2027.07.29 / Date 객체 → yyyy-MM-dd. 못 읽으면 '' */
function nhDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  var s = nhNorm_(v);
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (m) return '20' + m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return '';
}

/** 2차원 배열에서 헤더 행을 찾아 형식과 열 위치를 돌려준다 */
function detectNhFormat_(rows) {
  for (var i = 0; i < Math.min(rows.length, 60); i++) {
    var cells = rows[i].map(nhKey_);
    for (var fmt in NH_HEADERS) {
      var need = NH_HEADERS[fmt].map(nhKey_);
      if (need.every(function (h) { return cells.indexOf(h) >= 0; })) {
        var col = {};
        rows[i].forEach(function (c, j) { var k = nhKey_(c); if (k && col[k] === undefined) col[k] = j; });
        return { format: fmt, headerRow: i, col: col };
      }
    }
  }
  return null;
}

/** 파일 → 2차원 배열. 엑셀은 Drive API 로 Google 시트로 변환해 읽고 임시 파일은 휴지통으로 */
function fileToRows_(file) {
  var mime = String(file.getMimeType ? file.getMimeType() : '');
  var name = file.getName();
  if (/spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/i.test(name)) {
    if (typeof Drive === 'undefined' || !Drive.Files) throw new Error('엑셀 변환에는 고급 Drive 서비스가 필요합니다(appsscript.json dependencies 확인). CSV 로 저장해 올려도 됩니다.');
    var created = Drive.Files.create({ name: '(임시변환) ' + name, mimeType: 'application/vnd.google-apps.spreadsheet' }, file.getBlob());
    try {
      var ss = SpreadsheetApp.openById(created.id);
      var sh = ss.getSheets()[0];
      return sh.getDataRange().getValues();
    } finally {
      try { DriveApp.getFileById(created.id).setTrashed(true); } catch (e) { /* 정리 실패는 무시 */ }
    }
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    return SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  }
  return parseCsv_(file.getBlob().getDataAsString('UTF-8'));
}

/* ───────────── 판매 실적 ───────────── */

/**
 * 일별 낙찰 실적 → R_SALES 행. 거래번호가 없으므로 (기표일자, 중도매인, 분류, 매매·원표·수입·파렛 구분) 조합을 키로 쓴다.
 * 같은 키가 파일 안에 여러 번 나오면 합산한다(원천이 같은 조합을 분리 표기하는 경우).
 */
function parseNhSalesDaily_(rows, det, ctx) {
  var c = det.col, out = {}, rejects = [], names = {};
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!nhNorm_(r[c['번호']]) && !nhNorm_(r[c['기표일자']])) continue;
    var date = nhDate_(r[c['기표일자']]), ws = nhNorm_(r[c['중도매인']]), amt = nhNum_(r[c['금액(A)']]);
    if (!date) { rejects.push({ line: i + 1, code: 'BAD_DATE', msg: '기표일자 오류: ' + nhNorm_(r[c['기표일자']]), raw: r.slice(0, 20).join(',') }); continue; }
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '중도매인 코드 없음', raw: r.slice(0, 20).join(',') }); continue; }
    var big = nhNorm_(r[c['농협대분류명']]);
    var cat = NH_CATEGORY_MAP[big] || '기타';
    if (amt === 0) continue;   // 0원 행(수량 0)은 거래가 아니므로 건너뜀
    names[ws] = nhNorm_(r[c['중도매인명']]);
    var parts = ['기표일자', '중도매인', '농협대분류', '농협중분류', '농협소분류', '공판매매구분', '공판원표구분', '수입여부', '파렛출하여부']
      .map(function (k) { return c[k] === undefined ? '' : nhNorm_(r[c[k]]); });
    var key = 'NH' + date.replace(/-/g, '') + '|' + ws + '|' + fnv1a_(parts.join('|'));
    if (!out[key]) out[key] = { source_txn_no: key, line_no: '1', txn_date: date, wholesaler_id: ws, category: cat, amount: 0,
      txn_type: '미구분', correction_type: '정상', orig_txn_no: '', _name: names[ws], _big: big };
    out[key].amount += amt;
  }
  var list = Object.keys(out).map(function (k) { return out[k]; });
  // 음수 합계(반품만 있는 조합)는 반품 행으로 표시
  list.forEach(function (x) { if (x.amount < 0) { x.correction_type = '반품'; x.orig_txn_no = x.source_txn_no + '-ORIG'; } });
  return { records: list, rejects: rejects, names: names, dateField: 'txn_date', amountField: 'amount' };
}

function parseNhSalesMonthly_(rows, det) {
  var c = det.col, out = {}, rejects = [], names = {};
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    var ym = nhNorm_(r[c['기표년월']]), ws = nhNorm_(r[c['중도매인']]);
    if (!ym && !ws) continue;
    var m = ym.match(/(\d{4})[.\-\/]?(\d{2})/);
    if (!m) { rejects.push({ line: i + 1, code: 'BAD_DATE', msg: '기표년월 오류: ' + ym, raw: r.slice(0, 10).join(',') }); continue; }
    ym = m[1] + '-' + m[2];
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '중도매인 코드 없음', raw: r.slice(0, 10).join(',') }); continue; }
    names[ws] = nhNorm_(r[c['중도매인명']]);
    var key = ws + '|' + ym;
    if (!out[key]) out[key] = { ym: ym, wholesaler_id: ws, amount: 0, weight: 0, _name: names[ws] };
    out[key].amount += nhNum_(r[c['금액(A)']]);
    out[key].weight += nhNum_(r[c['중량']]);
  }
  return { records: Object.keys(out).map(function (k) { return out[k]; }), rejects: rejects, names: names, dateField: 'ym', amountField: 'amount' };
}

/** 미등록 중도매인 자동 등록(설정 NH_AUTO_REGISTER_WS). 상호는 성명/중도매인명, 거래 시작일은 파일 내 최초 거래일 */
function autoRegisterWs_(names, firstDates, settings) {
  var created = [];
  if ((settings.NH_AUTO_REGISTER_WS || '예') !== '예') return created;
  invalidate_('DB_MASTER', 'M_WHOLESALER');
  var have = {};
  readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { have[w.wholesaler_id] = true; });
  var sys = ownerAsUser_(), rows = [], hist = [];
  Object.keys(names).forEach(function (ws) {
    if (have[ws]) return;
    var start = firstDates[ws] || todayStr_();
    var row = { wholesaler_id: ws, name: names[ws] || ws, representative: '', biz_status: '정상', trade_start_date: start,
      categories: '', settle_group: '', note: '실적 파일에서 자동 등록 ' + todayStr_() + ' (거래 시작일은 파일 내 최초 거래일)' };
    Object.assign(row, newAuditFields_(sys)); rows.push(row); have[ws] = true;
    hist.push({ status_hist_id: uid_('ST'), wholesaler_id: ws, status: '정상', valid_from: start, valid_to: APP.OPEN_END, change_reason: '자동 등록', created_at: nowStr_(), created_by: sys.user_id });
    created.push(ws);
  });
  if (rows.length) {
    appendObjects_('DB_MASTER', 'M_WHOLESALER', rows);
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', hist);
    audit_(sys, 'AUTO_REGISTER', 'DB_MASTER', 'M_WHOLESALER', created.join(','), null, { count: created.length }, '실적 파일 자동 등록');
  }
  return created;
}

/* ───────────── 담보현황 ───────────── */

var NH_LIMIT_COLS = { '마감한도': '마감한도', '외상한도금액': '기본한도', '추가한도': '추가한도' };
var NH_COLLATERAL_COLS = { '거래보증금': '거래보증금', '부동산': '부동산', '보증보험': '보증보험증권', '예금담보': '예금(질권)', '보험(공제)': '보험(공제)' };

/**
 * 담보현황 한 행 → 기초자료 구조. 금액·일자·보증 여부만 쓰고 NICE 점수는 읽지 않는다.
 */
function parseNhCollateral_(rows, det, asOf) {
  var c = det.col, out = [], rejects = [];
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    var ws = nhNorm_(r[c['허가번호']]), name = nhNorm_(r[c['성명']]);
    if (!ws && !name) continue;
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '허가번호 없음: ' + name, raw: '' }); continue; }
    var limits = {}, cols = {};
    Object.keys(NH_LIMIT_COLS).forEach(function (k) { if (c[nhKey_(k)] !== undefined) limits[NH_LIMIT_COLS[k]] = nhNum_(r[c[nhKey_(k)]]); });
    Object.keys(NH_COLLATERAL_COLS).forEach(function (k) { if (c[nhKey_(k)] !== undefined) { var v = nhNum_(r[c[nhKey_(k)]]); if (v > 0) cols[NH_COLLATERAL_COLS[k]] = v; } });
    var g = nhNorm_(r[c['연대보증인유무']]), gName = nhNorm_(r[c['연대보증인']]);
    var gm = gName.match(/^(.*)\s*\(([^()]*)\)\s*$/);   // 마지막 괄호가 관계: "(가상)을 (자녀)" → 이름 "(가상)을", 관계 "자녀"
    var expiryText = nhNorm_(r[c[nhKey_('담보만기일(담보종류)')]]);
    var expiry = nhDate_(expiryText);
    out.push({
      wholesaler_id: ws, name: name, categories: nhNorm_(r[c['품목']]), trade_start_date: nhDate_(r[c['허가일']]),
      permit_expiry: nhDate_(r[c['허가만료일']]), contract_type: nhNorm_(r[c[nhKey_('약정구분(Safekey)')]]), renew_year: nhNorm_(r[c[nhKey_('갱신년도')]]),
      limits: limits, limit_note: '최고한도 ' + nhNum_(r[c['최고한도금액']]).toLocaleString() + ' / 배수 ' + nhNorm_(r[c['배수']]) + ' / 합계 ' + nhNum_(r[c['합계']]).toLocaleString(),
      collaterals: cols, collateral_change_date: nhDate_(r[c['담보변동일']]), collateral_expiry: expiry, collateral_expiry_text: expiryText,
      has_guarantee: g === '유' ? '있음' : (g === '무' ? '없음' : (gName ? '있음' : '')),
      guarantor_name: gm ? gm[1].trim() : gName, guarantor_relation: gm ? gm[2].trim() : '',
      collateral_desc: nhNorm_(r[c['담보물']]), note: nhNorm_(r[c['비고']]), updated: nhDate_(r[c['업데이트일']]) || asOf
    });
  }
  return { records: out, rejects: rejects };
}

/**
 * 담보현황을 기초자료에 반영한다. 값이 바뀐 항목만 새 승인 버전으로 만든다(재적재해도 중복 없음).
 * @return { wholesalers, limits, collaterals, guarantees, unchanged }
 */
function applyNhCollateral_(records, asOf, batchId) {
  var sys = ownerAsUser_(), stat = { wholesalers: 0, limits: 0, collaterals: 0, guarantees: 0, unchanged: 0 };
  invalidate_('DB_MASTER', 'M_WHOLESALER'); invalidate_('DB_MASTER', 'M_LIMIT'); invalidate_('DB_MASTER', 'M_COLLATERAL'); invalidate_('DB_MASTER', 'M_GUARANTEE'); invalidate_('DB_PII', 'P_GUARANTOR');
  var wsAll = readTable_('DB_MASTER', 'M_WHOLESALER');
  var reason = '담보현황 파일 적재(' + asOf + ', ' + batchId + ')';
  var ver = function (from) { return { valid_from: from, valid_to: APP.OPEN_END, approval_status: '승인', change_reason: reason, requested_by: 'import', requested_at: nowStr_(), approved_by: sys.user_id, approved_at: nowStr_(), reject_reason: '' }; };

  records.forEach(function (rec) {
    var ws = rec.wholesaler_id;
    var w = wsAll.filter(function (x) { return x.wholesaler_id === ws && !x.is_deleted; })[0];
    var note = ['약정 ' + rec.contract_type, '갱신 ' + rec.renew_year, '허가만료 ' + rec.permit_expiry, rec.collateral_desc, rec.note].filter(Boolean).join(' / ');
    if (!w) {
      w = { wholesaler_id: ws, name: rec.name || ws, representative: rec.name || '', biz_status: '정상', trade_start_date: rec.trade_start_date || asOf, categories: rec.categories, settle_group: '', note: note };
      Object.assign(w, newAuditFields_(sys)); appendObjects_('DB_MASTER', 'M_WHOLESALER', [w]); wsAll.push(w);
      appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [{ status_hist_id: uid_('ST'), wholesaler_id: ws, status: '정상', valid_from: w.trade_start_date, valid_to: APP.OPEN_END, change_reason: '담보현황 적재', created_at: nowStr_(), created_by: sys.user_id }]);
      stat.wholesalers++;
    } else if (w.name !== rec.name || w.categories !== rec.categories || w.note !== note || (rec.trade_start_date && w.trade_start_date !== rec.trade_start_date && /자동 등록/.test(w.note || ''))) {
      var b = JSON.parse(JSON.stringify(w));
      w.name = rec.name || w.name; w.categories = rec.categories || w.categories; w.note = note;
      if (rec.trade_start_date && /자동 등록/.test(b.note || '')) w.trade_start_date = rec.trade_start_date;
      if (!w.representative) w.representative = rec.name || '';
      w.updated_at = nowStr_(); w.updated_by = sys.user_id; w.row_version = Number(w.row_version) + 1;
      writeObject_('DB_MASTER', 'M_WHOLESALER', w); audit_(sys, 'UPDATE', 'DB_MASTER', 'M_WHOLESALER', ws, b, w, reason); stat.wholesalers++;
    }

    // 한도: 유형별 ID 고정(L<ws>-B/M/A). 금액이 바뀐 경우만 새 버전
    Object.keys(rec.limits).forEach(function (type) {
      var id = 'L' + ws + '-' + ({ '기본한도': 'B', '마감한도': 'M', '추가한도': 'A' }[type]);
      var cur = asOfVersions_(readTable_('DB_MASTER', 'M_LIMIT'), 'limit_id', ws, asOf).filter(function (l) { return l.limit_id === id; })[0];
      if (cur && Number(cur.amount) === rec.limits[type]) { stat.unchanged++; return; }
      if (!cur && rec.limits[type] === 0) return;
      var all = readTable_('DB_MASTER', 'M_LIMIT').filter(function (l) { return l.limit_id === id; });
      var vno = all.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
      var row = Object.assign({ limit_id: id, version_no: vno, wholesaler_id: ws, limit_type: type, amount: rec.limits[type], approval_basis: '담보현황 파일 (' + rec.limit_note + ')', approver: '파일 적재' }, ver(asOf));
      closePreviousVersions_(all, 'limit_id', row).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_LIMIT', x.row); });
      appendObjects_('DB_MASTER', 'M_LIMIT', [row]); invalidate_('DB_MASTER', 'M_LIMIT'); stat.limits++;
    });

    // 담보: 종류별 ID 고정(C<ws>-<종류>). 설정금액 = 파일 금액, 평가·내부 인정금액은 비움(내부 기준 확인 전)
    var curCols = asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', ws, asOf);
    Object.keys(rec.collaterals).forEach(function (type) {
      var id = 'C' + ws + '-' + fnv1a_(type).substring(0, 4).toUpperCase();
      var cur = curCols.filter(function (x) { return x.collateral_id === id; })[0];
      var expiry = /보증보험|예금/.test(type) ? rec.collateral_expiry : '';
      if (cur && Number(cur.set_amount) === rec.collaterals[type] && (cur.expiry_date || '') === (expiry || '')) { stat.unchanged++; return; }
      var all = readTable_('DB_MASTER', 'M_COLLATERAL').filter(function (x) { return x.collateral_id === id; });
      var vno = all.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
      var row = Object.assign({ collateral_id: id, version_no: vno, wholesaler_id: ws, collateral_type: type, set_amount: rec.collaterals[type], appraised_amount: '', appraisal_date: '',
        recognized_amount: '', confirmed_date: rec.collateral_change_date || asOf, review_status: '파일 적재(내부 인정금액 미확인)', expiry_date: expiry, evidence_ids: '' }, ver(asOf));
      closePreviousVersions_(all, 'collateral_id', row).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_COLLATERAL', x.row); });
      appendObjects_('DB_MASTER', 'M_COLLATERAL', [row]); invalidate_('DB_MASTER', 'M_COLLATERAL'); stat.collaterals++;
    });
    // 파일에서 사라진 담보 종류는 종료
    curCols.forEach(function (x) {
      var still = Object.keys(rec.collaterals).some(function (type) { return x.collateral_id === 'C' + ws + '-' + fnv1a_(type).substring(0, 4).toUpperCase(); });
      if (!still && x.change_reason.indexOf('담보현황 파일') === 0) { x.valid_to = addDays_(asOf, -1); writeObject_('DB_MASTER', 'M_COLLATERAL', x); stat.collaterals++; }
    });

    // 연대보증
    if (rec.has_guarantee) {
      var gid = 'G' + ws + '-01';
      var curG = asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', ws, asOf).filter(function (x) { return x.guarantee_id === gid; })[0];
      var gref = '';
      if (rec.has_guarantee === '있음' && rec.guarantor_name) {
        var pii = readTable_('DB_PII', 'P_GUARANTOR').filter(function (p) { return p.name === rec.guarantor_name && p.note === 'WS:' + ws && !p.is_deleted; })[0];
        if (!pii) { pii = Object.assign({ guarantor_ref: uid_('GR'), name: rec.guarantor_name, relation: rec.guarantor_relation, note: 'WS:' + ws }, newAuditFields_(sys)); appendObjects_('DB_PII', 'P_GUARANTOR', [pii]); invalidate_('DB_PII', 'P_GUARANTOR'); }
        gref = pii.guarantor_ref;
      }
      if (curG && curG.has_guarantee === rec.has_guarantee && (curG.guarantor_ref || '') === gref) stat.unchanged++;
      else {
        var allG = readTable_('DB_MASTER', 'M_GUARANTEE').filter(function (x) { return x.guarantee_id === gid; });
        var gv = allG.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
        var grow = Object.assign({ guarantee_id: gid, version_no: gv, wholesaler_id: ws, has_guarantee: rec.has_guarantee, guarantor_ref: gref, scope: rec.has_guarantee === '있음' ? '담보현황 기재(범위·한도 미확인)' : '',
          guarantee_limit: '', period_from: '', period_to: '', confirmed_date: rec.updated || asOf, doc_ids: '' }, ver(asOf));
        closePreviousVersions_(allG, 'guarantee_id', grow).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_GUARANTEE', x.row); });
        appendObjects_('DB_MASTER', 'M_GUARANTEE', [grow]); invalidate_('DB_MASTER', 'M_GUARANTEE'); stat.guarantees++;
      }
    }
  });
  audit_(sys, 'IMPORT_COLLATERAL', 'DB_MASTER', '*', batchId, null, stat, reason);
  return stat;
}

/** 파일명에서 기준일 추출: '26.9.16.기준' / '2026-09-16' / 없으면 오늘 */
function nhAsOfFromName_(name) {
  var m = String(name).match(/(\d{2})\.(\d{1,2})\.(\d{1,2})\.?\s*기준/);
  if (m) return '20' + m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = nhDate_(name);
  return d || todayStr_();
}

/**
 * 농협 형식 파일 1개 처리. 반환값은 importFile_ 의 batch 에 합쳐진다.
 * @return { source, status, message, dest, accepted, rejected, dateFrom, dateTo, amount, rowCount }
 */
function importNhFile_(file, batch, settings) {
  var rows = fileToRows_(file);
  var det = detectNhFormat_(rows);
  if (!det) return null;
  batch.source = det.format;
  if (det.format === 'NH_MART') {
    return { status: '참고자료', message: '계통마트 거래실적(EBFW916004)은 채권관리 지표에 쓰지 않아 적재하지 않습니다. 파일은 완료 폴더에 보관합니다.', dest: 'DONE', accepted: 0, rejected: 0, rowCount: rows.length - det.headerRow - 1 };
  }
  if (det.format === 'NH_COLLATERAL') {
    var asOf = nhAsOfFromName_(file.getName());
    var pc = parseNhCollateral_(rows, det, asOf);
    var stat = applyNhCollateral_(pc.records, asOf, batch.batch_id);
    return { status: pc.rejects.length ? '부분적재' : '완료', message: '기준일 ' + asOf + ' / 중도매인 ' + pc.records.length + '명 / 신규·변경 ' + stat.wholesalers + ' / 한도 ' + stat.limits + ' / 담보 ' + stat.collaterals + ' / 보증 ' + stat.guarantees + ' / 변동 없음 ' + stat.unchanged + ' / 거부 ' + pc.rejects.length,
      dest: 'DONE', accepted: pc.records.length, rejected: pc.rejects.length, rejects: pc.rejects, rowCount: pc.records.length + pc.rejects.length, dateFrom: asOf, dateTo: asOf };
  }
  var parsed = det.format === 'NH_SALES_DAILY' ? parseNhSalesDaily_(rows, det, {}) : parseNhSalesMonthly_(rows, det);
  // 미등록 중도매인 자동 등록
  var firstDates = {};
  parsed.records.forEach(function (r) { var d = r.txn_date || (r.ym + '-01'); if (!firstDates[r.wholesaler_id] || d < firstDates[r.wholesaler_id]) firstDates[r.wholesaler_id] = d; });
  var created = autoRegisterWs_(parsed.names, firstDates, settings);
  var wsIds = {}; readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { if (!w.is_deleted) wsIds[w.wholesaler_id] = true; });
  var table = det.format === 'NH_SALES_DAILY' ? 'R_SALES' : 'R_SALES_MONTHLY';
  var existing = {}; readTable_('DB_RAW', table).forEach(function (r) { existing[r.row_key] = r.content_hash; });
  var accepted = [], dup = 0, conflicts = 0, rejects = parsed.rejects.slice(), amount = 0, from = '', to = '';
  parsed.records.forEach(function (r) {
    if (!wsIds[r.wholesaler_id]) { rejects.push({ line: 0, code: 'UNKNOWN_WS', msg: '미등록 중도매인(자동 등록 꺼짐): ' + r.wholesaler_id, raw: JSON.stringify(r) }); return; }
    var rec = {}; Object.keys(r).forEach(function (k) { if (k.indexOf('_') !== 0) rec[k] = r[k]; });
    rec.row_key = det.format === 'NH_SALES_DAILY' ? rec.source_txn_no + '|1' : rec.wholesaler_id + '|' + rec.ym;
    rec.content_hash = fnv1a_(Object.keys(rec).sort().map(function (k) { return k + '=' + rec[k]; }).join('|'));
    if (existing[rec.row_key] !== undefined) {
      if (existing[rec.row_key] === rec.content_hash) { dup++; return; }
      // 같은 날·같은 조합의 금액이 달라짐 = 원천 정정. 일별은 거부(정정 파일 확인), 월별은 수정본 적재
      if (det.format === 'NH_SALES_DAILY') { conflicts++; rejects.push({ line: 0, code: 'KEY_CONFLICT', msg: '이미 적재된 일자·조합의 금액이 다름: ' + rec.row_key, raw: JSON.stringify(rec) }); return; }
    }
    existing[rec.row_key] = rec.content_hash;
    rec.batch_id = batch.batch_id; rec.loaded_at = nowStr_();
    accepted.push(rec); amount += Number(rec.amount);
    var d = rec.txn_date || rec.ym; if (!from || d < from) from = d; if (!to || d > to) to = d;
  });
  appendObjects_('DB_RAW', table, accepted);
  var status = accepted.length === 0 && rejects.length ? '실패' : (rejects.length ? '부분적재' : '완료');
  return { status: status, dest: status === '실패' ? 'ERROR' : 'DONE', accepted: accepted.length, rejected: rejects.length, rejects: rejects, duplicates: dup, rowCount: parsed.records.length + parsed.rejects.length,
    dateFrom: from, dateTo: to, amount: amount,
    message: (det.format === 'NH_SALES_DAILY' ? '일별 낙찰 실적' : '월별 사업실적') + ' / 적재 ' + accepted.length + ' / 중복 ' + dup + ' / 충돌 ' + conflicts + ' / 거부 ' + rejects.length + (created.length ? ' / 중도매인 자동 등록 ' + created.length + '명' : '') + ' / 관리합계 없음(농협 파일)' };
}
