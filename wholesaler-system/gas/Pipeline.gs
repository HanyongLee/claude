/**
 * Pipeline.gs — 정기 처리: 가져오기 → 검증 → 적재 → 집계 → 대사·데이터 품질 → 상태 갱신
 *
 * - 단계 상태를 Script Properties 에 저장한다. 실행 시간이 부족하면 상태를 남기고
 *   1분 뒤 이어서 실행 트리거를 건다. 실패하면 상태가 남아 있어 다음 실행이 실패 단계부터 다시 시작한다.
 * - 각 단계는 다시 실행해도 결과가 같다(멱등): 파일 해시·행 키로 중복 적재를 막고, 집계는 원천에서 전체 재생성한다.
 */

var PIPE_STATE_KEY = 'PIPELINE_STATE';

/** [편집기 실행] 정기 처리를 지금 실행 */
function runPipeline() {
  requireOwner_();
  return runPipeline_('수동');
}

/** [트리거] 매일 정기 처리 */
function triggerDailyPipeline() {
  requireOwnerOrTrigger_();
  return runPipeline_('정기');
}

/** [트리거] 시간 부족으로 나눠진 처리 이어서 실행 */
function triggerContinuePipeline() {
  requireOwnerOrTrigger_();
  return runPipeline_('이어서');
}

function runPipeline_(trigger) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: '건너뜀', message: '다른 처리가 진행 중입니다.' };
  var t0 = Date.now();
  var state = JSON.parse(prop_(PIPE_STATE_KEY) || 'null') ||
    { runId: uid_('RUN'), stage: 'IMPORT', startedAt: nowStr_(), processed: 0 };
  var timeLeft = function () { return APP.JOB_TIME_BUDGET_MS - (Date.now() - t0); };
  var stageStart = nowStr_();
  try {
    if (state.stage === 'IMPORT') {
      var r = importInbox_(state.runId, trigger, timeLeft);
      state.processed += r.processed;
      if (!r.done) return pause_(state, '가져오기 ' + state.processed + '개 처리, 남은 파일 이어서 처리');
      state.stage = 'AGGREGATE';
      setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    }
    if (state.stage === 'AGGREGATE') {
      if (timeLeft() < 90000) return pause_(state, '집계 단계를 다음 실행에서 진행');
      stageStart = nowStr_();
      aggregateAll_(state.runId, trigger);
    }
    PropertiesService.getScriptProperties().deleteProperty(PIPE_STATE_KEY);
    clearContinueTriggers_();
    return { status: '완료', runId: state.runId, files: state.processed };
  } catch (e) {
    setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    try {
      logJob_(state.runId, state.stage, '실패', stageStart, 0, 1, String(e && e.message ? e.message : e), trigger);
      mergeStatus_({ last_failure_at: nowStr_(), last_failure: state.stage + ': ' + (e && e.message ? e.message : e) });
    } catch (ignore) { /* 기록 실패가 원래 오류를 가리지 않도록 */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function pause_(state, msg) {
  setProp_(PIPE_STATE_KEY, JSON.stringify(state));
  clearContinueTriggers_();
  ScriptApp.newTrigger('triggerContinuePipeline').timeBased().after(APP.CONTINUE_AFTER_MS).create();
  return { status: '계속', runId: state.runId, message: msg };
}

function clearContinueTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'triggerContinuePipeline') ScriptApp.deleteTrigger(t);
  });
}

/* ───────────── 가져오기 ───────────── */

function importInbox_(runId, trigger, timeLeft) {
  var inbox = folder_('INBOX'), files = [], it = inbox.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var wsIds = {};
  readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { if (!w.is_deleted) wsIds[w.wholesaler_id] = true; });
  var keyCache = {}, processed = 0;
  for (var i = 0; i < files.length; i++) {
    if (timeLeft() < 45000) return { done: false, processed: processed };
    importFile_(files[i], runId, trigger, wsIds, keyCache);
    processed++;
  }
  return { done: true, processed: processed };
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function importFile_(file, runId, trigger, wsIds, keyCache) {
  var started = nowStr_(), name = file.getName(), source = detectSource_(name);
  var blob = file.getBlob();
  var batch = {
    batch_id: uid_('B'), run_id: runId, source: source || '', file_name: name, file_id: file.getId(),
    file_hash: sha256Hex_(blob.getBytes()), date_from: '', date_to: '', row_count: 0, accepted_count: 0,
    duplicate_count: 0, revised_count: 0, rejected_count: 0, control_rows: '', control_amount: '',
    accepted_amount: 0, control_result: '', status: '', message: '', started_at: started, finished_at: ''
  };
  var dest = 'DONE';

  if (!source) {
    batch.status = '형식오류';
    batch.message = '파일명 접두어로 원천을 알 수 없음(SALES_ / RECEIPT_ / AR_BAL_)';
    dest = 'ERROR';
  } else {
    var prior = readTable_('DB_RAW', 'R_BATCH').filter(function (b) {
      return b.file_hash === batch.file_hash && (b.status === '완료' || b.status === '부분적재');
    })[0];
    if (prior) {
      batch.status = '중복파일';
      batch.message = '같은 내용의 파일이 이미 적재됨(' + prior.batch_id + ') — 건너뜀';
    } else {
      var spec = SOURCE_SPEC[source];
      if (!keyCache[source]) {
        var m = {};
        readTable_('DB_RAW', spec.table).forEach(function (r) { m[r.row_key] = r.content_hash; });
        keyCache[source] = m;
      }
      var res = validateImport_(blob.getDataAsString('UTF-8'), source, { wholesalerIds: wsIds, existing: keyCache[source] });
      if (res.fatal) {
        batch.status = '형식오류';
        batch.message = res.fatal;
        dest = 'ERROR';
      } else {
        var loadedAt = nowStr_();
        appendObjects_('DB_RAW', spec.table, res.accepted.map(function (r) {
          r.batch_id = batch.batch_id; r.loaded_at = loadedAt; return r;
        }));
        appendObjects_('DB_RAW', 'R_REJECT', res.rejects.map(function (x) {
          return { reject_id: uid_('RJ'), batch_id: batch.batch_id, source: source, line_no: x.line,
            error_code: x.code, error_message: x.msg, raw_line: x.raw, created_at: loadedAt };
        }));
        batch.date_from = res.dateFrom; batch.date_to = res.dateTo;
        batch.row_count = res.rowCount; batch.accepted_count = res.accepted.length;
        batch.duplicate_count = res.duplicates; batch.revised_count = res.revisions;
        batch.rejected_count = res.rejects.length; batch.accepted_amount = res.acceptedAmount;
        batch.control_rows = res.control ? res.control.rows : '';
        batch.control_amount = res.control ? res.control.amount : '';
        batch.control_result = res.controlResult;
        if (res.accepted.length === 0 && res.rejects.length > 0) { batch.status = '실패'; dest = 'ERROR'; }
        else if (res.rejects.length || res.controlResult !== '일치') batch.status = '부분적재';
        else batch.status = '완료';
        batch.message = '읽음 ' + res.rowCount + ' / 적재 ' + res.accepted.length + ' / 중복 ' + res.duplicates +
          ' / 수정본 ' + res.revisions + ' / 거부 ' + res.rejects.length + ' / 관리합계 ' + res.controlResult;
      }
    }
  }
  batch.finished_at = nowStr_();
  appendObjects_('DB_RAW', 'R_BATCH', [batch]);
  file.moveTo(folder_(dest));
  logJob_(runId, 'IMPORT:' + name, batch.status, started, batch.accepted_count, batch.rejected_count, batch.message, trigger);
  return batch;
}

/* ───────────── 집계·대사·상태 ───────────── */

function aggregateAll_(runId, trigger) {
  var started = nowStr_();
  var sales = readTable_('DB_RAW', 'R_SALES');
  var receipts = readTable_('DB_RAW', 'R_RECEIPT');
  var arRows = readTable_('DB_RAW', 'R_AR_BAL');
  var calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');

  var agg = buildAggregates_({ sales: sales, receipts: receipts, arRows: arRows, calendar: calendar,
    wholesalers: wholesalers, statusHist: statusHist, calcRunId: runId });
  rewriteTable_('DB_AGG', 'A_DAILY', agg.daily);
  rewriteTable_('DB_AGG', 'A_MONTHLY', agg.monthly);
  rewriteTable_('DB_AGG', 'A_DQ', agg.issues);

  var created = nowStr_();
  var recon = reconcile_({ sales: sales, receipts: receipts, arRows: arRows }, agg).map(function (r) {
    r.recon_id = uid_('RC'); r.calc_run_id = runId; r.created_at = created; return r;
  });
  appendObjects_('DB_AGG', 'A_RECON', recon);

  var runBatches = readTable_('DB_RAW', 'R_BATCH').filter(function (b) { return b.run_id === runId; });
  var problems = runBatches.filter(function (b) { return ['형식오류', '실패', '부분적재'].indexOf(b.status) >= 0; });
  var st = overallDataStatus_({
    latestBase: agg.latestBase,
    expectedBase: expectedBaseDate_(calendar, todayStr_()),
    issuesOnLatest: agg.issues.filter(function (i) { return i.date === agg.latestBase && i.status !== '경고'; }).length,
    reconFail: recon.filter(function (r) { return r.result !== '일치'; }).length,
    lastBatchProblem: problems.length ? problems.length + '개 파일(' + problems.map(function (b) { return b.file_name + ':' + b.status; }).join(', ') + ')' : ''
  });
  mergeStatus_({
    latest_base_date: agg.latestBase, data_start: agg.dataStart,
    expected_base_date: expectedBaseDate_(calendar, todayStr_()),
    data_status: st.status, status_reasons: st.reasons.join(' / '),
    last_calc_run_id: runId, last_updated_at: nowStr_(),
    issue_count: String(agg.issues.length)
  });
  logJob_(runId, 'AGGREGATE', '완료', started, agg.daily.length, recon.filter(function (r) { return r.result !== '일치'; }).length,
    '일집계 ' + agg.daily.length + ' / 월집계 ' + agg.monthly.length + ' / 데이터이상 ' + agg.issues.length + ' / 상태 ' + st.status, trigger);
  return { status: st, recon: recon, issues: agg.issues.length };
}

function readStatus_() {
  var m = {};
  readTable_('DB_AGG', 'A_STATUS').forEach(function (r) { m[r.key] = r.value; });
  return m;
}

function mergeStatus_(obj) {
  var m = readStatus_(), now = nowStr_();
  Object.keys(obj).forEach(function (k) { m[k] = obj[k] === undefined || obj[k] === null ? '' : String(obj[k]); });
  rewriteTable_('DB_AGG', 'A_STATUS', Object.keys(m).sort().map(function (k) { return { key: k, value: m[k], updated_at: now }; }));
}
