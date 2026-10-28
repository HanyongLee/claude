/**
 * Master.gs — 기초자료 업무 로직 (중도매인·영업상태·담당·담보·보증·한도·사용자·증빙)
 *
 * - 담보·보증·한도는 값을 덮어쓰지 않고 새 버전을 '승인대기'로 등록 → 관리자 승인 시 유효.
 *   승인 시 직전 승인 버전의 종료일을 새 버전 시작 전날로 닫는다. 과거 기준일 조회가 가능하다.
 * - 한도 유형(기본/마감/추가)은 내부 규정 확인 전까지 합산하지 않는다.
 */

var VERSIONED = {
  M_COLLATERAL: { id: 'collateral_id', prefix: 'C', label: '담보',
    required: ['collateral_type', 'set_amount', 'valid_from'],
    nums: ['set_amount', 'appraised_amount', 'recognized_amount'],
    dates: ['appraisal_date', 'confirmed_date', 'expiry_date'],
    fields: ['collateral_type', 'set_amount', 'appraised_amount', 'appraisal_date', 'recognized_amount',
      'confirmed_date', 'review_status', 'expiry_date', 'evidence_ids'] },
  M_GUARANTEE: { id: 'guarantee_id', prefix: 'G', label: '연대보증',
    required: ['has_guarantee', 'valid_from'],
    nums: ['guarantee_limit'],
    dates: ['period_from', 'period_to', 'confirmed_date'],
    fields: ['has_guarantee', 'guarantor_ref', 'scope', 'guarantee_limit', 'period_from', 'period_to',
      'confirmed_date', 'doc_ids'] },
  M_LIMIT: { id: 'limit_id', prefix: 'L', label: '한도',
    required: ['limit_type', 'amount', 'valid_from', 'approval_basis'],
    nums: ['amount'],
    dates: [],
    fields: ['limit_type', 'amount', 'approval_basis', 'approver'] }
};

var LIMIT_TYPES = ['기본한도', '마감한도', '추가한도'];
var WS_STATUSES = ['정상', '휴업', '폐업'];

function requireText_(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error(label + '은(는) 필수입니다.');
  return String(v).trim();
}
function optDate_(v, label) {
  if (v === undefined || v === null || v === '') return '';
  if (!isYmd_(v)) throw new Error(label + ' 날짜 형식 오류(yyyy-MM-dd): ' + v);
  return v;
}
function optNum_(v, label) {
  if (v === undefined || v === null || v === '') return '';
  var n = Number(String(v).replace(/,/g, ''));
  if (!isFinite(n)) throw new Error(label + ' 숫자 형식 오류: ' + v);
  return n;
}

function findWs_(wsId) {
  return readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return w.wholesaler_id === wsId && !w.is_deleted; })[0];
}

/* ───────────── 중도매인 ───────────── */

function createWholesaler_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.wholesaler_id, '중도매인코드').toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(id)) throw new Error('중도매인코드는 영문 대문자·숫자 2~20자입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_WHOLESALER');
    if (findWs_(id)) throw new Error('이미 있는 중도매인코드입니다: ' + id);
    var start = optDate_(requireText_(o.trade_start_date, '거래 시작일'), '거래 시작일');
    var row = {
      wholesaler_id: id, name: requireText_(o.name, '상호'), representative: requireText_(o.representative, '대표자'),
      biz_status: '정상', trade_start_date: start, categories: o.categories || APP.CATEGORIES.join(','),
      settle_group: o.settle_group || '', note: o.note || ''
    };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_WHOLESALER', [row]);
    var hist = { status_hist_id: uid_('ST'), wholesaler_id: id, status: '정상', valid_from: start,
      valid_to: APP.OPEN_END, change_reason: '신규 등록', created_at: nowStr_(), created_by: user.user_id };
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [hist]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_WHOLESALER', id, null, row, reason);
    return stripInternal_(row);
  });
}

function updateWholesaler_(user, wsId, changes, expectedVersion, reason) {
  requireText_(reason, '변경 사유');
  var allowed = ['name', 'representative', 'categories', 'settle_group', 'note'], c = {};
  allowed.forEach(function (k) { if (changes[k] !== undefined) c[k] = String(changes[k]).trim(); });
  if (c.name === '') throw new Error('상호는 비울 수 없습니다.');
  return stripInternal_(updateWithVersion_('DB_MASTER', 'M_WHOLESALER', 'wholesaler_id', wsId, expectedVersion, c, user, reason));
}

/** 영업 상태 변경: 이력에 기간으로 기록, 시작일이 오늘 이전이면 현재 상태에도 반영 */
function changeWsStatus_(user, wsId, status, validFrom, reason) {
  requireText_(reason, '변경 사유');
  if (WS_STATUSES.indexOf(status) < 0) throw new Error('영업 상태는 ' + WS_STATUSES.join('/') + ' 중 하나입니다.');
  optDate_(requireText_(validFrom, '적용 시작일'), '적용 시작일');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_WS_STATUS_HIST');
    invalidate_('DB_MASTER', 'M_WHOLESALER');
    var ws = findWs_(wsId);
    if (!ws) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
    readTable_('DB_MASTER', 'M_WS_STATUS_HIST').forEach(function (h) {
      if (h.wholesaler_id !== wsId) return;
      if (h.valid_from >= validFrom) throw new Error('적용 시작일 이후에 이미 상태 이력이 있습니다(' + h.valid_from + ').');
      if ((h.valid_to || APP.OPEN_END) >= validFrom) {
        var before = JSON.parse(JSON.stringify(h));
        h.valid_to = addDays_(validFrom, -1);
        writeObject_('DB_MASTER', 'M_WS_STATUS_HIST', h);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_WS_STATUS_HIST', h.status_hist_id, before, h, reason);
      }
    });
    var hist = { status_hist_id: uid_('ST'), wholesaler_id: wsId, status: status, valid_from: validFrom,
      valid_to: APP.OPEN_END, change_reason: reason, created_at: nowStr_(), created_by: user.user_id };
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [hist]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_WS_STATUS_HIST', hist.status_hist_id, null, hist, reason);
    if (validFrom <= todayStr_()) {
      var before2 = JSON.parse(JSON.stringify(ws));
      ws.biz_status = status; ws.updated_at = nowStr_(); ws.updated_by = user.user_id;
      ws.row_version = Number(ws.row_version) + 1;
      writeObject_('DB_MASTER', 'M_WHOLESALER', ws);
      audit_(user, 'UPDATE', 'DB_MASTER', 'M_WHOLESALER', wsId, before2, ws, reason);
    }
    return hist;
  });
}

/* ───────────── 담당 지정 ───────────── */

function setAssignment_(user, wsId, userId, validFrom, reason) {
  requireText_(reason, '변경 사유');
  optDate_(requireText_(validFrom, '적용 시작일'), '적용 시작일');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_ASSIGNMENT');
    if (!findWs_(wsId)) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
    var target = readTable_('DB_MASTER', 'M_USER').filter(function (u) { return u.user_id === userId && u.status === '사용'; })[0];
    if (!target || target.role !== 'AUCTIONEER') throw new Error('담당자는 사용 중인 경매사 계정이어야 합니다.');
    readTable_('DB_MASTER', 'M_ASSIGNMENT').forEach(function (a) {
      if (a.wholesaler_id !== wsId || a.is_deleted) return;
      if (a.valid_from >= validFrom) throw new Error('적용 시작일 이후의 담당 지정이 이미 있습니다(' + a.valid_from + ').');
      if ((a.valid_to || APP.OPEN_END) >= validFrom) {
        var before = JSON.parse(JSON.stringify(a));
        a.valid_to = addDays_(validFrom, -1);
        a.updated_at = nowStr_(); a.updated_by = user.user_id; a.row_version = Number(a.row_version) + 1;
        writeObject_('DB_MASTER', 'M_ASSIGNMENT', a);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_ASSIGNMENT', a.assign_id, before, a, reason);
      }
    });
    var row = { assign_id: uid_('AS'), wholesaler_id: wsId, user_id: userId, valid_from: validFrom,
      valid_to: APP.OPEN_END, change_reason: reason };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_ASSIGNMENT', [row]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_ASSIGNMENT', row.assign_id, null, row, reason);
    return stripInternal_(row);
  });
}

/* ───────────── 담보·보증·한도 버전 ───────────── */

function submitVersion_(user, table, o, reason) {
  var def = VERSIONED[table];
  if (!def) throw new Error('버전 관리 대상이 아닙니다: ' + table);
  requireText_(reason, '변경 사유');
  def.required.forEach(function (k) { requireText_(o[k], k); });
  if (table === 'M_LIMIT' && LIMIT_TYPES.indexOf(o.limit_type) < 0) throw new Error('한도 유형은 ' + LIMIT_TYPES.join('/') + ' 중 하나입니다.');
  var validFrom = optDate_(o.valid_from, '적용 시작일');
  var validTo = optDate_(o.valid_to, '적용 종료일') || APP.OPEN_END;
  if (validTo < validFrom) throw new Error('적용 종료일이 시작일보다 빠릅니다.');

  return withLock_(function () {
    invalidate_('DB_MASTER', table);
    if (!findWs_(o.wholesaler_id)) throw new Error('중도매인을 찾을 수 없습니다: ' + o.wholesaler_id);
    var rows = readTable_('DB_MASTER', table);
    var id = o[def.id] ? String(o[def.id]) : '';
    var version = 1;
    if (id) {
      var same = rows.filter(function (r) { return r[def.id] === id; });
      if (!same.length) throw new Error(def.label + ' ID를 찾을 수 없습니다: ' + id);
      if (same[0].wholesaler_id !== o.wholesaler_id) throw new Error('다른 중도매인의 ' + def.label + '입니다.');
      if (same.some(function (r) { return r.approval_status === '승인대기'; })) throw new Error('승인 대기 중인 버전이 있습니다. 먼저 처리하세요.');
      version = same.reduce(function (mx, r) { return Math.max(mx, Number(r.version_no)); }, 0) + 1;
    } else {
      id = def.prefix + o.wholesaler_id + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 4).toUpperCase();
    }
    var row = { wholesaler_id: o.wholesaler_id, version_no: version, valid_from: validFrom, valid_to: validTo,
      approval_status: '승인대기', change_reason: reason, requested_by: user.user_id, requested_at: nowStr_(),
      approved_by: '', approved_at: '', reject_reason: '' };
    row[def.id] = id;
    def.fields.forEach(function (k) {
      if (def.nums.indexOf(k) >= 0) row[k] = optNum_(o[k], k);
      else if (def.dates.indexOf(k) >= 0) row[k] = optDate_(o[k], k);
      else row[k] = o[k] === undefined ? '' : String(o[k]).trim();
    });
    appendObjects_('DB_MASTER', table, [row]);
    audit_(user, 'SUBMIT_VERSION', 'DB_MASTER', table, id + '#v' + version, null, row, reason);
    return row;
  });
}

function decideVersion_(user, table, id, versionNo, decision, reason) {
  var def = VERSIONED[table];
  if (!def) throw new Error('버전 관리 대상이 아닙니다: ' + table);
  if (['승인', '반려'].indexOf(decision) < 0) throw new Error('결정은 승인/반려 중 하나입니다.');
  if (decision === '반려') requireText_(reason, '반려 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', table);
    var rows = readTable_('DB_MASTER', table);
    var row = rows.filter(function (r) { return r[def.id] === id && Number(r.version_no) === Number(versionNo); })[0];
    if (!row) throw new Error('대상 버전을 찾을 수 없습니다.');
    if (row.approval_status !== '승인대기') throw new Error('이미 처리된 버전입니다(' + row.approval_status + ').');
    if (!APP.ALLOW_SELF_APPROVAL && row.requested_by === user.user_id) throw new Error('요청자 본인은 승인·반려할 수 없습니다.');
    var before = JSON.parse(JSON.stringify(row));
    var now = nowStr_();
    if (decision === '승인') {
      closePreviousVersions_(rows, def.id, row).forEach(function (x) {
        var b = JSON.parse(JSON.stringify(x.row));
        x.row.valid_to = x.newValidTo;
        writeObject_('DB_MASTER', table, x.row);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', table, id + '#v' + x.row.version_no, b, x.row, '새 버전 v' + row.version_no + ' 승인');
      });
      row.approval_status = '승인';
    } else {
      row.approval_status = '반려';
      row.reject_reason = reason;
    }
    row.approved_by = user.user_id;
    row.approved_at = now;
    writeObject_('DB_MASTER', table, row);
    audit_(user, decision === '승인' ? 'APPROVE' : 'REJECT', 'DB_MASTER', table, id + '#v' + versionNo, before, row, reason || '');
    return stripInternal_(row);
  });
}

function pendingVersions_() {
  var out = [];
  Object.keys(VERSIONED).forEach(function (t) {
    readTable_('DB_MASTER', t).forEach(function (r) {
      if (r.approval_status === '승인대기') {
        var c = stripInternal_(r);
        c.table = t; c.tableLabel = VERSIONED[t].label; c.id = r[VERSIONED[t].id];
        out.push(c);
      }
    });
  });
  return out;
}

/* ───────────── 보증인(민감정보) ───────────── */

function createGuarantor_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var row = { guarantor_ref: uid_('GR'), name: requireText_(o.name, '보증인 성명'), relation: o.relation || '', note: o.note || '' };
  Object.assign(row, newAuditFields_(user));
  appendObjects_('DB_PII', 'P_GUARANTOR', [row]);
  audit_(user, 'CREATE', 'DB_PII', 'P_GUARANTOR', row.guarantor_ref, null, { guarantor_ref: row.guarantor_ref }, reason); // 이력에 개인정보 미기록
  return { guarantor_ref: row.guarantor_ref };
}

/* ───────────── 사용자 ───────────── */

function saveUser_(admin, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.user_id, '사용자 이메일').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(id)) throw new Error('이메일 형식이 아닙니다.');
  if (!ROLES[o.role]) throw new Error('역할 오류: ' + o.role);
  var status = o.status || '사용';
  if (['사용', '중지'].indexOf(status) < 0) throw new Error('상태는 사용/중지 중 하나입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var users = readTable_('DB_MASTER', 'M_USER');
    var cur = users.filter(function (u) { return u.user_id === id && !u.is_deleted; })[0];
    var admins = users.filter(function (u) { return u.role === 'ADMIN' && u.status === '사용' && !u.is_deleted; });
    if (cur && cur.role === 'ADMIN' && (o.role !== 'ADMIN' || status !== '사용') && admins.length <= 1) {
      throw new Error('마지막 관리자의 역할·상태는 바꿀 수 없습니다.');
    }
    if (!cur) {
      var row = { user_id: id, name: requireText_(o.name, '이름'), role: o.role, status: status };
      Object.assign(row, newAuditFields_(admin));
      appendObjects_('DB_MASTER', 'M_USER', [row]);
      audit_(admin, 'CREATE', 'DB_MASTER', 'M_USER', id, null, row, reason);
      return stripInternal_(row);
    }
    var before = JSON.parse(JSON.stringify(cur));
    cur.name = o.name || cur.name; cur.role = o.role; cur.status = status;
    cur.updated_at = nowStr_(); cur.updated_by = admin.user_id; cur.row_version = Number(cur.row_version) + 1;
    writeObject_('DB_MASTER', 'M_USER', cur);
    audit_(admin, 'UPDATE', 'DB_MASTER', 'M_USER', id, before, cur, reason);
    return stripInternal_(cur);
  });
}

/* ───────────── 증빙 ───────────── */

function uploadEvidence_(user, o) {
  if (!findWs_(o.wholesaler_id)) throw new Error('중도매인을 찾을 수 없습니다: ' + o.wholesaler_id);
  requireText_(o.file_name, '파일명');
  requireText_(o.doc_type, '문서 유형');
  var bytes = Utilities.base64Decode(requireText_(o.base64, '파일 내용'));
  var parent = folder_('EVIDENCE');
  var it = parent.getFoldersByName(o.wholesaler_id);
  var wsFolder = it.hasNext() ? it.next() : parent.createFolder(o.wholesaler_id);
  var safeName = String(o.file_name).replace(/[\\/:*?"<>|]/g, '_');
  var file = wsFolder.createFile(Utilities.newBlob(bytes, o.mime_type || 'application/octet-stream',
    Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss') + '_' + safeName));
  var row = { evidence_id: uid_('EV'), wholesaler_id: o.wholesaler_id, target_table: o.target_table || '',
    target_id: o.target_id || '', file_id: file.getId(), file_name: safeName, file_hash: sha256Hex_(bytes),
    doc_type: o.doc_type, created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_MASTER', 'M_EVIDENCE', [row]);
  audit_(user, 'UPLOAD', 'DB_MASTER', 'M_EVIDENCE', row.evidence_id, null, row, '증빙 업로드');
  logAccess_(user.user_id, 'evidence.upload', row.evidence_id, '허용', safeName);
  return stripInternal_(row);
}
