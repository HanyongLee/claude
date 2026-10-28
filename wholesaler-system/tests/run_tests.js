/**
 * run_tests.js — 1단계 로컬 검증 (node tests/run_tests.js)
 * gas/*.gs 를 그대로 읽어 모의 Apps Script 환경에서 실행한다. 모든 자료는 가상이다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createGas } = require('./gas_mock');

const GAS_DIR = path.join(__dirname, '..', 'gas');
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs',
  'Master.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs'];
const OWNER = 'owner@example.invalid';
const START = '2024-10-01', END = '2026-10-27';

let pass = 0, fail = 0;
const results = [];
function ok(cond, name, detail) {
  if (cond) pass++; else fail++;
  results.push((cond ? '  [통과] ' : '  [실패] ') + name + (detail ? ' — ' + detail : ''));
}
function section(t) { results.push('\n■ ' + t); }

function boot() {
  const gas = createGas({ ownerEmail: OWNER });
  const ctx = vm.createContext(Object.assign({}, gas.globals));
  const code = ORDER.map(f => fs.readFileSync(path.join(GAS_DIR, f), 'utf8')).join('\n;\n');
  vm.runInContext(code, ctx, { filename: 'gas-bundle.js' });
  ctx.__gas = gas;
  return ctx;
}
function freshRequest(ctx) { vm.runInContext('_tableMemo = {}; _ssMemo = {};', ctx); }
function run(ctx, src) { freshRequest(ctx); return vm.runInContext(src, ctx); }
function as(ctx, email, src) {
  ctx.__gas.state.activeEmail = email;
  try { return run(ctx, src); } finally { ctx.__gas.state.activeEmail = OWNER; }
}
function fileByName(ctx, folderKey, name) {
  const fid = ctx.__gas.props['FOLDER_' + folderKey];
  return [...ctx.__gas.files.values()].find(f => f.parentId === fid && f.name === name && !f.trashed);
}
function putInbox(ctx, name, content) {
  const fid = ctx.__gas.props.FOLDER_INBOX;
  vm.runInContext(`DriveApp.getFolderById(${JSON.stringify(fid)}).createFile(${JSON.stringify(name)}, ${JSON.stringify(content)}, 'text/csv')`, ctx);
}
function pipeline(ctx) {
  let r, n = 0;
  do { r = run(ctx, 'runPipeline_("테스트")'); n++; } while (r.status === '계속' && n < 20);
  return r;
}
function table(ctx, db, t) { return run(ctx, `readTable_(${JSON.stringify(db)}, ${JSON.stringify(t)})`); }
function status(ctx) { return run(ctx, 'readStatus_()'); }

/** 가상 데이터 환경 구성. mutate(files) 로 원천 파일을 바꿔 넣을 수 있다. */
function buildEnv(mutate) {
  const ctx = boot();
  run(ctx, 'setupSystem()');
  if (mutate) {
    // 생성기를 감싸 파일 목록을 바꾼다
    ctx.__mutate = mutate;
    run(ctx, 'var __origGen = genVirtualData_; genVirtualData_ = function (o) { var g = __origGen(o); __mutate(g.files); return g; };');
  }
  const summary = run(ctx, `loadVirtualData_({ startDate: '${START}', endDate: '${END}', seed: 20261027 })`);
  const t0 = Date.now();
  const r = pipeline(ctx);
  return { ctx, summary, pipe: r, ms: Date.now() - t0 };
}

/* ───────────── 1. 순수 로직 단위 검증 ───────────── */
section('1. 공통 로직 단위 검증');
{
  const ctx = boot();
  const csv = run(ctx, `parseCsv_('a,b\\n"x,1","y""z"\\r\\n#CONTROL,1,0\\n')`);
  ok(csv.length === 3 && csv[1][0] === 'x,1' && csv[1][1] === 'y"z', 'CSV 따옴표·쉼표·CRLF 처리');

  const v = run(ctx, `(function(){
    var ex = {};
    var t = 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\\n' +
      'T1,1,2026-10-01,W1,과일,1000,외상,정상,\\n' +
      'T2,1,2026-02-30,W1,과일,1000,외상,정상,\\n' +
      'T3,1,2026-10-01,W9,과일,1000,외상,정상,\\n' +
      'T4,1,2026-10-01,W1,과일,-500,외상,반품,\\n' +
      'T1,1,2026-10-01,W1,과일,1000,외상,정상,\\n' +
      '#CONTROL,5,3500\\n';
    var r1 = validateImport_(t, 'SALES', { wholesalerIds: { W1: true }, existing: ex });
    var t2 = 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\\n' +
      'T1,1,2026-10-01,W1,과일,1000,외상,정상,\\nT1,2,2026-10-01,W1,과일,999,외상,정상,\\n#CONTROL,2,1999\\n';
    var r2 = validateImport_(t2, 'SALES', { wholesalerIds: { W1: true }, existing: ex });
    var t3 = 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\\n' +
      'T1,1,2026-10-01,W1,과일,2000,외상,정상,\\n#CONTROL,1,2000\\n';
    var r3 = validateImport_(t3, 'SALES', { wholesalerIds: { W1: true }, existing: ex });
    return { r1: r1, r2: r2, r3: r3 };
  })()`);
  const codes = v.r1.rejects.map(x => x.code).sort().join(',');
  ok(v.r1.accepted.length === 1 && codes === 'BAD_DATE,DUP_IN_FILE,ORIG_REQUIRED,UNKNOWN_WS', '행 검증: 날짜·코드·원거래번호·파일 내 중복 거부', codes);
  ok(v.r1.controlResult === '파일일치·일부거부', '관리합계 대조(파일 전체 기준)', v.r1.controlResult);
  ok(v.r2.duplicates === 1 && v.r2.accepted.length === 1, '이미 적재된 같은 행은 중복으로 건너뜀');
  ok(v.r3.rejects[0] && v.r3.rejects[0].code === 'KEY_CONFLICT', '같은 거래번호의 다른 내용은 거부(정정은 새 번호로)');

  const ver = run(ctx, `(function(){
    var rows = [
      { limit_id: 'L1', version_no: 1, wholesaler_id: 'W1', valid_from: '2024-01-01', valid_to: '2026-02-28', approval_status: '승인' },
      { limit_id: 'L1', version_no: 2, wholesaler_id: 'W1', valid_from: '2026-03-01', valid_to: '9999-12-31', approval_status: '승인' },
      { limit_id: 'L1', version_no: 3, wholesaler_id: 'W1', valid_from: '2026-11-01', valid_to: '9999-12-31', approval_status: '승인대기' } ];
    return { a: asOfVersions_(rows, 'limit_id', 'W1', '2026-02-15')[0].version_no,
             b: asOfVersions_(rows, 'limit_id', 'W1', '2026-12-01')[0].version_no,
             c: closePreviousVersions_(rows, 'limit_id', rows[2]).map(function (x) { return x.row.version_no + ':' + x.newValidTo; }) };
  })()`);
  ok(ver.a === 1 && ver.b === 2, '기준일별 유효 버전 선택(승인대기 제외)', `2026-02-15→v${ver.a}, 2026-12-01→v${ver.b}`);
  ok(ver.c.join() === '2:2026-10-31', '새 버전 승인 시 직전 버전 종료일 = 시작 전날', ver.c.join());

  const g = run(ctx, `[growthRate_(100, 0).status, growthRate_(100, null).status, Math.round(growthRate_(80, 100).value*100)]`);
  ok(g[0] === '비교불가' && g[1] === '비교불가' && g[2] === -20, '증감률: 비교기간 0·없음 → 비교불가');
  const ds = run(ctx, `[overallDataStatus_({latestBase:'2026-10-26', expectedBase:'2026-10-27'}).status,
    overallDataStatus_({latestBase:'2026-10-27', expectedBase:'2026-10-27', issuesOnLatest: 2}).status,
    overallDataStatus_({latestBase:''}).status, overallDataStatus_({latestBase:'2026-10-27', expectedBase:'2026-10-27'}).status]`);
  ok(ds.join() === '지연,불일치,자료없음,정상', '데이터 상태 판정(지연·불일치·자료없음은 정상 아님)', ds.join());
}

/* ───────────── 2. 기본 환경: 설정·가상 데이터·정기 처리 ───────────── */
section('2. 초기 설정·가상 데이터 적재·정기 처리');
const E = buildEnv();
const ctx = E.ctx;
{
  ok(run(ctx, 'setupSystem()').some(l => l.indexOf('설정 완료') >= 0), 'setupSystem 재실행 안전(멱등)');
  let threw = false;
  try { as(ctx, 'someone@example.invalid', 'setupSystem()'); } catch (e) { threw = true; }
  ok(threw, '소유자 외 계정은 setupSystem 실행 불가');
  ok(E.pipe.status === '완료', '정기 처리 완료', `${E.summary.files}개 파일, ${E.ms}ms`);
  const batches = table(ctx, 'DB_RAW', 'R_BATCH');
  ok(batches.length === E.summary.files && batches.every(b => b.status === '완료'), '모든 원천 파일 적재 완료(관리합계 일치)', `${batches.length}개`);
  ok(table(ctx, 'DB_RAW', 'R_SALES').length === E.summary.sales, '판매 원천 행 수 = 생성 행 수', `${E.summary.sales}행`);
  const st = status(ctx);
  ok(st.data_status === '정상' && st.latest_base_date === END, '데이터 상태 정상, 최신 기준일 = ' + END, st.data_status + ' ' + (st.status_reasons || ''));
  const dq = table(ctx, 'DB_AGG', 'A_DQ').filter(d => d.status !== '경고');
  ok(dq.length === 0, '정상 자료에서 데이터 이상(누락·불일치) 0건', `경고 포함 전체 ${table(ctx, 'DB_AGG', 'A_DQ').length}건`);
  const daily = table(ctx, 'DB_AGG', 'A_DAILY');
  ok(typeof daily[0].date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(daily[0].date), '날짜가 문자열(yyyy-MM-dd)로 저장·조회됨(시트 자동 변환 방지)');
  const months = new Set(table(ctx, 'DB_AGG', 'A_MONTHLY').map(m => m.ym));
  ok(months.size >= 25, '24개월 이상 월 집계 확보(최근 12개월 + 전년 대응 월)', `${months.size}개월`);
}

/* ───────────── 시나리오 9: 대사 ───────────── */
section('시나리오 9. 미수금·실적 합계가 기준 원장과 대사된다');
{
  const st = status(ctx);
  const recon = table(ctx, 'DB_AGG', 'A_RECON').filter(r => r.calc_run_id === st.last_calc_run_id);
  const items = [...new Set(recon.map(r => r.item))];
  ok(recon.length > 0 && recon.every(r => r.result === '일치'), '대사 전 항목 일치', `${recon.length}항목: ${items.join(', ')}`);
  const sales = table(ctx, 'DB_RAW', 'R_SALES').reduce((s, r) => s + r.amount, 0);
  const mon = table(ctx, 'DB_AGG', 'A_MONTHLY').filter(m => m.category === '전체').reduce((s, r) => s + r.purchase_amount, 0);
  ok(sales === mon, '판매 원천 총액 = 월 집계 총액', sales.toLocaleString());
  // 잘못된 관리합계 파일(현금 거래라 잔액에는 영향 없음)
  putInbox(ctx, 'SALES_TEST_CTRL.csv', 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\n' +
    'X900,1,2026-10-27,W0101,과일,10000,현금,정상,\n#CONTROL,1,99999\n');
  pipeline(ctx);
  const b = table(ctx, 'DB_RAW', 'R_BATCH').slice(-1)[0];
  const st2 = status(ctx);
  ok(b.status === '부분적재' && b.control_result === '불일치', '관리합계 불일치 파일은 부분적재·불일치로 기록', b.message);
  ok(st2.data_status !== '정상', '관리합계 불일치가 있으면 전체 상태가 정상이 아님', st2.data_status + ' / ' + st2.status_reasons);
}

/* ───────────── 시나리오 4: 재가져오기 중복 방지 ───────────── */
section('시나리오 4. 같은 자료를 다시 가져와도 중복되지 않는다');
{
  const salesBefore = table(ctx, 'DB_RAW', 'R_SALES').length;
  const arBefore = table(ctx, 'DB_RAW', 'R_AR_BAL').length;
  const f = fileByName(ctx, 'DONE', 'SALES_202609.csv');
  putInbox(ctx, 'SALES_202609.csv', f.bytes.toString('utf8'));
  const a = fileByName(ctx, 'DONE', 'AR_BAL_202610.csv');
  putInbox(ctx, 'AR_BAL_202610_재전송.csv', a.bytes.toString('utf8') + '\n');   // 내용(해시)이 달라도 행은 같음
  pipeline(ctx);
  const recent = table(ctx, 'DB_RAW', 'R_BATCH').slice(-2);
  const bs = [recent.find(b => b.file_name === 'SALES_202609.csv'), recent.find(b => b.file_name === 'AR_BAL_202610_재전송.csv')];
  ok(table(ctx, 'DB_RAW', 'R_SALES').length === salesBefore, '같은 파일 재가져오기: 판매 행 수 불변', `${salesBefore}행`);
  ok(bs[0].status === '중복파일', '같은 내용 파일은 중복파일로 기록하고 건너뜀', bs[0].message);
  ok(table(ctx, 'DB_RAW', 'R_AR_BAL').length === arBefore && bs[1].duplicate_count > 0 && bs[1].accepted_count === 0,
    '파일은 다르지만 행이 같으면 행 단위로 중복 처리', bs[1].message);
  // 같은 거래번호·다른 금액
  const line = f.bytes.toString('utf8').split('\n')[1].split(',');
  line[5] = String(Number(line[5]) + 1000);
  putInbox(ctx, 'SALES_CONFLICT.csv', 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\n' + line.join(',') + '\n#CONTROL,1,' + line[5] + '\n');
  pipeline(ctx);
  const bc = table(ctx, 'DB_RAW', 'R_BATCH').slice(-1)[0];
  const rj = table(ctx, 'DB_RAW', 'R_REJECT').filter(r => r.batch_id === bc.batch_id);
  ok(bc.status === '실패' && rj[0] && rj[0].error_code === 'KEY_CONFLICT' && table(ctx, 'DB_RAW', 'R_SALES').length === salesBefore,
    '같은 키 다른 내용은 거부되고 원천은 바뀌지 않음', rj[0] && rj[0].error_message);
  ok(!!fileByName(ctx, 'ERROR', 'SALES_CONFLICT.csv'), '전부 거부된 파일은 03_가져오기_오류 폴더로 이동');
}

/* ───────────── 시나리오 7: 권한 ───────────── */
section('시나리오 7. 권한 없는 사용자는 요청을 바꿔도 제한 자료에 접근하지 못한다');
{
  const asg = table(ctx, 'DB_MASTER', 'M_ASSIGNMENT');
  const a1 = 'auctioneer1@example.invalid';
  const own = asg.find(a => a.user_id === a1).wholesaler_id;
  const other = asg.find(a => a.user_id !== a1).wholesaler_id;
  const r1 = as(ctx, a1, `api_get360(${JSON.stringify(other)})`);
  ok(!r1.ok, '경매사 → 담당 외 중도매인 ID로 직접 요청: 거부', r1.error);
  const r2 = as(ctx, a1, `api_get360(${JSON.stringify(own)})`);
  ok(r2.ok && r2.data.guarantees.every(g => g.guarantor_ref === undefined) && !r2.data.history, '경매사 → 담당 중도매인: 허용, 보증인 참조·변경 이력 미전송');
  ok(!as(ctx, a1, `api_getGuarantors(${JSON.stringify(own)})`).ok, '경매사 → 보증인 개인정보: 거부');
  const srch = as(ctx, a1, 'api_searchWholesalers("")');
  ok(srch.ok && srch.data.every(w => asg.some(a => a.user_id === a1 && a.wholesaler_id === w.wholesaler_id)), '경매사 검색 결과는 담당분만', `${srch.data.length}명`);
  const v = 'viewer1@example.invalid';
  const rv = as(ctx, v, 'api_get360("W0123")');
  ok(rv.ok && !rv.data.contacts && !rv.data.evidence && rv.data.guarantees.every(g => g.guarantor_ref === undefined), '조회자 360: 연락처·증빙·보증인 참조 필드 자체가 없음');
  ok(!as(ctx, v, 'api_runPipelineNow()').ok, '조회자 → 정기 처리 실행 요청: 거부');
  ok(!as(ctx, v, `api_submitVersion('M_LIMIT', { wholesaler_id: 'W0123', limit_type: '기본한도', amount: 1, valid_from: '2026-11-01', approval_basis: 'x' }, '변조')`).ok, '조회자 → 기초자료 변경 요청: 거부');
  ok(!as(ctx, v, 'api_auditLog({})').ok && !as(ctx, v, 'api_listUsers()').ok, '조회자 → 이력·사용자 관리: 거부');
  ok(!as(ctx, 'credit1@example.invalid', `api_decideVersion('M_LIMIT', 'LW0123-B', 1, '승인', '')`).ok, '채권담당 → 승인 요청 처리: 거부');
  ok(!as(ctx, 'stranger@example.invalid', 'api_bootstrap()').ok, '미등록 사용자: 거부');
  ok(!as(ctx, '', 'api_bootstrap()').ok, '식별 불가(이메일 빈 값): 거부');
  let t1 = false, t2 = false, t3 = false;
  try { as(ctx, v, 'runPipeline()'); } catch (e) { t1 = true; }
  try { as(ctx, v, 'loadVirtualData()'); } catch (e) { t2 = true; }
  try { as(ctx, v, 'restoreDb("DB_MASTER", "x")'); } catch (e) { t3 = true; }
  ok(t1 && t2 && t3, '편집기 전용 함수(runPipeline·loadVirtualData·restoreDb)를 웹에서 직접 호출: 거부');
  const denied = table(ctx, 'DB_LOG', 'L_ACCESS').filter(x => x.result === '거부');
  ok(denied.length >= 8, '거부 요청은 접근 기록(L_ACCESS)에 남음', `${denied.length}건`);
  // 경매사 담당 변경 → 즉시 접근 범위 반영
  const fromToday = run(ctx, 'todayStr_()');
  run(ctx, `setAssignment_(ownerAsUser_(), ${JSON.stringify(other)}, 'auctioneer1@example.invalid', '${fromToday}', '담당 변경 테스트')`);
  ok(as(ctx, a1, `api_get360(${JSON.stringify(other)})`).ok, '담당 지정 후에는 해당 중도매인 접근 허용');
}

/* ───────────── 시나리오 8: 과거 판단 근거 보존 ───────────── */
section('시나리오 8. 한도·담보 변경 후에도 과거 시점 자료가 보존된다');
{
  const credit = 'credit1@example.invalid';
  const s = as(ctx, credit, `api_submitVersion('M_LIMIT', { limit_id: 'LW0123-B', wholesaler_id: 'W0123', limit_type: '기본한도', amount: 30000000, valid_from: '2026-11-01', approval_basis: '(가상) 추가 감액' }, '테스트 감액')`);
  ok(s.ok && s.data.version_no === 3 && s.data.approval_status === '승인대기', '채권담당 한도 변경 요청 → v3 승인대기', s.error);
  const before = as(ctx, credit, 'api_get360("W0123")').data.limits.find(l => l.limit_type === '기본한도');
  ok(before.version_no === 2, '승인 전에는 현재 한도에 반영되지 않음', 'v' + before.version_no);
  ok(!as(ctx, credit, 'api_submitVersion("M_LIMIT", { limit_id: "LW0123-B", wholesaler_id: "W0123", limit_type: "기본한도", amount: 1, valid_from: "2026-12-01", approval_basis: "x" }, "중복")').ok, '승인 대기 중 같은 ID 추가 요청: 거부');
  const self = run(ctx, `(function(){ try { submitVersion_({user_id:'${OWNER}'}, 'M_COLLATERAL', { wholesaler_id: 'W0101', collateral_type: '예금(질권)', set_amount: 1000, valid_from: '2026-10-01' }, 'x'); var p = pendingVersions_().filter(function(r){return r.requested_by==='${OWNER}';})[0]; decideVersion_({user_id:'${OWNER}'}, p.table, p.id, p.version_no, '승인', ''); return 'approved'; } catch (e) { return e.message; } })()`);
  ok(/본인/.test(self), '요청자 본인 승인: 거부', self);
  const ap = run(ctx, `api_decideVersion('M_LIMIT', 'LW0123-B', 3, '승인', '테스트 승인')`);
  ok(ap.ok, '관리자 승인', ap.error);
  const lim = table(ctx, 'DB_MASTER', 'M_LIMIT').filter(l => l.limit_id === 'LW0123-B');
  const pick = (d) => run(ctx, `asOfVersions_(readTable_('DB_MASTER','M_LIMIT'), 'limit_id', 'W0123', '${d}').filter(function(l){return l.limit_type==='기본한도';})[0]`);
  ok(pick('2026-02-15').version_no === 1 && pick('2026-10-28').version_no === 2 && pick('2026-11-02').version_no === 3,
    '기준일별 한도 재현: 2026-02-15→v1, 2026-10-28→v2, 2026-11-02→v3', lim.map(l => `v${l.version_no} ${l.valid_from}~${l.valid_to} ${l.amount}`).join(' | '));
  const past = run(ctx, 'api_get360("W0123", "2026-04-15")').data;
  const coll = past.collaterals.find(c => c.collateral_id === 'CW0123-01');
  ok(coll.version_no === 1, '담보 재평가(2026-06-01) 이전 기준일 조회 시 재평가 전 값 표시', `v${coll.version_no} 인정금액 ${coll.recognized_amount}`);
  ok(table(ctx, 'DB_LOG', 'L_AUDIT').some(a => a.action === 'CLOSE_PERIOD' && a.record_key === 'LW0123-B#v2'), '이전 버전 종료 처리도 변경 이력에 기록');
}

/* ───────────── 동시 수정 충돌 ───────────── */
section('동시 수정 충돌 방지');
{
  const w = table(ctx, 'DB_MASTER', 'M_WHOLESALER').find(x => x.wholesaler_id === 'W0101');
  const r1 = run(ctx, `api_updateWholesaler('W0101', { note: '첫 번째 사용자' }, ${w.row_version}, '테스트')`);
  const r2 = run(ctx, `api_updateWholesaler('W0101', { note: '두 번째 사용자(이전 화면)' }, ${w.row_version}, '테스트')`);
  ok(r1.ok && !r2.ok && /CONFLICT/.test(r2.error), '같은 행 버전으로 두 번째 저장 시 충돌 안내', r2.error);
}

/* ───────────── 통합 상세(360)·홈 ───────────── */
section('중도매인 통합 상세·통합 홈');
{
  const d = run(ctx, 'api_get360("W0123")').data;
  ok(d.meta.baseDate === END && d.meta.lastUpdated && d.meta.period, '기준일·집계기간·최종 갱신 시각 표시', `${d.meta.baseDate} / ${d.meta.period} / ${d.meta.lastUpdated}`);
  ok(d.trend.length === 12, '최근 12개월 추이');
  const last = d.trend[11];
  ok(last.partial && last.mtd && /동일 경과 경매일/.test(last.mtd.basis), '진행 중인 월은 동일 경과 경매일 기준으로 전년 비교',
    `${last.ym}: 경과 ${last.mtd.elapsedAuctionDays}경매일, 전년 비교구간 ${last.mtd.prevPeriod}`);
  ok(last.byCategory['전체'].yoy === null, '진행 중인 월은 전년 월 전체와 직접 증감률을 내지 않음');
  ok(d.limits.every(l => l.limit_type) && !('limit_total' in d.credit), '한도는 유형별 표시, 합산값 없음');
  ok(!JSON.stringify(d.trend).includes('turnover'), '부류별 회전율 필드 없음(시나리오 5 사전 조건)');
  ok(d.credit.overdue_amount > 0, '(가상) W0123 결제 지연 → 연체 발생 표시', `연체 ${d.credit.overdue_amount.toLocaleString()}원, 최장 ${d.credit.max_overdue_days}일`);
  const s207 = run(ctx, 'api_get360("W0207")').data.trend;
  const jul = s207.find(t => t.ym === '2026-07'), sep = s207.find(t => t.ym === '2026-09');
  ok(jul && jul.byCategory['과일'].yoy.status === '정상' && jul.byCategory['과일'].yoy.value > -0.4,
    '(가상) W0207 여름 계절 감소: 전월·성수기 대비는 크게 줄지만 전년 동월 대비는 급감 아님(시나리오 2 사전 확인)',
    `2026-07 ${jul.byCategory['과일'].amount.toLocaleString()}원 / 2026-09 ${sep.byCategory['과일'].amount.toLocaleString()}원 / 전년 동월 대비 ${(jul.byCategory['과일'].yoy.value * 100).toFixed(1)}%`);
  const home = as(ctx, 'auctioneer2@example.invalid', 'api_home()').data;
  ok(home.myList.length > 0 && home.counts.myWholesalers === home.myList.length, '경매사 홈: 담당 중도매인만 집계', `${home.myList.length}명, 기한 도래 ${home.counts.expiring}건`);
  const ah = run(ctx, 'api_home()').data;
  ok(ah.expiring.length > 0 && ah.expiring.every(e => e.dday <= 60), '관리자 홈: 담보·보증 기한 도래(60일 이내) 표시', `${ah.expiring.length}건`);
  ok(ah.batchProblems.length > 0, '관리자 홈: 가져오기 문제 표시', ah.batchProblems.map(b => b.file_name + ':' + b.status).join(', '));
}

/* ───────────── 시나리오 3: 갱신 실패·누락 ───────────── */
section('시나리오 3. 데이터 갱신 실패·누락이 정상으로 표시되지 않는다');
{
  // (a) 마지막 기준일 잔액 파일 일부 누락: W0101 의 2026-10-20 행 삭제, W0102 의 최신일 행 삭제
  const env = buildEnv((files) => {
    const f = files.find(x => x.name === 'AR_BAL_202610.csv');
    const lines = f.content.trim().split('\n');
    const keep = lines.filter(l => !(l.startsWith('2026-10-20,W0101,') || l.startsWith(END + ',W0102,') || l.startsWith('#CONTROL')));
    const body = keep.slice(1);
    const sum = body.reduce((s, l) => s + Number(l.split(',')[2]), 0);
    f.content = keep.join('\n') + '\n#CONTROL,' + body.length + ',' + sum + '\n';
  });
  const c = env.ctx;
  const st = status(c);
  ok(st.data_status !== '정상', '최신 기준일에 잔액 누락이 있으면 전체 상태 정상 아님', `${st.data_status}: ${st.status_reasons}`);
  const w1 = run(c, 'api_get360("W0101")').data.dataState;
  ok(w1.state === '판정보류' && w1.reasons.some(r => r.indexOf('2026-10-20') >= 0), '과거 일자 누락 중도매인 → 판정 보류', w1.reasons[0]);
  const dq = table(c, 'DB_AGG', 'A_DQ').filter(d => d.reason_code === 'AR_MISSING');
  ok(dq.length === 2, '누락 2건 탐지(AR_MISSING)', dq.map(d => d.wholesaler_id + ' ' + d.date).join(', '));
  ok(dq.length === 2 && table(c, 'DB_AGG', 'A_DQ').some(d => d.reason_code === 'ROLLFWD_MISMATCH') === false, '누락은 잔액 연속성 위반으로 오판하지 않음(앞뒤 잔액으로 이어서 점검)');

  // (b) 마지막 경매일 자료 전체 미도착 → 지연
  const env2 = buildEnv((files) => {
    ['SALES_202610.csv', 'RECEIPT_202610.csv', 'AR_BAL_202610.csv'].forEach((n) => {
      const f = files.find(x => x.name === n);
      const lines = f.content.trim().split('\n');
      const dateIdx = n.startsWith('SALES') ? 2 : n.startsWith('RECEIPT') ? 2 : 0;
      const amtIdx = n.startsWith('SALES') ? 5 : n.startsWith('RECEIPT') ? 4 : 2;
      const body = lines.slice(1).filter(l => !l.startsWith('#CONTROL') && l.split(',')[dateIdx] !== END);
      const sum = body.reduce((s, l) => s + Number(l.split(',')[amtIdx]), 0);
      f.content = [lines[0]].concat(body).join('\n') + '\n#CONTROL,' + body.length + ',' + sum + '\n';
    });
  });
  const st2 = status(env2.ctx);
  const v2 = run(env2.ctx, 'api_get360("W0105")').data;
  ok(st2.data_status === '지연' && v2.dataState.state === '판정보류', '최신 경매일 자료 미도착 → 지연, 통합 상세는 판정 보류', `${st2.status_reasons}`);

  // (c) 잔액이 거래·입금과 맞지 않는 수정본 → 불일치
  const env3 = buildEnv();
  putInbox(env3.ctx, 'AR_BAL_REVISION.csv', 'base_date,wholesaler_id,balance,overdue_amount,max_overdue_days\n2026-10-26,W0104,1,0,0\n#CONTROL,1,1\n');
  pipeline(env3.ctx);
  const rf = table(env3.ctx, 'DB_AGG', 'A_DQ').filter(d => d.reason_code === 'ROLLFWD_MISMATCH');
  ok(rf.length >= 1 && run(env3.ctx, 'api_get360("W0104")').data.dataState.state === '판정보류', '잔액 수정본이 원장 흐름과 맞지 않으면 불일치 → 판정 보류', rf.map(d => d.date + ' ' + d.detail).join(' / '));
  ok(table(env3.ctx, 'DB_RAW', 'R_AR_BAL').filter(r => r.is_revision).length === 1, '잔액 수정본은 덮어쓰지 않고 수정본 표시로 추가 적재');
}

/* ───────────── 실패·재처리·이어서 실행 ───────────── */
section('실패 기록·재처리·실행시간 분할');
{
  const env = buildEnv();
  const c = env.ctx;
  putInbox(c, 'SALES_RETRY.csv', 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\nX777,1,2026-10-27,W0102,채소,5000,현금,정상,\n#CONTROL,1,5000\n');
  run(c, 'var __agg = buildAggregates_; buildAggregates_ = function () { throw new Error("모의 집계 오류"); };');
  let threw = false;
  try { run(c, 'runPipeline_("테스트")'); } catch (e) { threw = true; }
  c.__gas.lockRelease();
  const stt = JSON.parse(c.__gas.props.PIPELINE_STATE || 'null');
  ok(threw && stt && stt.stage === 'AGGREGATE', '집계 실패 시 상태 보존(실패 단계부터 재시작 가능)', stt && stt.stage);
  ok(table(c, 'DB_LOG', 'L_JOB').some(j => j.status === '실패' && /모의 집계 오류/.test(j.message)) && /모의 집계 오류/.test(status(c).last_failure), '실패가 작업 로그와 상태에 기록됨');
  run(c, 'buildAggregates_ = __agg;');
  const salesN = table(c, 'DB_RAW', 'R_SALES').length;
  const r = pipeline(c);
  ok(r.status === '완료' && table(c, 'DB_RAW', 'R_SALES').length === salesN && !c.__gas.props.PIPELINE_STATE, '재실행: 집계 단계부터 완료, 원천 이중 적재 없음');

  putInbox(c, 'SALES_PAUSE.csv', 'source_txn_no,line_no,txn_date,wholesaler_id,category,amount,txn_type,correction_type,orig_txn_no\nX778,1,2026-10-27,W0102,채소,5000,현금,정상,\n#CONTROL,1,5000\n');
  run(c, 'APP.JOB_TIME_BUDGET_MS = 0;');
  const p1 = run(c, 'runPipeline_("테스트")');
  const trig = c.__gas.triggers.filter(t => t.getHandlerFunction() === 'triggerContinuePipeline').length;
  ok(p1.status === '계속' && trig === 1, '실행 시간 부족 시 상태 저장 후 이어서 실행 트리거 1개 등록', p1.message);
  run(c, 'APP.JOB_TIME_BUDGET_MS = 270000;');
  const p2 = run(c, 'triggerContinuePipeline()');
  ok(p2.status === '완료' && c.__gas.triggers.filter(t => t.getHandlerFunction() === 'triggerContinuePipeline').length === 0, '이어서 실행 완료 후 트리거 정리');

  run(c, 'installTriggers()');
  ok(c.__gas.triggers.map(t => t.getHandlerFunction()).sort().join() === 'triggerDailyBackup,triggerDailyPipeline', '정기 트리거 설치(중복 없이 2개)');
}

/* ───────────── 백업·복구 ───────────── */
section('백업·복구');
{
  const bk = run(ctx, 'backupNow()');
  ok(bk.copied.length === 5, '저장소 5개(DB_MASTER·PII·RAW·AGG·LOG) 사본 생성', bk.folder);
  const masterBackup = bk.copied.find(x => x.startsWith('DB_MASTER')).split('→')[1];
  run(ctx, `api_updateWholesaler('W0102', { note: '백업 이후 변경' }, ${table(ctx, 'DB_MASTER', 'M_WHOLESALER').find(x => x.wholesaler_id === 'W0102').row_version}, '테스트')`);
  const rs = run(ctx, `restoreDb('DB_MASTER', ${JSON.stringify(masterBackup)})`);
  const after = table(ctx, 'DB_MASTER', 'M_WHOLESALER').find(x => x.wholesaler_id === 'W0102');
  ok(rs.newFileId && after.note !== '백업 이후 변경', '복구 후 백업 시점 자료로 돌아감(이전 파일은 이름 변경 보존)', `이전 ${rs.previousFileId} → 새 ${rs.newFileId}`);
  ok(table(ctx, 'DB_LOG', 'L_AUDIT').some(a => a.action === 'RESTORE'), '복구가 변경 이력에 기록됨');
}

/* ───────────── 결과 ───────────── */
console.log('중도매인 통합관리 1단계 로컬 검증 (모의 Apps Script, 가상 데이터)');
console.log(`가상 데이터: ${E.summary.period}, 중도매인 ${E.summary.wholesalers}명, 판매 ${E.summary.sales}행, 입금 ${E.summary.receipts}행, 잔액 ${E.summary.arRows}행, 파일 ${E.summary.files}개`);
console.log(results.join('\n'));
console.log(`\n합계: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
