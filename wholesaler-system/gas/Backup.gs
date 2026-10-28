/**
 * Backup.gs — 백업·복구
 * - 매일 모든 저장소 파일 사본을 90_백업/yyyyMMdd 폴더에 만든다.
 * - 일 백업은 APP.BACKUP_KEEP_DAILY 세대, 그 밖에 각 월의 마지막 백업은 APP.BACKUP_KEEP_MONTHLY 개월 보관.
 * - 복구는 원본을 지우지 않는다: 백업 사본을 새 작업본으로 복사하고 연결만 바꾼 뒤, 기존 파일 이름에 '_교체됨' 표시.
 */

/** [트리거] 매일 백업 */
function triggerDailyBackup() {
  requireOwnerOrTrigger_();
  return backupAll_('정기');
}

/** [편집기 실행] 지금 백업 */
function backupNow() {
  requireOwner_();
  return backupAll_('수동');
}

function backupAll_(trigger) {
  var started = nowStr_(), runId = uid_('BK');
  var base = folder_('BACKUP');
  var stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd');
  var it = base.getFoldersByName(stamp);
  var dayFolder = it.hasNext() ? it.next() : base.createFolder(stamp);
  var copied = [];
  Object.keys(SCHEMA).forEach(function (db) {
    var f = DriveApp.getFileById(prop_('DBID_' + db));
    var c = f.makeCopy(db + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss'), dayFolder);
    copied.push(db + '→' + c.getId());
  });
  var removed = pruneBackups_(base);
  logJob_(runId, 'BACKUP', '완료', started, copied.length, 0, copied.join(', ') + (removed.length ? ' / 정리: ' + removed.join(',') : ''), trigger);
  return { folder: stamp, copied: copied, removed: removed };
}

/** 보관 기준을 넘은 백업 폴더를 휴지통으로 이동 (Drive 휴지통에서 일정 기간 복원 가능) */
function pruneBackups_(base) {
  var names = [], map = {}, it = base.getFolders();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (/^\d{8}$/.test(n)) { names.push(n); map[n] = f; }
  }
  names.sort().reverse();
  var keep = {};
  names.slice(0, APP.BACKUP_KEEP_DAILY).forEach(function (n) { keep[n] = true; });
  var monthLast = {};
  names.forEach(function (n) { var ym = n.substring(0, 6); if (!monthLast[ym]) monthLast[ym] = n; });
  Object.keys(monthLast).sort().reverse().slice(0, APP.BACKUP_KEEP_MONTHLY).forEach(function (ym) { keep[monthLast[ym]] = true; });
  var removed = [];
  names.forEach(function (n) { if (!keep[n]) { map[n].setTrashed(true); removed.push(n); } });
  return removed;
}

/**
 * [편집기 실행] 저장소 1개를 백업본으로 복구
 * @param db 'DB_MASTER' 등
 * @param backupFileId 90_백업 폴더 안 사본의 파일 ID
 * 복구 후 할 일: 백업 시점 이후 원천 파일을 02_가져오기_완료 → 01_가져오기_대기로 옮겨 runPipeline 재실행,
 *               업무 입력분은 L_AUDIT 의 after_json 으로 확인해 재입력 (운영 매뉴얼 참고)
 */
function restoreDb(db, backupFileId) {
  requireOwner_();
  if (!SCHEMA[db]) throw new Error('알 수 없는 저장소: ' + db);
  return withLock_(function () {
    var owner = ownerAsUser_();
    var oldId = prop_('DBID_' + db);
    var src = DriveApp.getFileById(backupFileId);
    var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
    var copy = src.makeCopy(APP.NAME + '_' + db, root);
    var old = DriveApp.getFileById(oldId);
    old.setName(old.getName() + '_교체됨_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss'));
    setProp_('DBID_' + db, copy.getId());
    delete _ssMemo[db];
    _tableMemo = {};
    audit_(owner, 'RESTORE', db, '*', db, { file_id: oldId }, { file_id: copy.getId(), from_backup: backupFileId }, '백업 복구');
    return { db: db, newFileId: copy.getId(), previousFileId: oldId };
  });
}
