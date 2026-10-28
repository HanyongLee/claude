/**
 * TestData.gs — 가상 데이터 적재와 1단계 점검 (편집기에서 소유 계정으로 실행)
 * 가상 데이터는 기초자료가 비어 있는 저장소에만 넣는다(실제 자료 보호).
 */

/** [편집기 실행] 최근 24개월 + 당월(어제까지) 가상 데이터를 기초자료에 넣고, 원천 CSV를 가져오기 대기 폴더에 만든다. */
function loadVirtualData() {
  requireOwner_();
  var end = addDays_(todayStr_(), -1);
  var start = addMonths_(ymOf_(end), -24) + '-01';
  return loadVirtualData_({ startDate: start, endDate: end, seed: 20261027 });
}

function loadVirtualData_(opt) {
  return withLock_(function () {
    if (readTable_('DB_MASTER', 'M_WHOLESALER').length) {
      throw new Error('기초자료가 이미 있습니다. 가상 데이터는 빈 저장소에만 넣을 수 있습니다.');
    }
    var g = genVirtualData_(opt);
    var existingUsers = {};
    readTable_('DB_MASTER', 'M_USER').forEach(function (u) { existingUsers[u.user_id] = true; });
    Object.keys(g.master).forEach(function (t) {
      var db = t === 'P_GUARANTOR' ? 'DB_PII' : 'DB_MASTER';
      var rows = t === 'M_USER' ? g.master[t].filter(function (u) { return !existingUsers[u.user_id]; }) : g.master[t];
      appendObjects_(db, t, rows);
    });
    var inbox = folder_('INBOX');
    g.files.forEach(function (f) { inbox.createFile(f.name, f.content, MimeType.CSV); });
    audit_(ownerAsUser_(), 'LOAD_VIRTUAL_DATA', 'DB_MASTER', '*', 'virtual', null, g.summary, '가상 데이터 적재');
    Logger.log(JSON.stringify(g.summary));
    return g.summary;
  });
}

/** 테스트 전용: 지정한 이메일 사용자로 함수 실행 (같은 실행 안에서만 유효) */
function withUser_(email, fn) {
  var prev = _testUserOverride;
  _testUserOverride = email;
  try { return fn(); } finally { _testUserOverride = prev; }
}

/**
 * [편집기 실행] 1단계 점검 — 운영 자료를 훼손하지 않는 점검만 수행한다.
 * 시나리오 4(재가져오기 중복 없음), 7(권한), 8(과거 시점 근거 보존), 9(대사), 3(데이터 상태 표시)
 */
function runPhase1Checks() {
  requireOwner_();
  var R = [];
  function check(id, name, ok, detail) { R.push({ scenario: id, check: name, result: ok ? '통과' : '실패', detail: detail || '' }); }

  // 9. 대사
  var st = readStatus_();
  var recon = readTable_('DB_AGG', 'A_RECON').filter(function (r) { return r.calc_run_id === st.last_calc_run_id; });
  var bad = recon.filter(function (r) { return r.result !== '일치'; });
  check(9, '원천↔집계 대사 전 항목 일치', recon.length > 0 && bad.length === 0, recon.length + '항목, 불일치 ' + bad.length);

  // 3. 데이터 상태가 불완전하면 정상으로 표시되지 않음
  var issuesLatest = readTable_('DB_AGG', 'A_DQ').filter(function (d) { return d.date === st.latest_base_date && d.status !== '경고'; }).length;
  check(3, '데이터 이상이 있으면 전체 상태가 정상이 아님', !(issuesLatest > 0 && st.data_status === '정상'),
    '최신 기준일 이상 ' + issuesLatest + '건, 상태 ' + st.data_status);

  // 7. 권한: 사용자를 바꿔 같은 서버 함수를 직접 호출
  var users = readTable_('DB_MASTER', 'M_USER');
  var viewer = users.filter(function (u) { return u.role === 'VIEWER' && u.status === '사용'; })[0];
  var auc = users.filter(function (u) { return u.role === 'AUCTIONEER' && u.status === '사용'; })[0];
  if (viewer) {
    withUser_(viewer.user_id, function () {
      check(7, '조회자 → 보증인 개인정보 요청 거부', api_getGuarantors('W0123').ok === false);
      check(7, '조회자 → 정기 처리 실행 거부', api_runPipelineNow().ok === false);
      check(7, '조회자 → 기초자료 변경 거부', api_submitVersion('M_LIMIT', { wholesaler_id: 'W0123', limit_type: '기본한도', amount: 1, valid_from: '2026-01-01', approval_basis: 'x' }, '테스트').ok === false);
      var v = api_get360('W0123');
      check(7, '조회자 360 응답에 연락처·보증인 참조 없음', v.ok && !v.data.contacts && (v.data.guarantees || []).every(function (g) { return g.guarantor_ref === undefined; }));
    });
  }
  if (auc) {
    var asg = readTable_('DB_MASTER', 'M_ASSIGNMENT');
    var other = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) {
      return !canAccessWs_({ user_id: auc.user_id, role: 'AUCTIONEER' }, w.wholesaler_id, asg, todayStr_());
    })[0];
    if (other) withUser_(auc.user_id, function () {
      check(7, '경매사 → 담당 외 중도매인(' + other.wholesaler_id + ') 조회 거부', api_get360(other.wholesaler_id).ok === false);
    });
  }
  withUser_('nobody@example.invalid', function () {
    check(7, '미등록 사용자 거부', api_bootstrap().ok === false);
  });
  withUser_('', function () {
    check(7, '식별 불가(이메일 빈 값) 사용자 거부', api_bootstrap().ok === false);
  });

  // 8. 과거 시점 조회: W0123 기본한도는 2026-03-01 감액 → 2026-02-15 기준과 현재가 달라야 함
  var lim = readTable_('DB_MASTER', 'M_LIMIT');
  var past = asOfVersions_(lim, 'limit_id', 'W0123', '2026-02-15').filter(function (l) { return l.limit_type === '기본한도'; })[0];
  var now = asOfVersions_(lim, 'limit_id', 'W0123', todayStr_()).filter(function (l) { return l.limit_type === '기본한도'; })[0];
  if (past && now) check(8, '한도 변경 후에도 과거 시점 한도 재현', past.version_no !== now.version_no,
    '2026-02-15: v' + past.version_no + ' ' + past.amount + ' / 현재: v' + now.version_no + ' ' + now.amount);

  // 4. 같은 파일 재가져오기: 완료 폴더의 파일 하나를 대기 폴더로 복사 → 처리 → 행 수 불변
  var done = folder_('DONE').getFiles(), sample = null;
  while (done.hasNext()) { var f = done.next(); if (detectSource_(f.getName()) === 'SALES') { sample = f; break; } }
  if (sample) {
    var before = readTable_('DB_RAW', 'R_SALES').length;
    sample.makeCopy(sample.getName(), folder_('INBOX'));
    _tableMemo = {};
    runPipeline_('점검');
    _tableMemo = {};
    var after = readTable_('DB_RAW', 'R_SALES').length;
    var lastBatch = readTable_('DB_RAW', 'R_BATCH').slice(-1)[0];
    check(4, '같은 파일 재가져오기 시 거래 행 수 불변', before === after, before + ' → ' + after);
    check(4, '재가져오기 배치는 중복파일로 기록', lastBatch && lastBatch.status === '중복파일', lastBatch ? lastBatch.status : '');
  }

  Logger.log(R.map(function (r) { return '[' + r.result + '] 시나리오' + r.scenario + ' ' + r.check + (r.detail ? ' — ' + r.detail : ''); }).join('\n'));
  return R;
}
