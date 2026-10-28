/**
 * Db.gs — 저장소(Google Sheets) 접근 계층
 * - 시트는 한 번에 읽고(실행 1회당 메모리 캐시) 한 번에 쓴다.
 * - 날짜는 'yyyy-MM-dd' 문자열로 저장한다(텍스트 서식 지정 + 읽을 때 정규화).
 */

var _ssMemo = {};
var _tableMemo = {};

function prop_(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp_(key, val) { PropertiesService.getScriptProperties().setProperty(key, val); }

function nowStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function uid_(prefix) {
  return prefix + Utilities.formatDate(new Date(), APP.TZ, 'yyMMddHHmmss') + '-' +
    Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
}

function openDb_(db) {
  if (_ssMemo[db]) return _ssMemo[db];
  var id = prop_('DBID_' + db);
  if (!id) throw new Error('저장소가 설정되지 않았습니다(' + db + '). 편집기에서 setupSystem 을 먼저 실행하세요.');
  _ssMemo[db] = SpreadsheetApp.openById(id);
  return _ssMemo[db];
}

function colsOf_(db, table) {
  var def = SCHEMA[db] && SCHEMA[db][table];
  if (!def) throw new Error('스키마에 없는 테이블: ' + db + '.' + table);
  return def.map(function (s) { var p = s.split(':'); return { name: p[0], type: p[1] }; });
}

function getSheet_(db, table) {
  var sh = openDb_(db).getSheetByName(table);
  if (!sh) throw new Error('시트 없음: ' + db + '.' + table + ' — setupSystem 을 다시 실행하세요.');
  return sh;
}

function toCell_(v, type) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'num': return v === '' ? '' : Number(v);
    case 'bool': return v === true || v === 'TRUE' || v === 'true';
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    case 'date': return v instanceof Date ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd') : String(v);
    case 'datetime': return v instanceof Date ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss') : String(v);
    default: return String(v);
  }
}

function fromCell_(v, type) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, APP.TZ, type === 'datetime' ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  switch (type) {
    case 'num': return v === '' || v === null ? '' : Number(v);
    case 'bool': return v === true || v === 'TRUE' || v === 'true';
    default: return v === null || v === undefined ? '' : String(v);
  }
}

/** 테이블 전체를 객체 배열로 읽는다. 각 객체에 __row(시트 행 번호)를 붙인다. */
function readTable_(db, table) {
  var k = db + '.' + table;
  if (_tableMemo[k]) return _tableMemo[k];
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var last = sh.getLastRow(), out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { __row: i + 2 };
      for (var j = 0; j < cols.length; j++) o[cols[j].name] = fromCell_(vals[i][j], cols[j].type);
      out.push(o);
    }
  }
  _tableMemo[k] = out;
  return out;
}

function invalidate_(db, table) { delete _tableMemo[db + '.' + table]; }

function objToRow_(cols, o) { return cols.map(function (c) { return toCell_(o[c.name], c.type); }); }

function ensureRows_(sh, lastRowNeeded) {
  var max = sh.getMaxRows();
  if (max < lastRowNeeded) sh.insertRowsAfter(max, lastRowNeeded - max);
}

/** 행 추가 (일괄) */
function appendObjects_(db, table, objs) {
  if (!objs.length) return;
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var start = sh.getLastRow() + 1;
  ensureRows_(sh, start + objs.length - 1);
  sh.getRange(start, 1, objs.length, cols.length).setValues(objs.map(function (o) { return objToRow_(cols, o); }));
  var memo = _tableMemo[db + '.' + table];
  if (memo) objs.forEach(function (o, i) {
    var c = {}; cols.forEach(function (col) { c[col.name] = fromCell_(toCell_(o[col.name], col.type), col.type); });
    c.__row = start + i; memo.push(c);
  });
}

/** 한 행 덮어쓰기 (객체에 __row 필요) */
function writeObject_(db, table, o) {
  if (!o.__row) throw new Error('행 번호 없음: ' + table);
  var cols = colsOf_(db, table);
  getSheet_(db, table).getRange(o.__row, 1, 1, cols.length).setValues([objToRow_(cols, o)]);
}

/** 테이블 전체 교체 (재생성 가능한 집계 테이블 전용) */
function rewriteTable_(db, table, objs) {
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (objs.length) {
    ensureRows_(sh, objs.length + 1);
    var CHUNK = 20000;
    for (var i = 0; i < objs.length; i += CHUNK) {
      var part = objs.slice(i, i + CHUNK);
      sh.getRange(2 + i, 1, part.length, cols.length).setValues(part.map(function (o) { return objToRow_(cols, o); }));
    }
  }
  invalidate_(db, table);
}

/** 스크립트 잠금 안에서 실행 (쓰기 경합·중복 생성 방지) */
function withLock_(fn, waitMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 30000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * 행 버전 검사 후 수정 (동시 수정 충돌 방지)
 * @return 수정된 객체
 */
function updateWithVersion_(db, table, keyField, keyVal, expectedVersion, changes, user, reason) {
  return withLock_(function () {
    invalidate_(db, table);
    var row = readTable_(db, table).filter(function (r) { return r[keyField] === keyVal && !r.is_deleted; })[0];
    if (!row) throw new Error('대상을 찾을 수 없습니다: ' + keyVal);
    if (Number(row.row_version) !== Number(expectedVersion)) {
      throw new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다(현재 버전 ' + row.row_version +
        ', 화면 버전 ' + expectedVersion + '). 새로 고친 뒤 다시 입력하세요.');
    }
    var before = JSON.parse(JSON.stringify(row));
    Object.keys(changes).forEach(function (k) { row[k] = changes[k]; });
    row.updated_at = nowStr_();
    row.updated_by = user.user_id;
    row.row_version = Number(row.row_version) + 1;
    writeObject_(db, table, row);
    audit_(user, 'UPDATE', db, table, keyVal, before, row, reason);
    return row;
  });
}

function newAuditFields_(user) {
  var n = nowStr_();
  return { created_at: n, created_by: user.user_id, updated_at: n, updated_by: user.user_id, row_version: 1, is_deleted: false };
}

function stripInternal_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k.indexOf('__') !== 0) c[k] = o[k]; });
  return c;
}
