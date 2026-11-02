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

var _tokenUser = null;   // 접속코드 방식에서 세션 토큰으로 확인된 사용자(요청마다 초기화)

function userView_(u) { return { user_id: u.user_id, name: u.name, role: u.role, roleLabel: ROLES[u.role] || u.role }; }

/**
 * 사용자 확인 순서
 *  1) Google 계정 이메일이 식별되고 등록 사용자이면 그 사용자 (같은 Workspace 도메인·소유 계정)
 *  2) AUTH_MODE=code 이고 유효한 세션 토큰이 있으면 그 사용자 (개인 Gmail·카톡 링크 배포용)
 *  3) 그 밖에는 null → 모든 요청 거부
 */
function resolveUser_() {
  var email = currentEmail_();
  var users = readTable_('DB_MASTER', 'M_USER');
  if (email) {
    var u = users.filter(function (r) { return String(r.user_id).toLowerCase() === email && r.status === '사용' && !r.is_deleted; })[0];
    if (u) return userView_(u);
  }
  if (_tokenUser) {
    var t = users.filter(function (r) { return r.user_id === _tokenUser && r.status === '사용' && !r.is_deleted; })[0];
    if (t) return userView_(t);
  }
  return null;
}

/* ───────────── 접속코드 방식 ───────────── */

function hashHex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v;
  }).join('');
}
function randomCode_(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';   // 혼동 문자(I,O,0,1) 제외
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  for (var i = 0; i < n; i++) out += chars[((bytes[i] < 0 ? bytes[i] + 256 : bytes[i]) % chars.length)];
  return out;
}

/** 관리자가 사용자에게 접속코드를 발급한다. 코드는 이때 한 번만 보이고 해시만 저장된다. */
function issueAccessCode_(admin, userId, reason) {
  requireText_(reason, '발급 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === String(userId).toLowerCase() && !r.is_deleted; })[0];
    if (!u) throw new Error('사용자를 찾을 수 없습니다: ' + userId);
    var code = randomCode_(10), salt = Utilities.getUuid();
    var before = JSON.parse(JSON.stringify(u));
    u.code_hash = hashHex_(salt + ':' + code); u.code_salt = salt; u.code_issued_at = nowStr_();
    u.token_hash = ''; u.token_expires = ''; u.fail_count = 0; u.lock_until = '';
    u.updated_at = nowStr_(); u.updated_by = admin.user_id; u.row_version = Number(u.row_version) + 1;
    writeObject_('DB_MASTER', 'M_USER', u);
    delete before.code_hash; delete before.code_salt; delete before.token_hash;
    audit_(admin, 'ISSUE_CODE', 'DB_MASTER', 'M_USER', u.user_id, before, { code_issued_at: u.code_issued_at }, reason);   // 이력에 코드·해시 미기록
    return { user_id: u.user_id, name: u.name, code: code, note: '이 코드는 지금만 표시됩니다. 카톡 단체방이 아닌 개인 채널로 전달하세요.' };
  });
}

/** 접속코드 로그인 → 세션 토큰. 연속 실패 시 15분 잠금. 토큰은 해시만 저장. */
function loginWithCode_(email, code) {
  email = String(email || '').trim().toLowerCase(); code = String(code || '').trim().toUpperCase();
  var settings = readSettings_();
  if (settings.AUTH_MODE !== 'code') throw new Error('접속코드 로그인이 꺼져 있습니다(AUTH_MODE=google). 조직 Google 계정으로 접속하세요.');
  if (!email || !code) throw new Error('이메일과 접속코드를 입력하세요.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === email && r.status === '사용' && !r.is_deleted; })[0];
    var fail = function (why) { logAccess_(email, 'login', '', '거부', why); throw new Error('이메일 또는 접속코드가 올바르지 않습니다.'); };
    if (!u || !u.code_hash) fail('미등록 또는 코드 미발급');
    if (u.lock_until && u.lock_until > nowStr_()) { logAccess_(email, 'login', '', '거부', '잠금 중 ' + u.lock_until); throw new Error('연속 실패로 잠겨 있습니다. ' + u.lock_until + ' 이후 다시 시도하세요.'); }
    if (hashHex_(u.code_salt + ':' + code) !== u.code_hash) {
      u.fail_count = Number(u.fail_count || 0) + 1;
      if (u.fail_count >= settingNum_(settings, 'LOGIN_MAX_FAIL', 5)) { u.lock_until = Utilities.formatDate(new Date(Date.now() + 15 * 60000), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); u.fail_count = 0; }
      writeObject_('DB_MASTER', 'M_USER', u);
      fail('코드 불일치' + (u.lock_until ? ' → 잠금' : ''));
    }
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    u.token_hash = hashHex_(token); u.fail_count = 0; u.lock_until = ''; u.last_login = nowStr_();
    u.token_expires = Utilities.formatDate(new Date(Date.now() + settingNum_(settings, 'SESSION_HOURS', 12) * 3600000), APP.TZ, 'yyyy-MM-dd HH:mm:ss');
    writeObject_('DB_MASTER', 'M_USER', u);
    logAccess_(email, 'login', '', '허용', '세션 ' + u.token_expires + ' 까지');
    return { token: token, expires: u.token_expires, user: userView_(u) };
  });
}

/** 토큰 확인: 해시 일치 + 만료 전. 요청 전역 _tokenUser 에 사용자 설정 */
function authenticateToken_(token) {
  _tokenUser = null;
  if (!token || readSettings_().AUTH_MODE !== 'code') return null;
  var hsh = hashHex_(String(token));
  var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.token_hash === hsh && r.status === '사용' && !r.is_deleted; })[0];
  if (!u || !u.token_expires || u.token_expires <= nowStr_()) return null;
  _tokenUser = u.user_id;
  return u.user_id;
}

function logoutToken_(user) {
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === user.user_id; })[0];
    if (u) { u.token_hash = ''; u.token_expires = ''; writeObject_('DB_MASTER', 'M_USER', u); }
    logAccess_(user.user_id, 'logout', '', '허용', '');
    return true;
  });
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
    email = currentEmail_() || _tokenUser || '';
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
    _tokenUser = null;
    if (e && e.denied) {
      try { logAccess_(email, action, '', '거부', e.message); } catch (ignore) { /* 기록 실패는 응답을 막지 않음 */ }
      return { ok: false, error: e.message };
    }
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    _tokenUser = null;
  }
}
