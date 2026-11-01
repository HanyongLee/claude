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
    loadVirtualDocs_(ownerAsUser_());
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

/**
 * 가상 매뉴얼·서식·상황 코드·절차 (모두 가상. 실제 규정이 아니다)
 * - SIT-OVD-30 (연체 30일 이상)        : 가상 매뉴얼 v1 에 절차 3단계 + 서식 2종 연결
 * - SIT-TURN-DROP (회전율 저하 확인)    : 절차 미등록 → '확인 필요' 표시 검증용(시나리오 6)
 * - SIT-CONFLICT (복수 징후)            : 서로 다른 두 문서에 절차 → '충돌' 표시 검증용
 */
function loadVirtualDocs_(user) {
  var forms = folder_('FORMS');
  var mk = function (name, text) { return forms.createFile(name, text, 'text/plain').getId(); };
  var manualId = mk('(가상)채권관리업무매뉴얼_v1.txt', '(가상) 채권관리 업무매뉴얼 v1 — 테스트용 본문. 실제 규정이 아님.');
  var manual2Id = mk('(가상)여신관리지침_v2.txt', '(가상) 여신관리지침 v2 — 테스트용 본문. 실제 규정이 아님.');
  var form1 = mk('(가상)결제계획확인서.txt', '[가상 서식] 결제계획 확인서\n관리건: {{관리건ID}}\n중도매인: {{중도매인코드}} {{상호}} (대표 {{대표자}})\n기준일: {{기준일}}\n미수금: {{미수금}}원 / 연체금액: {{연체금액}}원 ({{연체일수}}일)\n담당 경매사: {{담당경매사}}\n작성일: {{작성일}}  작성자: {{작성자}}\n결제계획: \n');
  var form2 = mk('(가상)담보보강요청서.txt', '[가상 서식] 담보 보강 요청서\n관리건: {{관리건ID}} / {{상호}}\n기준일 {{기준일}} 미수금 {{미수금}}원\n요청 내용: \n');
  var now = nowStr_(), a = newAuditFields_(user);
  var docs = [
    { doc_id: 'DOC-MANUAL-CREDIT', doc_name: '(가상)채권관리 업무매뉴얼', doc_type: '매뉴얼', owner_dept: '(가상)채권팀' },
    { doc_id: 'DOC-GUIDE-LOAN', doc_name: '(가상)여신관리지침', doc_type: '매뉴얼', owner_dept: '(가상)심사팀' },
    { doc_id: 'FORM-PAYPLAN', doc_name: '(가상)결제계획확인서', doc_type: '서식', owner_dept: '(가상)채권팀' },
    { doc_id: 'FORM-COLLATERAL', doc_name: '(가상)담보보강요청서', doc_type: '서식', owner_dept: '(가상)채권팀' }
  ].map(function (d) { return Object.assign({ note: '가상' }, d, a); });
  appendObjects_('DB_MASTER', 'M_DOC', docs);
  var hash = function (id) { return sha256Hex_(DriveApp.getFileById(id).getBlob().getBytes()); };
  appendObjects_('DB_MASTER', 'M_DOC_VER', [
    { doc_id: 'DOC-MANUAL-CREDIT', version: 'v1', effective_from: '2025-01-01', effective_to: APP.OPEN_END, file_id: manualId, file_hash: hash(manualId), note: '가상' },
    { doc_id: 'DOC-GUIDE-LOAN', version: 'v2', effective_from: '2026-01-01', effective_to: APP.OPEN_END, file_id: manual2Id, file_hash: hash(manual2Id), note: '가상' },
    { doc_id: 'FORM-PAYPLAN', version: 'v3', effective_from: '2025-06-01', effective_to: APP.OPEN_END, file_id: form1, file_hash: hash(form1), note: '가상' },
    { doc_id: 'FORM-COLLATERAL', version: 'v1', effective_from: '2025-01-01', effective_to: APP.OPEN_END, file_id: form2, file_hash: hash(form2), note: '가상' }
  ].map(function (d) { return Object.assign(d, a); }));
  appendObjects_('DB_MASTER', 'M_SITUATION', [
    { situation_code: 'SIT-OVD-30', label: '연체 30일 이상', condition_json: JSON.stringify({ signals: ['S03'], min_overdue_days: 30 }), note: '가상' },
    { situation_code: 'SIT-OVD-NEW', label: '연체 발생(채권 검토 필요)', condition_json: JSON.stringify({ signals: ['S03'], result_class: '채권 검토 필요' }), note: '가상' },
    { situation_code: 'SIT-TURN-DROP', label: '회전율 저하 확인', condition_json: JSON.stringify({ signals: ['S01'] }), note: '가상 — 절차 미등록(확인 필요 검증용)' },
    { situation_code: 'SIT-MULTI', label: '복수 징후', condition_json: JSON.stringify({ signals: ['S07'] }), note: '가상 — 두 문서 충돌 검증용' }
  ].map(function (d) { return Object.assign(d, a); }));
  var steps = [
    { proc_step_id: 'PS-OVD-1', situation_code: 'SIT-OVD-NEW', step_no: 1, content: '(가상) 중도매인에게 결제계획 확인서를 받는다', checks: '결제 예정일·금액·방법', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제12조 제1항', page: '34' },
    { proc_step_id: 'PS-OVD-2', situation_code: 'SIT-OVD-NEW', step_no: 2, content: '(가상) 담보 평가 최신성을 확인하고 필요 시 담보 보강을 요청한다', checks: '최종 평가일 1년 초과 여부', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제15조', page: '41' },
    { proc_step_id: 'PS-OVD-3', situation_code: 'SIT-OVD-NEW', step_no: 3, content: '(가상) 연체 30일 경과 시 팀장 보고 후 거래 조건 변경을 검토한다', checks: '승인권자 결재', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제16조', page: '43' },
    { proc_step_id: 'PS-MULTI-A', situation_code: 'SIT-MULTI', step_no: 1, content: '(가상·문서A) 복수 징후 시 즉시 한도 재심사', checks: '', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제20조', page: '50' },
    { proc_step_id: 'PS-MULTI-B', situation_code: 'SIT-MULTI', step_no: 1, content: '(가상·문서B) 복수 징후 시 30일 관찰 후 재심사', checks: '', doc_id: 'DOC-GUIDE-LOAN', doc_version: 'v2', article: '제7조', page: '12' }
  ].map(function (d) { return Object.assign(d, a); });
  appendObjects_('DB_MASTER', 'M_PROCEDURE', steps);
  appendObjects_('DB_MASTER', 'M_PROC_FORM', [
    { proc_step_id: 'PS-OVD-1', form_doc_id: 'FORM-PAYPLAN', required: true },
    { proc_step_id: 'PS-OVD-2', form_doc_id: 'FORM-COLLATERAL', required: false }
  ].map(function (d) { return Object.assign(d, a); }));
  void now;
}
