/**
 * Auth.gs — 사용자 식별과 서버 측 권한 확인
 *
 * 원칙
 * - 화면에서 메뉴를 숨기는 것은 편의 기능일 뿐이다. 모든 웹앱 요청은 apiCall_ 을 거쳐
 *   서버에서 사용자·역할·담당 범위를 다시 확인한다. 클라이언트가 보낸 역할·사용자 값은 쓰지 않는다.
 * - 사용자를 식별하지 못하면(이메일 빈 값) 거부한다(fail closed).
 *   공식 문서: 'execute as me' 웹앱은 같은 Google Workspace 도메인이 아니면 접속자 이메일을 얻지 못할 수 있다.
 * - 이름이 '_'로 끝나는 함수는 google.script.run 으로 호출할 수 없다(비공개 함수).
 *   그래서 공개 함수는 api_* (웹앱용)와 편집기 실행용 함수만 두고, 편집기용은 소유자 확인을 먼저 한다.
 */

var _testUserOverride = null;   // 테스트 함수에서만 설정. 실행(요청)마다 초기화되므로 다른 요청으로 새지 않는다.

function currentEmail_() {
  if (_testUserOverride !== null) return String(_testUserOverride).toLowerCase();
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function ownerEmail_() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}

function resolveUser_() {
  var email = currentEmail_();
  if (!email) return null;
  var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) {
    return String(r.user_id).toLowerCase() === email && r.status === '사용' && !r.is_deleted;
  })[0];
  return u ? { user_id: u.user_id, name: u.name, role: u.role, roleLabel: ROLES[u.role] || u.role } : null;
}

/** 편집기에서 시스템 소유 계정이 직접 실행하는 경우만 허용 */
function requireOwner_() {
  var email = currentEmail_(), owner = ownerEmail_();
  if (!email || email !== owner) {
    throw new Error('이 기능은 Apps Script 편집기에서 시스템 소유 계정으로만 실행할 수 있습니다.');
  }
}

/** 시간 기반 트리거(이메일 빈 값일 수 있음) 또는 소유자만 허용 */
function requireOwnerOrTrigger_() {
  var email = currentEmail_();
  if (email && email !== ownerEmail_()) throw new Error('정기 처리는 소유 계정 또는 트리거만 실행할 수 있습니다.');
}

function ownerAsUser_() {
  return { user_id: ownerEmail_() || 'system', name: '시스템', role: 'ADMIN', roleLabel: ROLES.ADMIN };
}

function deny_(msg) {
  var e = new Error(msg);
  e.denied = true;
  throw e;
}

/** 담당 범위 확인 (경매사 = 담당 중도매인만) */
function requireWsAccess_(user, wsId) {
  var ok = canAccessWs_(user, wsId, readTable_('DB_MASTER', 'M_ASSIGNMENT'), todayStr_());
  if (!ok) deny_('담당 범위 밖의 중도매인입니다: ' + wsId);
}

/**
 * 웹앱 요청 공통 처리: 사용자 확인 → 권한 확인 → 실행 → 결과/오류 반환
 * @param action PERMS 의 키 (null 이면 등록 사용자 확인만)
 */
function apiCall_(action, fn) {
  _requestId = uid_('RQ');
  var email = '';
  try {
    email = currentEmail_();
    var user = resolveUser_();
    if (!user) {
      logAccess_(email, action, '', '거부', '미등록·비활성 또는 식별 불가 사용자');
      return { ok: false, error: '등록된 사용자가 아니거나 사용자를 식별할 수 없습니다. 관리자에게 문의하세요.' };
    }
    if (action && !can_(user.role, action)) {
      logAccess_(user.user_id, action, '', '거부', '역할 권한 없음(' + user.role + ')');
      return { ok: false, error: '권한이 없습니다.' };
    }
    return { ok: true, data: fn(user) };
  } catch (e) {
    if (e && e.denied) {
      try { logAccess_(email, action, '', '거부', e.message); } catch (ignore) { /* 기록 실패는 응답을 막지 않음 */ }
      return { ok: false, error: e.message };
    }
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
