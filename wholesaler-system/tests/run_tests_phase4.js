/**
 * run_tests_phase4.js — 4단계 검증: 매뉴얼 질의(근거 인용·확인 필요·충돌), AI 사용 조건(승인 전 차단, 미구성 시 대체),
 * 일일 요약 알림(설정·할당량·개인정보 미포함), 지표 스냅샷 보존 규칙, CSV 반출 기록, 백테스트 데이터 보류
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas_mock');
const GAS = path.join(__dirname, '..', 'gas');
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs', 'Master.gs', 'Metrics.gs', 'Signals.gs',
  'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs', 'NhImport.gs', 'Snapshot.gs', 'Checklist.gs'];
const OWNER = 'owner@example.invalid', START = '2024-10-01', END = '2026-10-27';
const FROZEN = new Date('2026-10-28T09:00:00+09:00').getTime(), REAL0 = Date.now();
let tick = 0;
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(FROZEN + (Date.now() - REAL0)); else super(...a); } static now() { return FROZEN + (Date.now() - REAL0); } }
let pass = 0, fail = 0; const out = [];
const ok = (c, n, d) => { c ? pass++ : fail++; out.push((c ? '  [통과] ' : '  [실패] ') + n + (d ? ' — ' + d : '')); };
const section = (t) => out.push('\n■ ' + t);
function boot() {
  const gas = createGas({ ownerEmail: OWNER });
  const ctx = vm.createContext(Object.assign({ Date: FrozenDate }, gas.globals));
  vm.runInContext(ORDER.map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n;\n'), ctx, { filename: 'gas-bundle.js' });
  ctx.__gas = gas; return ctx;
}
const run = (ctx, src) => { vm.runInContext('_tableMemo = {}; _ssMemo = {};', ctx); return vm.runInContext(src, ctx); };
const as = (ctx, email, src) => { ctx.__gas.state.activeEmail = email; try { return run(ctx, src); } finally { ctx.__gas.state.activeEmail = OWNER; } };
const table = (ctx, db, t) => run(ctx, `readTable_(${JSON.stringify(db)}, ${JSON.stringify(t)})`);
const pipeline = (ctx) => { let r, n = 0; do { r = run(ctx, 'runPipeline_("테스트")'); n++; } while (r.status === '계속' && n < 20); return r; };
const J = JSON.stringify;

const ctx = boot();
run(ctx, 'setupSystem()');
run(ctx, `loadVirtualData_({ startDate: '${START}', endDate: '${END}', seed: 20261027 })`);
pipeline(ctx);
const caseId = table(ctx, 'DB_WORK', 'T_CASE').find(c => c.wholesaler_id === 'W0123').case_id;

section('시나리오 6 확장. 매뉴얼 질의: 근거가 있으면 인용, 없으면 확인 필요');
{
  const a = as(ctx, 'credit1@example.invalid', `api_askManual('연체 발생 시 결제계획 확인 절차', '')`).data;
  const ovd = a.procedures.find(p => p.situation_code === 'SIT-OVD-NEW');
  ok(a.status === '정상' && ovd && ovd.steps.length === 3 && ovd.steps.every(s => s.doc_name && s.version && s.article && s.effective_from), '"연체·결제계획" 질의 → 절차 3단계, 문서·버전·조항·쪽수·시행일 인용', `${ovd && ovd.steps[0].doc_name} ${ovd && ovd.steps[0].version} ${ovd && ovd.steps[0].article} p.${ovd && ovd.steps[0].page}`);
  ok(a.forms.some(f => f.form_doc_id === 'FORM-PAYPLAN') && a.basis.manual_versions.length >= 2 && a.basis.data_base_date === END, '필요 서식·매뉴얼 버전·데이터 기준일 표시');
  ok(a.nextSteps.length === 1 && a.facts.length === 0, '관리 건 없이 질의하면 확인된 상황은 비어 있고 다음 할 일만 제시');
  const b = run(ctx, `api_askManual('경매장 주차 규정 알려줘', '')`).data;
  ok(b.status === '확인 필요' && b.procedures.every(p => p.steps.length === 0) && /임의로 만들지 않습니다/.test(b.message), '근거 없는 질의 → "확인 필요", 절차 0줄', b.message);
  const c = run(ctx, `api_askManual('복수 징후 동시 발생 시 처리', '')`).data;
  ok(c.status === '충돌' && c.procedures.some(p => p.status === '충돌' && p.steps.length === 2), '두 문서가 다른 절차 → "충돌", 둘 다 표시', c.message);
  const d = as(ctx, 'auctioneer1@example.invalid', `api_askManual('회전율 저하 확인', ${J(caseId)})`).data;
  ok(d.facts.length >= 3 && d.procedures.some(p => p.situation_code === 'SIT-TURN-DROP' && p.status === '확인 필요'), '관리 건 지정 시 확인된 상황(신호 근거)과 매칭 상황 포함; 미등록 절차는 확인 필요', d.facts[0]);
  ok(!as(ctx, 'auctioneer2@example.invalid', `api_askManual('연체', ${J(caseId)})`).ok, '담당 외 경매사는 그 관리 건으로 질의 불가');
  ok(table(ctx, 'DB_LOG', 'L_ACCESS').filter(x => x.action === 'manual.query').length >= 4, '질의가 접근 기록에 남음(질문 요약·결과 상태)');
}

section('AI 선택 기능: 승인 전 차단, 미구성 시 검색 답변으로 대체');
{
  const a = run(ctx, `api_askManual('연체 절차', '')`).data;
  ok(a.ai.used === false && /AI_ENABLED/.test(a.ai.reason), '기본: AI 미사용 사유 표시', a.ai.reason);
  const r1 = run(ctx, `api_updateSetting('AI_ENABLED', '예', false, '', '테스트')`);
  ok(!r1.ok && /승인/.test(r1.error), '조직 승인 미확인 상태에서 AI 켜기 거부', r1.error);
  run(ctx, `api_updateSetting('AI_ORG_APPROVED', '예', false, '(가상) 승인 문서', '테스트')`);
  ok(run(ctx, `api_updateSetting('AI_ENABLED', '예', false, '', '테스트')`).ok, '승인 확인 후 AI 켜기 허용');
  const b = run(ctx, `api_askManual('연체 절차', '')`).data;
  ok(b.ai.used === false && b.ai.status === '미구성' && b.status === '정상' && b.procedures.length > 0, 'AI 서비스 미구성 → 검색 답변은 그대로, AI 부분만 "미구성"', b.ai.reason);
  const c = run(ctx, `api_askManual('경매장 주차', '')`).data;
  ok(c.ai.used === false && /근거 없는 답변 방지/.test(c.ai.reason), '인용할 문서가 없으면 AI에 질의하지 않음');
  run(ctx, `api_updateSetting('AI_ORG_APPROVED', '아니오', false, '', '테스트')`);
  ok(table(ctx, 'DB_MASTER', 'M_SETTING').find(s => s.key === 'AI_ENABLED').value === '아니오', '승인 철회 시 AI 자동 해제(이력 기록)');
  ok(!as(ctx, 'credit1@example.invalid', `api_updateSetting('AI_ENABLED', '예', false, '', 'x')`).ok, '채권담당 → AI 설정 변경 거부');
}

section('일일 요약 알림 (선택)');
{
  const r0 = run(ctx, 'api_sendDailySummaryNow()').data;
  ok(r0.sent === 0 && /설정/.test(r0.skipped) && ctx.__gas.mails.length === 0, '기본(NOTIFY_EMAIL=아니오): 발송 안 함');
  run(ctx, `api_updateSetting('NOTIFY_EMAIL', '예', false, '', '테스트')`);
  ctx.__gas.state.mailQuota = 1;
  const r1 = run(ctx, 'api_sendDailySummaryNow()').data;
  ok(r1.sent === 0 && /할당량/.test(r1.skipped), '메일 할당량 부족 → 발송하지 않고 기록', r1.skipped);
  ctx.__gas.state.mailQuota = 100;
  const r2 = run(ctx, 'api_sendDailySummaryNow()').data;
  const m = ctx.__gas.mails;
  ok(r2.sent > 0 && m.length === r2.sent, '할 일이 있는 사용자에게만 발송', `${r2.sent}/${r2.targets}명`);
  const a1 = m.find(x => x.to === 'auctioneer1@example.invalid');
  ok(a1 && a1.body.indexOf(caseId) >= 0 && a1.body.indexOf('한빛청과') < 0 && !/\d{1,3}(,\d{3}){2,}/.test(a1.body) && a1.body.indexOf('@') < 0, '본문: 관리건ID·건수만, 상호·금액·이메일 없음', a1 && a1.subject);
  ok(!m.some(x => x.to === 'viewer1@example.invalid'), '조회자에게는 보내지 않음');
  ok(table(ctx, 'DB_LOG', 'L_JOB').some(j => j.stage === 'NOTIFY' && j.status === '완료'), '발송 결과 작업 로그 기록');
  run(ctx, `api_updateSetting('NOTIFY_EMAIL', '아니오', false, '', '테스트')`);
}

section('지표 스냅샷 보존 규칙');
{
  // 오래된 기준일 스냅샷 2개(월말·비월말)를 심고 정기 처리 → 월말만 남는지
  run(ctx, `appendObjects_('DB_AGG', 'A_METRIC', [
    { metric_key: 'X1', wholesaler_id: 'W0101', base_date: '2026-06-30', metric: '잔액', category: '전체', value: 1, numerator: 1, denominator: 1, period_from: '2026-06-30', period_to: '2026-06-30', status: '정상', reason: '', method: '', calc_run_id: 'OLD' },
    { metric_key: 'X2', wholesaler_id: 'W0101', base_date: '2026-06-15', metric: '잔액', category: '전체', value: 1, numerator: 1, denominator: 1, period_from: '2026-06-15', period_to: '2026-06-15', status: '정상', reason: '', method: '', calc_run_id: 'OLD' },
    { metric_key: 'X3', wholesaler_id: 'W0101', base_date: '2026-10-01', metric: '잔액', category: '전체', value: 1, numerator: 1, denominator: 1, period_from: '2026-10-01', period_to: '2026-10-01', status: '정상', reason: '', method: '', calc_run_id: 'OLD' } ])`);
  pipeline(ctx);
  const keys = table(ctx, 'DB_AGG', 'A_METRIC').filter(m => m.calc_run_id === 'OLD').map(m => m.metric_key).sort().join(',');
  ok(keys === 'X1,X3', '45일(가정) 이전은 월말 경매일 스냅샷만 보존, 최근은 모두 보존', keys);
}

section('CSV 반출 기록');
{
  const r = as(ctx, 'credit1@example.invalid', `api_exportCompare('과일')`).data;
  ok(r.file_name.indexOf('과일') >= 0 && r.text.split('\n').length > 10 && r.text.indexOf('W0123') >= 0, '서버에서 CSV 생성', r.file_name);
  ok(table(ctx, 'DB_LOG', 'L_ACCESS').some(x => x.action === 'export.csv' && x.user_id === 'credit1@example.invalid'), '반출이 접근 기록에 남음');
  const a = as(ctx, 'auctioneer2@example.invalid', `api_exportCompare('전체')`).data;
  ok(a.text.indexOf('W0123') < 0, '경매사 반출은 담당분만');
}

section('백테스트: 데이터 품질 보류 반영');
{
  // W0101 의 2026-09-15 잔액을 원장 흐름과 다르게 수정 → 불일치 → 그 뒤 30일 판정 건너뜀
  const fid = ctx.__gas.props.FOLDER_INBOX;
  vm.runInContext(`DriveApp.getFolderById(${J(fid)}).createFile('AR_BAL_FIX.csv', 'base_date,wholesaler_id,balance,overdue_amount,max_overdue_days\\n2026-09-15,W0101,1,0,0\\n#CONTROL,1,1\\n', 'text/csv')`, ctx);
  pipeline(ctx);
  ok(table(ctx, 'DB_AGG', 'A_DQ').some(d => d.wholesaler_id === 'W0101' && d.reason_code === 'ROLLFWD_MISMATCH'), '불일치 데이터 이상 생성');
  run(ctx, `startBacktest_(ownerAsUser_(), { dateFrom: '2026-09-01' })`);
  let r, n = 0; do { r = run(ctx, 'continueBacktest_(270000, "테스트")'); n++; } while (r.status === '진행' && n < 50);
  const sm = run(ctx, 'api_backtestStatus()').data.runs[0].summary;
  const hits = table(ctx, 'DB_AGG', 'A_BACKTEST_HIT').filter(h => h.run_id === r.run_id && h.wholesaler_id === 'W0101' && h.base_date >= '2026-09-15' && h.base_date <= '2026-10-15');
  ok(sm.held > 0 && hits.length === 0, '보류 중도매인·기간은 판정하지 않고 보류 건수로 집계', `보류 ${sm.held}건`);
}

section('접속코드 로그인 방식 (AUTH_MODE=code, 개인 Gmail·링크 배포용)');
{
  const anon = (src) => as(ctx, '', src);   // 이메일 식별 불가 상태(카톡 링크로 들어온 임직원)
  ok(!anon(`api_login('auctioneer1@example.invalid', 'ABC')`).ok, '기본(google 모드)에서는 접속코드 로그인 거부');
  ok(anon('api_authInfo()').data.mode === 'google' && !anon('api_authInfo()').data.googleIdentified, 'authInfo: 모드·식별 여부 제공(사용자 확인 전 호출 가능)');
  run(ctx, `api_updateSetting('AUTH_MODE', 'code', false, '', '테스트')`);
  ok(!anon(`api_login('auctioneer1@example.invalid', 'ABC')`).ok, '코드 미발급 사용자 로그인 거부');
  ok(!as(ctx, 'credit1@example.invalid', `api_issueAccessCode('auctioneer1@example.invalid', 'x')`).ok, '채권담당 → 코드 발급 거부');
  const iss = run(ctx, `api_issueAccessCode('auctioneer1@example.invalid', '테스트 발급')`).data;
  ok(iss.code && iss.code.length === 10 && !/[IO01]/.test(iss.code), '관리자 코드 발급(10자, 혼동 문자 제외)', iss.code.replace(/./g, '*'));
  const u = table(ctx, 'DB_MASTER', 'M_USER').find(x => x.user_id === 'auctioneer1@example.invalid');
  ok(u.code_hash && u.code_hash !== iss.code && !JSON.stringify(table(ctx, 'DB_LOG', 'L_AUDIT')).includes(iss.code), '코드는 해시만 저장, 이력에도 코드 없음');
  ok(!anon(`api_login('auctioneer1@example.invalid', 'WRONGCODE1')`).ok, '틀린 코드 거부');
  const lg = anon(`api_login('auctioneer1@example.invalid', ${J(iss.code.toLowerCase())})`);
  ok(lg.ok && lg.data.token && lg.data.user.role === 'AUCTIONEER', '올바른 코드(대소문자 무관) → 세션 토큰', lg.data && lg.data.expires);
  const tok = lg.data.token;
  const direct = anon('api_home()');
  ok(!direct.ok, '토큰 없이 직접 호출: 거부(식별 불가)');
  const viaTok = anon(`api_call(${J(tok)}, 'api_home', [])`);
  const asg1 = table(ctx, 'DB_MASTER', 'M_ASSIGNMENT').filter(a => a.user_id === 'auctioneer1@example.invalid').length;
  ok(viaTok.ok && viaTok.data.counts.myWholesalers === asg1, '토큰으로 api_call 경유 호출: 경매사1 담당 범위로 동작', `${viaTok.data && viaTok.data.counts.myWholesalers}명`);
  ok(!anon(`api_call(${J(tok)}, 'api_get360', ['W0207'])`).ok, '토큰 사용자도 담당 외 중도매인은 거부(권한 규칙 동일)');
  ok(!anon(`api_call(${J(tok)}, 'runPipeline', [])`).ok && !anon(`api_call(${J(tok)}, 'api_call', [])`).ok && !anon(`api_call(${J(tok)}, 'readTable_', ['DB_PII','P_GUARANTOR'])`).ok, 'api_* 외 함수 이름은 호출 불가');
  ok(!anon(`api_call('bogus-token', 'api_home', [])`).ok && /SESSION_EXPIRED/.test(anon(`api_call('bogus-token', 'api_home', [])`).error), '잘못된 토큰 → 세션 만료 응답');
  for (let i = 0; i < 5; i++) anon(`api_login('auctioneer1@example.invalid', 'WRONGCODE1')`);
  const locked = anon(`api_login('auctioneer1@example.invalid', ${J(iss.code)})`);
  ok(!locked.ok && /잠겨/.test(locked.error), '연속 5회 실패 → 15분 잠금(올바른 코드도 거부)', locked.error);
  ok(anon(`api_call(${J(tok)}, 'api_logout', [])`).ok && !anon(`api_call(${J(tok)}, 'api_home', [])`).ok, '로그아웃 후 토큰 무효');
  run(ctx, `api_saveUser({ user_id: 'auctioneer2@example.invalid', name: '(가상)경매사2', role: 'AUCTIONEER', status: '중지' }, '테스트')`);
  const iss2 = run(ctx, `api_issueAccessCode('auctioneer2@example.invalid', '테스트')`).data;
  ok(!anon(`api_login('auctioneer2@example.invalid', ${J(iss2.code)})`).ok, '중지된 사용자는 코드가 있어도 로그인 불가');
  const lu = run(ctx, 'api_listUsers()').data[0];
  ok(!('code_hash' in lu) && !('token_hash' in lu) && 'has_code' in lu, '사용자 목록 응답에 해시 미포함');
  run(ctx, `api_updateSetting('AUTH_MODE', 'google', false, '', '테스트')`);
}

console.log('중도매인 통합관리 4단계 로컬 검증 (모의 Apps Script, 가상 데이터, 기준일 2026-10-28)');
console.log(out.join('\n'));
console.log(`\n합계: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
