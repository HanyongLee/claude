/**
 * Audit.gs — 변경 이력·접근 기록·작업 로그 (추가만 가능)
 * 이력 기록 실패가 업무 처리를 숨기지 않도록, 기록 실패는 예외로 올린다.
 */

function audit_(user, action, db, table, key, before, after, reason) {
  appendObjects_('DB_LOG', 'L_AUDIT', [{
    audit_id: uid_('AU'), at: nowStr_(), user_id: user ? user.user_id : 'system', action: action,
    db: db, table_name: table, record_key: key,
    before_json: before ? JSON.stringify(stripInternal_(before)) : '',
    after_json: after ? JSON.stringify(stripInternal_(after)) : '',
    reason: reason || '', request_id: _requestId
  }]);
}

function logAccess_(userId, action, target, result, detail) {
  appendObjects_('DB_LOG', 'L_ACCESS', [{
    access_id: uid_('AC'), at: nowStr_(), user_id: userId || '(식별불가)', action: action,
    target: target || '', result: result, detail: detail || ''
  }]);
}

function logJob_(runId, stage, status, startedAt, processed, errors, message, trigger) {
  appendObjects_('DB_LOG', 'L_JOB', [{
    job_id: uid_('JB'), run_id: runId, stage: stage, status: status, started_at: startedAt,
    finished_at: nowStr_(), processed: processed || 0, errors: errors || 0, message: message || '',
    trigger: trigger || ''
  }]);
}

var _requestId = '';
