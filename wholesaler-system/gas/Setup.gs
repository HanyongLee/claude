/**
 * Setup.gs — 초기 설정 (편집기에서 소유 계정으로 실행)
 * 여러 번 실행해도 안전하다(없는 폴더·파일·시트·컬럼만 만든다).
 */

/** [편집기 실행] 폴더·저장소·시트·초기 관리자를 만든다. */
function setupSystem() {
  requireOwner_();
  return withLock_(function () {
    var report = [];
    var root = getOrCreateRoot_(report);
    Object.keys(FOLDERS).forEach(function (k) { getOrCreateSubfolder_(root, k, report); });
    Object.keys(SCHEMA).forEach(function (db) { ensureDb_(db, root, report); });

    var owner = ownerAsUser_();
    invalidate_('DB_MASTER', 'M_USER');
    if (!readTable_('DB_MASTER', 'M_USER').length) {
      var admin = { user_id: owner.user_id, name: '시스템 관리자', role: 'ADMIN', status: '사용' };
      Object.assign(admin, newAuditFields_(owner));
      appendObjects_('DB_MASTER', 'M_USER', [admin]);
      audit_(owner, 'CREATE', 'DB_MASTER', 'M_USER', admin.user_id, null, admin, '초기 관리자 등록');
      report.push('초기 관리자 등록: ' + admin.user_id);
    }
    setProp_('APP_VERSION', APP.VERSION);
    report.push('설정 완료. 다음: (가상 데이터) loadVirtualData → runPipeline → 웹앱 배포');
    Logger.log(report.join('\n'));
    return report;
  });
}

function getOrCreateRoot_(report) {
  var id = prop_('ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { report.push('기존 루트 폴더를 열 수 없어 새로 만듭니다.'); }
  }
  var f = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
  setProp_('ROOT_FOLDER_ID', f.getId());
  report.push('루트 폴더 생성: ' + f.getName());
  return f;
}

function getOrCreateSubfolder_(root, key, report) {
  var id = prop_('FOLDER_' + key);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 아래에서 새로 만든다 */ }
  }
  var f = root.createFolder(FOLDERS[key]);
  setProp_('FOLDER_' + key, f.getId());
  report.push('폴더 생성: ' + FOLDERS[key]);
  return f;
}

function folder_(key) {
  var id = prop_('FOLDER_' + key);
  if (!id) throw new Error('폴더가 설정되지 않았습니다(' + key + '). setupSystem 을 실행하세요.');
  return DriveApp.getFolderById(id);
}

function ensureDb_(db, root, report) {
  var id = prop_('DBID_' + db), ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(APP.NAME + '_' + db);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    setProp_('DBID_' + db, ss.getId());
    report.push('저장소 생성: ' + ss.getName());
  }
  ss.setSpreadsheetTimeZone(APP.TZ);
  _ssMemo[db] = ss;

  Object.keys(SCHEMA[db]).forEach(function (table) {
    var cols = colsOf_(db, table);
    var sh = ss.getSheetByName(table);
    if (!sh) { sh = ss.insertSheet(table); report.push('  시트 생성: ' + db + '.' + table); }
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());

    var existing = sh.getRange(1, 1, 1, cols.length).getValues()[0].map(String);
    var want = cols.map(function (c) { return c.name; });
    var blank = existing.every(function (v) { return v === ''; });
    if (!blank && existing.join('|') !== want.join('|')) {
      // 끝에 컬럼이 추가된 경우만 자동 반영. 순서·이름이 바뀐 경우는 자료 보호를 위해 중단
      var prefixOk = existing.every(function (v, i) { return v === '' || v === want[i]; });
      if (!prefixOk && sh.getLastRow() > 1) {
        throw new Error('컬럼 구조가 다릅니다(' + db + '.' + table + '). 자료가 있어 자동 변경하지 않습니다. 이관 절차를 따르세요.');
      }
    }
    sh.getRange(1, 1, 1, cols.length).setValues([want]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    cols.forEach(function (c, j) {
      if (c.type === 'text' || c.type === 'date' || c.type === 'datetime' || c.type === 'json') {
        sh.getRange(1, j + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  });

  // 새 파일의 기본 시트 제거
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (!SCHEMA[db][n] && (n === 'Sheet1' || n === '시트1') && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

/** [편집기 실행] 저장소·폴더 공유 상태 점검 — 사용자가 시트에 직접 접근하면 웹앱 권한 통제가 무력화된다. */
function checkSecurity() {
  requireOwner_();
  var owner = ownerEmail_(), warn = [], ok = [];
  var targets = Object.keys(SCHEMA).map(function (db) { return { name: db, file: DriveApp.getFileById(prop_('DBID_' + db)) }; });
  targets.push({ name: '루트 폴더', file: DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')) });
  targets.forEach(function (t) {
    var access = String(t.file.getSharingAccess());
    var others = t.file.getEditors().concat(t.file.getViewers())
      .map(function (u) { return String(u.getEmail()).toLowerCase(); })
      .filter(function (e) { return e && e !== owner; });
    if (access !== 'PRIVATE') warn.push(t.name + ': 링크 공유 켜짐(' + access + ')');
    if (others.length) warn.push(t.name + ': 소유자 외 접근자 ' + others.join(', '));
    if (access === 'PRIVATE' && !others.length) ok.push(t.name + ': 비공개');
  });
  var res = { warnings: warn, ok: ok };
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** [편집기 실행] 정기 처리 트리거 설치. 시각은 [가정]: 06시 처리, 02시 백업 */
function installTriggers() {
  requireOwner_();
  var mine = ['triggerDailyPipeline', 'triggerDailyBackup', 'triggerContinuePipeline'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerDailyPipeline').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('triggerDailyBackup').timeBased().everyDays(1).atHour(2).create();
  return '트리거 설치: 매일 06시 정기 처리, 02시 백업';
}
