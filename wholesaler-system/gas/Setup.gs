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
    report.push('기준값 기본(가정값) 적재: ' + seedSettings_(owner) + '건');
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
  var mine = ['triggerDailyPipeline', 'triggerDailyBackup', 'triggerContinuePipeline', 'triggerContinueBacktest', 'triggerDailyNotify'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerDailyPipeline').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('triggerDailyBackup').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('triggerDailyNotify').timeBased().everyDays(1).atHour(8).create();
  return '트리거 설치: 매일 06시 정기 처리, 02시 백업, 08시 요약 알림(설정 NOTIFY_EMAIL=예 일 때만 발송)';
}

/** 없는 설정 키만 가정값으로 넣는다. 이미 입력된 실제 값은 건드리지 않는다. */
function seedSettings_(user) {
  invalidate_('DB_MASTER', 'M_SETTING');
  var have = {};
  readTable_('DB_MASTER', 'M_SETTING').forEach(function (r) { have[r.key] = true; });
  var rows = SETTING_DEFAULTS.filter(function (d) { return !have[d[0]]; }).map(function (d) {
    var r = { key: d[0], value: d[1], label: d[2], unit: d[3], is_assumed: true, note: '가정값(코드 기본). 내부 기준 확인 후 수정' };
    Object.assign(r, newAuditFields_(user)); return r;
  });
  appendObjects_('DB_MASTER', 'M_SETTING', rows);
  return rows.length;
}

/**
 * [편집기 실행] 한 번에 설정: 폴더·시트 생성 → (비어 있으면) 가상 데이터 → 정기 처리 → 트리거 설치 → 보안 점검
 * 실자료 운영 시에는 setupAllWithoutVirtualData 를 쓴다.
 */
function setupAll() { return setupAll_(true); }
function setupAllWithoutVirtualData() { return setupAll_(false); }

function setupAll_(withVirtual) {
  requireOwner_();
  var out = [];
  out.push('[1/5] 설정: ' + setupSystem().slice(-1)[0]);
  invalidate_('DB_MASTER', 'M_WHOLESALER');
  if (withVirtual && !readTable_('DB_MASTER', 'M_WHOLESALER').length) {
    var end = addDays_(todayStr_(), -1), start = addMonths_(ymOf_(end), -24) + '-01';
    out.push('[2/5] 가상 데이터: ' + JSON.stringify(loadVirtualData_({ startDate: start, endDate: end, seed: 20261027 })));
  } else out.push('[2/5] 가상 데이터: 건너뜀(' + (withVirtual ? '기초자료가 이미 있음' : '실자료 모드') + ')');
  var r = runPipeline_('setupAll'), n = 0;
  while (r.status === '계속' && n++ < 30) { Utilities.sleep(2000); r = runPipeline_('setupAll'); }
  out.push('[3/5] 정기 처리: ' + JSON.stringify(r));
  out.push('[4/5] ' + installTriggers());
  var sec = checkSecurity();
  out.push('[5/5] 보안 점검: ' + (sec.warnings.length ? '경고 ' + sec.warnings.join(' / ') : '모두 비공개'));
  out.push('다음: 배포 → 새 배포 → 웹 앱(실행: 나). 액세스는 "나만"(혼자 시험) 또는 "Google 계정이 있는 모든 사용자"(임직원 접속코드 방식, 설정 AUTH_MODE=code).');
  Logger.log(out.join('\n'));
  return out;
}

/**
 * [편집기 실행] 기존 드라이브 폴더(예: 담당자의 '2611_AI혁신센터_채권관리')를 시스템 루트로 지정한다.
 * 폴더 안에 하위 폴더·저장소 시트를 만들고, 폴더에 이미 있는 엑셀 파일은 다음 정기 처리 때 자동으로 읽는다.
 * @param folderIdOrName 폴더 ID 또는 이름(이름이면 내 드라이브에서 같은 이름의 첫 폴더)
 */
function setupWithFolder(folderIdOrName) {
  requireOwner_();
  var folder = null;
  try { folder = DriveApp.getFolderById(folderIdOrName); } catch (e) { folder = null; }
  if (!folder) {
    var it = DriveApp.getFoldersByName(folderIdOrName);
    if (!it.hasNext()) throw new Error('폴더를 찾을 수 없습니다: ' + folderIdOrName + ' (폴더 ID 또는 정확한 이름)');
    folder = it.next();
  }
  setProp_('ROOT_FOLDER_ID', folder.getId());
  var r = setupSystem();
  r.unshift('루트 폴더 지정: ' + folder.getName() + ' (' + folder.getId() + ')');
  Logger.log(r.join('\n'));
  return r;
}

/**
 * [편집기 실행] 매뉴얼 폴더(HWP·PDF·Google 문서)를 문서·버전으로 등록하고, 상황 코드 기본 세트에 근거 후보 문서를 연결한다.
 * 예: registerManuals('기초 자료')
 */
function registerManuals(folderIdOrName) {
  requireOwner_();
  var user = ownerAsUser_();
  var r = registerManualFolder_(user, folderIdOrName);
  var s = seedSituations_(user);
  var msg = '문서 ' + r.docs + '건 / 버전 ' + r.versions + '건 등록, 건너뜀 ' + r.skipped + ' / 상황 코드 생성 ' + s.created + ' 갱신 ' + s.updated +
    (r.noDate.length ? '\n시행일 미확인(파일명에 개정일 없음): ' + r.noDate.join(', ') : '');
  Logger.log(msg);
  return { message: msg, files: r.files };
}
