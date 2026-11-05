/**
 * run_tests_hybrid.js — 하이브리드 배포·농협 파일 어댑터 검증
 * 농협 추출 형식(일별 낙찰, 월별 사업실적, 담보현황, 계통마트)을 같은 열 배치의 가상 CSV 로 만들어 검증한다(실제 파일은 모의 환경에서 열 수 없음).
 * 스냅샷 HTML 생성(역할별 분리·개인정보 제외), 동향보고 파일 적재, 기존 폴더를 루트로 쓰는 설정.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas_mock');
const GAS = path.join(__dirname, '..', 'gas');
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs', 'Master.gs', 'Metrics.gs', 'Signals.gs',
  'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs', 'NhImport.gs', 'Snapshot.gs', 'Checklist.gs', 'Start.gs'];
const OWNER = 'owner@example.invalid';
const FROZEN = new Date('2026-10-28T09:00:00+09:00').getTime(), REAL0 = Date.now();
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(FROZEN + (Date.now() - REAL0)); else super(...a); } static now() { return FROZEN + (Date.now() - REAL0); } }
let pass = 0, fail = 0; const out = [];
const ok = (c, n, d) => { c ? pass++ : fail++; out.push((c ? '  [통과] ' : '  [실패] ') + n + (d ? ' — ' + d : '')); };
const section = (t) => out.push('\n■ ' + t);
function boot() {
  const gas = createGas({ ownerEmail: OWNER, gasDir: GAS });
  const ctx = vm.createContext(Object.assign({ Date: FrozenDate }, gas.globals));
  vm.runInContext(ORDER.map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n;\n'), ctx, { filename: 'gas-bundle.js' });
  ctx.__gas = gas; return ctx;
}
const run = (ctx, src) => { vm.runInContext('_tableMemo = {}; _ssMemo = {};', ctx); return vm.runInContext(src, ctx); };
const table = (ctx, db, t) => run(ctx, `readTable_(${JSON.stringify(db)}, ${JSON.stringify(t)})`);
const pipeline = (ctx) => { let r, n = 0; do { r = run(ctx, 'runPipeline_("테스트")'); n++; } while (r.status === '계속' && n < 20); return r; };
const J = JSON.stringify;
function putFile(ctx, folderId, name, content) { vm.runInContext(`DriveApp.getFolderById(${J(folderId)}).createFile(${J(name)}, ${J(content)}, 'text/csv')`, ctx); }

/* 농협 형식 가상 파일 생성기 (열 배치는 실제 추출 파일과 동일, 값은 가상) */
const META = (lines) => lines.map(l => l + ',,,,,,,,,,,,,,,,,,,').join('\n') + '\n';
function nhDaily(rows) {   // rows: [date, bigCode, bigName, ws, wsName, weight, amount, mid?, small?]
  const head = META(['프로그램명 : [EBFW916007]농산물 공판장 취급실적 및 정산내역', '', '조합사업장 : [8800000000000] (가상)공판장(공판)', '기표/판매구분 : 기표일', '조회기간구분 : 기간(일)', '분석조건 : 소수점처리:반올림 금액:1원 수량:1개 중량:1Kg', '']);
  const header = '번호,조직구분,사업장,사업장명,기표일자,농협대분류,농협대분류명,농협중분류,농협중분류명,농협소분류,농협소분류명,공판매매구분,공판원표구분,수입여부,파렛출하여부,중도매인,중도매인명,거래인허가번호,중량,금액(A)';
  return head + header + '\n' + rows.map((r, i) => [i + 1, '경제지주', '8800000000000', '(가상)공판장(공판)', r[0], r[1], r[2], r[7] || '001', '(가상)중분류', r[8] || '001', '(가상)소분류', '경매', '경매', '국산', '부', r[3], r[4], r[3], r[5], `"${Number(r[6]).toLocaleString('en-US')}"`].join(',')).join('\n') + '\n';
}
function nhMonthly(rows) {   // [ym, ws, wsName, weight, amount]
  const head = META(['프로그램명 : [EBFW916007]농산물 공판장 취급실적 및 정산내역', '', '조회기간구분 : 기간(월)', '']);
  return head + '번호,조직구분,사업장,사업장명,기표년월,중도매인,중도매인명,중량,금액(A)\n' + rows.map((r, i) => [i + 1, '경제지주', '8800000000000', '(가상)공판장(공판)', r[0], r[1], r[2], r[3], `"${Number(r[4]).toLocaleString('en-US')}"`].join(',')).join('\n') + '\n';
}
function nhCollateral(rows) {   // objects
  const title = '중도매인 담보현황 (2026. 9. 16. 기준),,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,(단위 : 원),,,\n연번,중도매인,,,,,,중도매인 한도금액,,,,담보 내역,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n';
  const header = ',"허가 번호",성명,품목,"갱신 년도","약정 구분 (Safekey)",마감한도,외상한도금액,최고한도금액,배수,추가한도,합계,거래보증금,부동산,"보증 보험","예금 담보","보험 (공제)",담보 변동일,"담보보고일 (관리사업소)",허가일,허가만료일,약정일,전산만기일,1차약정만료일,2차약정만료일,기존재약정,,연대보증인유무,연대보증인,"담보제공자 (""-""은 본인)","담보만기일 (담보종류)",NICE 신용점수,NICE점수 조회일,"연대보증 NICE 신용점수","연대보증 NICE 조회일","연대보증 재산여력 (명절,성수기 한도)",담보물,비고,업데이트일,,\n';
  const money = (v) => v ? `" ${Number(v).toLocaleString('en-US')} "` : '';
  return title + header + rows.map((r, i) => [i + 1, r.ws, r.name, r.item, r.renew || '25년', r.contract || '재약정완료', money(r.close), money(r.credit), money(r.max), r.ratio || '100%', money(r.extra), money(r.sum), money(r.deposit), money(r.realty), money(r.insurance), money(r.saving), money(r.coop),
    r.changeDate || '', '', r.permit || '8/1/2019', r.permitExp || '7/31/2027', '', '', '', '', '재약정', '', r.hasG || '무', r.guarantor || '', '-', r.expiryText || '', '791', '2023-10-30', '', '', '', r.desc || '', r.note || '', r.updated || '2/2/2026', '', ''].join(',')).join('\n') + '\n';
}
function nhMart() {
  return META(['프로그램명 : [EBFW916004]공판장거래인/계통마트 청과류 거래실적', '']) + '번호,유통거래처지역본부,유통거래처지역본부명,유통거래처,유통거래처명,상품과목,공급처구분,공급처,공급처명,공급처주소,공급처소속,공판거래인판매금액,매입수량,매입공급금액,매입부가세,매입금액\n1,005557,(가상)본부,8808983300825,(가상)마트,과일,중도매인,29100,(가상)청과,(가상)주소,(가상)공판장,"1,000","10","100",0,"100"\n';
}

/* ───── 1. 농협 파일만으로 운영 (미수 자료 없음) ───── */
section('농협 추출 파일 어댑터 (가상 자료, 실제 열 배치)');
const ctx = boot();
run(ctx, `(function(){ var f = DriveApp.createFolder('2611_AI혁신센터_채권관리'); __root = f.getId(); })()`);
const rootId = run(ctx, '__root');
const su = run(ctx, `setupWithFolder('2611_AI혁신센터_채권관리')`);
ok(su[0].indexOf('루트 폴더 지정') === 0 && ctx.__gas.props.ROOT_FOLDER_ID === rootId, '기존 드라이브 폴더를 루트로 지정(setupWithFolder)', su[0]);
ok(ctx.__gas.folders.get(ctx.__gas.props.FOLDER_INBOX).parentId === rootId, '하위 폴더(가져오기·서식·배포 등)가 그 폴더 안에 생성');
{
  // 담보현황 → 기초자료
  putFile(ctx, rootId, '★중도매인 담보현황_26.9.16.기준.xlsx의 사본.csv', nhCollateral([
    { ws: '1', name: '(가상)갑', item: '과일', close: 24000000, credit: 82000000, max: 166000000, extra: 124000000, sum: 110000000, realty: 60000000, saving: 50000000, hasG: '유', guarantor: '(가상)을 (자녀)', expiryText: '2027-07-29, 없음 (정기예금,APT)', desc: '정기예금,부동산(APT)', permit: '8/1/2019' },
    { ws: '2', name: '(가상)병', item: '채소', close: 8000000, credit: 27000000, max: 27000000, extra: 27000000, sum: 30000000, deposit: 30000000, hasG: '무', permit: '4/15/2022' },
    { ws: '6', name: '(가상)정', item: '과일', close: 0, credit: 50000000, max: 50000000, extra: 0, sum: 40000000, insurance: 40000000, hasG: '유', guarantor: '(가상)무', expiryText: '2026-11-20 (보증보험)', permit: '2016-03-01' }
  ]));
  // 월별 사업실적 2024-10 ~ 2026-08, 일별 낙찰 2026-09 ~ 2026-10-27
  const monthly = [], daily = [];
  const wsList = [['1', '(가상)갑', 2500000], ['2', '(가상)병', 900000], ['6', '(가상)정', 1800000], ['9', '(가상)자동등록', 600000]];
  for (let ym = '2024-10'; ym <= '2026-08'; ym = run(ctx, `addMonths_('${ym}', 1)`)) wsList.forEach(w => monthly.push([ym, w[0], w[1], 1000, w[2] * 26 * (1 + (parseInt(ym.slice(5)) % 3) * 0.05)]));
  const cal = run(ctx, `dateRange_('2026-09-01', '2026-10-27').filter(function(d){ return dowOf_(d) !== 0; })`);
  cal.forEach(d => wsList.forEach(w => { daily.push([d, '002', '과일', w[0], w[1], 100, Math.round(w[2] * 0.6)]); daily.push([d, '003', '채소', w[0], w[1], 50, Math.round(w[2] * 0.3)]); daily.push([d, '001', '곡류', w[0], w[1], 10, Math.round(w[2] * 0.1)]); }));
  putFile(ctx, rootId, '2024년~2026년8월_공판장거래인_사업실적.xlsx의 사본.csv', nhMonthly(monthly));
  putFile(ctx, rootId, '2026년 9월~10월 중도매인 낙찰 실적 기초자료.csv', nhDaily(daily));
  putFile(ctx, rootId, '2026년 계통마트 실적 기초자료.csv', nhMart());
  // 경매 일정 등록(일요일 휴장) — 실자료 운영 시 관리자가 등록
  run(ctx, `appendObjects_('DB_MASTER', 'M_CALENDAR', dateRange_('2024-10-01', '2026-10-31').map(function(d){ return { date: d, is_auction_day: dowOf_(d) !== 0, note: '' }; }))`);
  const r = pipeline(ctx);
  const batches = table(ctx, 'DB_RAW', 'R_BATCH');
  const by = (src) => batches.find(b => b.source === src);
  ok(r.status === '완료' && batches.length === 4, '루트 폴더의 파일 4개를 자동 인식·처리', batches.map(b => b.source + ':' + b.status).join(', '));
  ok(by('NH_COLLATERAL') && by('NH_COLLATERAL').status === '완료' && /기준일 2026-09-16/.test(by('NH_COLLATERAL').message), '담보현황: 파일명에서 기준일 추출, 적재 완료', by('NH_COLLATERAL') && by('NH_COLLATERAL').message);
  ok(by('NH_SALES_DAILY').status === '완료' && by('NH_SALES_DAILY').accepted_count === daily.length, '일별 낙찰 실적: 행 단위 적재(0원 제외)', by('NH_SALES_DAILY').message);
  ok(by('NH_SALES_MONTHLY').status === '완료' && by('NH_SALES_MONTHLY').accepted_count === monthly.length, '월별 사업실적: (중도매인, 월) 단위 적재', by('NH_SALES_MONTHLY').message);
  ok(by('NH_MART').status === '참고자료', '계통마트 실적: 적재하지 않고 참고자료로 기록', by('NH_MART').message);
  const ws = table(ctx, 'DB_MASTER', 'M_WHOLESALER');
  ok(ws.length === 4 && ws.find(w => w.wholesaler_id === '9') && /자동 등록/.test(ws.find(w => w.wholesaler_id === '9').note), '담보현황 3명 + 실적에만 있는 1명 자동 등록', ws.map(w => w.wholesaler_id + ':' + w.name).join(', '));
  ok(ws.find(w => w.wholesaler_id === '1').trade_start_date === '2019-08-01' && ws.find(w => w.wholesaler_id === '1').categories === '과일', '허가일(M/D/YYYY) → 거래 시작일, 품목 → 취급 부류');
  const lim = run(ctx, `asOfVersions_(readTable_('DB_MASTER','M_LIMIT'), 'limit_id', '1', todayStr_())`);
  ok(lim.length === 3 && lim.find(l => l.limit_type === '기본한도').amount === 82000000 && lim.find(l => l.limit_type === '마감한도').amount === 24000000 && lim.find(l => l.limit_type === '추가한도').amount === 124000000, '한도: 외상한도→기본, 마감, 추가 각각 별도(합산 없음)', lim.map(l => l.limit_type + ' ' + l.amount).join(', '));
  const col = run(ctx, `asOfVersions_(readTable_('DB_MASTER','M_COLLATERAL'), 'collateral_id', '1', todayStr_())`);
  ok(col.length === 2 && col.every(c => c.recognized_amount === '' && /미확인/.test(c.review_status)), '담보: 종류별 설정금액 적재, 내부 인정금액은 비움(미확인)', col.map(c => c.collateral_type + ' ' + c.set_amount).join(', '));
  const col6 = run(ctx, `asOfVersions_(readTable_('DB_MASTER','M_COLLATERAL'), 'collateral_id', '6', todayStr_())`)[0];
  ok(col6.collateral_type === '보증보험증권' && col6.expiry_date === '2026-11-20', '보증보험 만기일을 "담보만기일(담보종류)" 열에서 추출 → 기한 도래 신호 대상', col6.expiry_date);
  const g = run(ctx, `asOfVersions_(readTable_('DB_MASTER','M_GUARANTEE'), 'guarantee_id', '1', todayStr_())`)[0];
  const pii = table(ctx, 'DB_PII', 'P_GUARANTOR');
  ok(g.has_guarantee === '있음' && g.guarantor_ref && pii.find(p => p.guarantor_ref === g.guarantor_ref).name === '(가상)을' && pii.find(p => p.guarantor_ref === g.guarantor_ref).relation === '자녀', '연대보증인 "성명 (관계)" → 별도 개인정보 저장소, 보증 레코드에는 참조만');
  ok(!JSON.stringify(table(ctx, 'DB_MASTER', 'M_WHOLESALER')).includes('791') && !JSON.stringify(table(ctx, 'DB_MASTER', 'M_COLLATERAL')).includes('791'), 'NICE 신용점수는 어디에도 적재하지 않음');
  const st = run(ctx, 'readStatus_()');
  ok(st.ar_available === '아니오' && st.latest_base_date === '2026-10-27' && st.data_status === '정상', '미수 자료 없음 → 최신 기표일을 기준일로, 상태 정상(자료 없음을 숨기지 않고 표시)', `${st.latest_base_date} / ar_available=${st.ar_available}`);
  const mon = table(ctx, 'DB_AGG', 'A_MONTHLY').filter(m => m.wholesaler_id === '1' && m.category === '전체');
  const m8 = mon.find(m => m.ym === '2026-08'), m9 = mon.find(m => m.ym === '2026-09');
  ok(m8 && m8.avg_method === 'MONTHLY_ONLY' && m8.purchase_days === '' && m9 && m9.avg_method !== 'MONTHLY_ONLY' && m9.purchase_days > 0, '월 합계만 있는 달은 MONTHLY_ONLY(구매일수 없음), 일별 자료가 있는 달은 정상 집계', `8월 ${m8 && m8.purchase_amount.toLocaleString()} / 9월 ${m9 && m9.purchase_amount.toLocaleString()} (${m9 && m9.purchase_days}일)`);
  const recon = table(ctx, 'DB_AGG', 'A_RECON').filter(x => x.calc_run_id === st.last_calc_run_id);
  ok(recon.every(x => x.result === '일치'), '대사: 일별+월별 원천 합계 = 집계 합계', recon.filter(x => x.result !== '일치').map(x => x.item + ' ' + x.period).join(', ') || '전 항목 일치');
  const met = table(ctx, 'DB_AGG', 'A_METRIC').filter(m => m.wholesaler_id === '1');
  const t = met.find(m => m.metric === '회전율' && m.category === '전체'), y = met.find(m => m.metric === '구매증감_전년' && m.category === '과일');
  ok(t && t.status === '산출불가' && y && y.status !== '산출불가', '회전율은 산출불가(미수 자료 없음), 구매 증감은 산출', `회전율 ${t && t.reason} / 과일 전년 ${y && y.status}`);
  const p = run(ctx, 'api_performance()').data;
  const w1 = p.rows.find(r => r.wholesaler_id === '1');
  ok(w1 && w1.byCategory['기타'] && w1.byCategory['전체'].amount12 > 0 && w1.turnover === null, '실적관리: 과일·채소·기타·전체 표시, 회수 지표는 비움', `12개월 ${w1 && w1.byCategory['전체'].amount12.toLocaleString()}`);
  const sig = table(ctx, 'DB_WORK', 'T_SIGNAL');
  ok(sig.some(s => s.wholesaler_id === '6' && s.rule_id === 'S06'), '담보현황에서 읽은 보증보험 만기(2026-11-20) → S06 기한 도래 신호', sig.map(s => s.wholesaler_id + ':' + s.rule_id).join(', '));
  // 재적재 멱등
  const nLim = table(ctx, 'DB_MASTER', 'M_LIMIT').length, nCol = table(ctx, 'DB_MASTER', 'M_COLLATERAL').length, nSales = table(ctx, 'DB_RAW', 'R_SALES').length;
  putFile(ctx, rootId, '담보현황_재전송_26.9.16.기준.csv', nhCollateral([{ ws: '1', name: '(가상)갑', item: '과일', close: 24000000, credit: 82000000, max: 166000000, extra: 124000000, sum: 110000000, realty: 60000000, saving: 50000000, hasG: '유', guarantor: '(가상)을 (자녀)', expiryText: '2027-07-29, 없음 (정기예금,APT)', permit: '8/1/2019' }]));
  putFile(ctx, rootId, '낙찰실적_재전송.csv', nhDaily(daily.slice(0, 30)));
  pipeline(ctx);
  ok(table(ctx, 'DB_MASTER', 'M_LIMIT').length === nLim && table(ctx, 'DB_MASTER', 'M_COLLATERAL').length === nCol && table(ctx, 'DB_RAW', 'R_SALES').length === nSales, '같은 내용 재적재: 한도·담보 새 버전 없음, 실적 중복 없음');
  // 한도 변경 파일 → 새 버전, 과거 버전 보존
  putFile(ctx, rootId, '담보현황_26.10.20.기준.csv', nhCollateral([{ ws: '1', name: '(가상)갑', item: '과일', close: 24000000, credit: 70000000, max: 166000000, extra: 124000000, sum: 110000000, realty: 60000000, saving: 50000000, hasG: '유', guarantor: '(가상)을 (자녀)', expiryText: '2027-07-29', permit: '8/1/2019' }]));
  pipeline(ctx);
  const lb = table(ctx, 'DB_MASTER', 'M_LIMIT').filter(l => l.limit_id === 'L1-B');
  ok(lb.length === 2 && lb.find(l => l.version_no === 1).valid_to === '2026-10-19' && lb.find(l => l.version_no === 2).amount === 70000000 && lb.find(l => l.version_no === 2).valid_from === '2026-10-20', '한도가 바뀐 담보현황 → v2 생성, v1 은 전날 종료(과거 재현 가능)', lb.map(l => `v${l.version_no} ${l.amount} ${l.valid_from}~${l.valid_to}`).join(' | '));
}

/* ───── 2. 스냅샷 HTML ───── */
section('스냅샷 HTML 생성 (역할별 분리·개인정보 제외)');
{
  run(ctx, `api_saveUser({ user_id: 'auc1@example.invalid', name: '(가상)경매사A', role: 'AUCTIONEER', status: '사용' }, '테스트'); api_saveUser({ user_id: 'auc2@example.invalid', name: '(가상)경매사B', role: 'AUCTIONEER', status: '사용' }, '테스트');`);
  run(ctx, `setAssignment_(ownerAsUser_(), '1', 'auc1@example.invalid', '2026-01-01', 't'); setAssignment_(ownerAsUser_(), '6', 'auc1@example.invalid', '2026-01-01', 't'); setAssignment_(ownerAsUser_(), '2', 'auc2@example.invalid', '2026-01-01', 't');`);
  const snaps = run(ctx, 'buildSnapshotsNow()');
  ok(snaps.length === 3 && snaps.map(s => s.target).join(',') === '전체,(가상)경매사A,(가상)경매사B', '전체용 1개 + 경매사별 2개 생성', snaps.map(s => s.name + ' ' + Math.round(s.bytes / 1024) + 'KB').join(', '));
  const deployId = ctx.__gas.props.FOLDER_DEPLOY;
  ok(snaps.every(s => ctx.__gas.files.get(s.file_id).parentId === deployId), '40_배포 폴더에 저장');
  const all = ctx.__gas.files.get(snaps[0].file_id).bytes.toString('utf8'), a = ctx.__gas.files.get(snaps[1].file_id).bytes.toString('utf8');
  ok(all.indexOf('(가상)을') < 0 && all.indexOf('(가상)무') < 0 && all.indexOf('GR') < 0 || !/guarantor_ref/.test(all), '보증인 성명·참조가 파일에 없음');
  ok(all.indexOf('"wholesaler_id":"2"') >= 0 && a.indexOf('"wholesaler_id":"2"') < 0 && a.indexOf('"wholesaler_id":"1"') >= 0, '경매사A 파일에는 담당(1, 6)만, 전체 파일에는 모두');
  ok(all.indexOf('<script') >= 0 && all.indexOf('google.script.run') < 0 && all.indexOf('/*DATA*/') < 0, '한 파일에 JS·CSS·데이터 포함, 서버 호출 없음');
  ok(/"ar_available":"아니오"/.test(all), '미수 자료 없음 표시가 스냅샷에도 포함');
  const again = run(ctx, 'buildSnapshotsNow()');
  const live = [...ctx.__gas.files.values()].filter(f => f.parentId === deployId && !f.trashed).length;
  ok(again.length === 3 && live === 3, '같은 날 다시 만들면 덮어쓰기(파일 3개 유지)');
}

/* ───── 3. 동향보고 파일 적재 ───── */
section('동향보고 파일 제출 → 적재 (오프라인 흐름)');
{
  // 담당 경매사A 에게 관리 건을 만든다(수동 개시)
  const oc = run(ctx, `api_openCase('1', '테스트')`); if (!oc.ok) console.log('openCase error:', oc.error); const c = oc.data.caseRow;
  ok(c.auctioneer_id === 'auc1@example.invalid' && c.status === '동향확인중', '관리 건 개시, 담당 경매사 배정');
  const good = { case_id: c.case_id, writer_id: 'auc1@example.invalid', checked_date: '2026-10-28', check_method: '방문', counterpart: '대표', facts: ['(가상) 10월 결제 지연 사유: 거래처 대금 미회수', '(가상) 11/15 결제 약속'], payment_plan: '(가상) 11/15', opinion: '(가상) 일시적', result_class: '채권 검토 필요', recheck_date: '2026-11-30' };
  putFile(ctx, rootId, 'TREND_' + c.case_id + '_20261028.json', J(good));
  putFile(ctx, rootId, 'TREND_' + c.case_id + '_bad.json', J(Object.assign({}, good, { writer_id: 'auc2@example.invalid' })));
  putFile(ctx, rootId, 'TREND_nocase.json', J({ writer_id: 'auc1@example.invalid' }));
  pipeline(ctx);
  const b = table(ctx, 'DB_RAW', 'R_BATCH').filter(x => x.source === 'TREND_JSON');
  ok(b.length === 3 && b.filter(x => x.status === '완료').length === 1, '파일 3개 중 정상 1개만 적재', b.map(x => x.file_name + ':' + x.status).join(' | '));
  ok(b.find(x => /bad/.test(x.file_name)).message.indexOf('담당하지 않는') >= 0, '담당 외 경매사 파일은 거부');
  const tr = table(ctx, 'DB_WORK', 'T_TREND').find(t => t.case_id === c.case_id);
  const c2 = run(ctx, `findCase_(${J(c.case_id)})`);
  ok(tr && tr.status === '제출' && /파일 제출/.test(tr.official_source) && JSON.parse(tr.facts_json).length === 2 && c2.status === '조치진행', '보고서 제출(공식 원본=파일), 관리 건 → 조치진행', `${tr && tr.official_source} / ${c2.status}`);
  ok(table(ctx, 'DB_WORK', 'T_ATTACH').some(a => a.ref_id === tr.report_id && a.locked), '제출 파일은 잠긴 첨부로 보관');
  putFile(ctx, rootId, 'TREND_' + c.case_id + '_20261028_again.json', J(good));
  pipeline(ctx);
  ok(table(ctx, 'DB_WORK', 'T_TREND').filter(t => t.case_id === c.case_id).length === 1, '같은 내용 파일 재제출은 중복 적재되지 않음');
  // 관리 건·보고서가 있는 상태의 스냅샷을 문서 샘플로 저장(가상 자료)
  run(ctx, `api_openCase('6', '테스트2')`);
  const snaps2 = run(ctx, 'buildSnapshotsNow()');
  fs.writeFileSync(path.join(__dirname, '..', 'docs', '샘플_스냅샷_전체.html'), ctx.__gas.files.get(snaps2[0].file_id).bytes.toString('utf8'));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', '샘플_스냅샷_경매사A.html'), ctx.__gas.files.get(snaps2[1].file_id).bytes.toString('utf8'));
  ok(fs.statSync(path.join(__dirname, '..', 'docs', '샘플_스냅샷_전체.html')).size > 20000, '문서용 샘플 스냅샷 저장(가상 자료)');
}

/* ───── 3b. 매뉴얼 폴더 자동 등록 (HWP 파일명 규칙) ───── */
section('매뉴얼 폴더 자동 등록 (실제 파일명 규칙, 내용은 읽지 않음)');
{
  const names = ['(가상)업무방법A_1 목차.hwp', '(가상)업무방법A_1편 총칙(2023.12.29 개정).hwp', '(가상)업무방법A_2편 채권의 임의회수.hwp', '(가상)업무방법A_3편 1장 집행보전조치.hwp',
    '(가상)업무방법A_3편 4장 담보권 실행.hwp', '(가상)업무방법A_4편 부실채권정리업무(2023.12.29 개정).hwp', '(가상)업무방법B_1_총목차(2022.12.29 개정).hwp',
    '(가상)업무방법B_2편_2장_담보취득(2023.12.29 개정).hwp', '(가상)업무방법B_2편_3장_담보물_감정평가(2022.12.29 개정).hwp', '(가상)업무방법B_3편_2장_여신관리(2022.12.29 개정).hwp',
    '(가상)업무방법B_3편_3장_부실위험조사_및_대책(2022.12.29 개정).hwp', '메모.txt'];
  const fid = run(ctx, `(function(){ var f = DriveApp.getFolderById(${J(rootId)}).createFolder('기초 자료'); return f.getId(); })()`);
  names.forEach(n => vm.runInContext(`DriveApp.getFolderById(${J(fid)}).createFile(${J(n)}, '(가상 HWP 자리) ' + ${J(n)}, 'application/haansofthwp')`, ctx));
  const r = run(ctx, `registerManuals('기초 자료')`);
  const docs = table(ctx, 'DB_MASTER', 'M_DOC'), vers = table(ctx, 'DB_MASTER', 'M_DOC_VER');
  ok(r.files.length === 12 && docs.length === 12 && vers.length === 12, '폴더의 문서 12개 → 문서·버전 등록', r.message.split('\n')[0]);
  const v = vers.find(x => docs.find(d => d.doc_id === x.doc_id).doc_name === '(가상)업무방법B_3편_2장_여신관리');
  ok(v && v.version === 'v2022.12.29' && v.effective_from === '2022-12-29', '"(2022.12.29 개정)" → 버전·시행일', `${v && v.version} 시행 ${v && v.effective_from}`);
  const nd = vers.find(x => docs.find(d => d.doc_id === x.doc_id).doc_name === '(가상)업무방법A_2편 채권의 임의회수');
  ok(nd && /시행일 미확인/.test(nd.note) && r.message.indexOf('시행일 미확인') >= 0, '개정일이 없는 파일은 시행일 미확인으로 표시', nd && nd.note);
  const r2 = run(ctx, `registerManuals('기초 자료')`);
  ok(table(ctx, 'DB_MASTER', 'M_DOC_VER').length === 12 && /건너뜀 12/.test(r2.message), '다시 실행해도 중복 등록 없음');
  const sits = table(ctx, 'DB_MASTER', 'M_SITUATION');
  const s30 = sits.find(x => x.situation_code === 'SIT-OVD-30'), sexp = sits.find(x => x.situation_code === 'SIT-COLL-EXPIRY');
  ok(sits.length === 9 && /doc:/.test(s30.note) && /doc:/.test(sexp.note), '상황 코드 9개 생성, 편·장 제목 키워드로 근거 후보 문서 연결');
  const p30 = run(ctx, `proceduresFor_('SIT-OVD-30', todayStr_())`);
  ok(p30.status === '확인 필요' && p30.steps.length === 0 && p30.candidates.length >= 2 && p30.candidates.some(c => /임의회수|집행보전/.test(c.doc_name)) && /절차를 임의로 만들지 않습니다/.test(p30.message), '절차는 만들지 않고(확인 필요) 근거 후보만 제시', p30.candidates.map(c => c.doc_name).join(' / '));
  ok(!JSON.stringify(run(ctx, `api_askManual('연체 30일', '')`).data.procedures).includes('"content"') || run(ctx, `api_askManual('연체 30일', '')`).data.status === '확인 필요', '매뉴얼 질의도 조항 미등록 상태에서는 확인 필요로 답함');
  const reg = run(ctx, `api_registerProcedure({ situation_code: 'SIT-OVD-30', step_no: 1, content: '(가상) 담당자가 입력한 절차', doc_id: ${J(v.doc_id)}, doc_version: 'v2022.12.29', article: '제12조', page: '34' }, '담당자 입력')`);
  const p30b = run(ctx, `proceduresFor_('SIT-OVD-30', todayStr_())`);
  ok(reg.ok && p30b.status === '정상' && p30b.steps[0].doc_name === '(가상)업무방법B_3편_2장_여신관리' && p30b.candidates.length === 0, '담당자가 조항·쪽수를 등록하면 정상 절차로 전환');
}

/* ───── 3c. 주간 요약·체크리스트 ───── */
section('주간 요약 화면·이상징후 체크리스트·주간 스냅샷 주기');
{
  const sm = run(ctx, 'api_summary()').data;
  ok(sm.kpis && sm.flagged.length >= 1 && sm.matrix.quadrants && sm.guides.length === 9 && sm.checklists.length >= 1 && sm.checklistItems.length === 10, '요약: 징후·동향·조치 3영역 + 4분면 + 조치 안내 + 체크리스트 자료', `징후 ${sm.flagged.length}명, 대기 ${sm.trendWait.length}, 조치 ${sm.openActions.length}`);
  const f6 = sm.flagged.find(x => x.wholesaler_id === '6');
  ok(f6 && f6.signals.some(s => s.rule_id === 'S06') && f6.guides.some(g => g.situation_code === 'SIT-COLL-EXPIRY'), '징후 행에 해당 상황의 조치 안내(확인 필요 또는 1줄+조항)가 붙음', f6 && f6.guides.map(g => g.label + ':' + g.status).join(', '));
  const ckCase = sm.checklists[0];
  const items = ckCase.items;
  ok(items.length === 10 && items.every(i => i.is_assumed) && items.some(i => i.category === '인력'), '체크리스트 10개 항목(인력·결제·거래·현장·대표자·신용·자금·관계), 모두 "가정" 표시');
  const answers = {}; items.forEach(i => { answers[i.item_id] = '아니오'; }); answers[items[0].item_id] = '예'; answers[items[1].item_id] = '예'; answers[items[9].item_id] = '미확인';
  const bad = run(ctx, `api_saveChecklist({ case_id: ${J(ckCase.case_id)}, checked_date: '2026-10-28', answers: ${J(answers)}, recheck_date: '2026-11-30' })`);
  ok(!bad.ok && /결과 분류/.test(bad.error), '결과 분류 없이 저장 → 거부(담당자 판단 필수)');
  const sv = run(ctx, `api_saveChecklist({ case_id: ${J(ckCase.case_id)}, checked_date: '2026-10-28', checker_name: '(가상)경매사A', by_paper: true, answers: ${J(answers)}, remarks: { ${J(items[1].item_id)}: '(가상) 11/15 결제 약속' }, result_class: '채권 검토 필요', recheck_date: '2026-11-30' })`);
  ok(sv.ok && sv.data.score.yes === 4 && sv.data.score.level === '높음', '가중 점수(인력 2 + 결제 2 = 4) → 제안 "높음"(가정값 4 이상)', JSON.stringify(sv.data.score));
  const tr = table(ctx, 'DB_WORK', 'T_TREND').find(t => t.report_id === sv.data.report.report_id);
  const facts = JSON.parse(tr.facts_json);
  ok(tr.check_method === '현장 체크리스트(서면)' && facts.length === 2 && facts.every(f => /→ 예/.test(f.text)) && tr.further_checks.indexOf(items[9].text) >= 0 && /서면 체크리스트/.test(tr.official_source), '"예" 항목만 확인된 사실로, "미확인"은 추가 확인사항으로 기록', facts[0].text.substring(0, 50));
  ok(run(ctx, `findCase_(${J(ckCase.case_id)})`).status === '조치진행', '결과 "채권 검토 필요" → 관리 건 조치진행');
  // 서면 스캔 파일 첨부
  vm.runInContext(`DriveApp.getFolderById(${J(rootId)}).createFile('CHECK_${ckCase.case_id}_20261028.pdf', '%PDF-(가상)', 'application/pdf')`, ctx);
  vm.runInContext(`DriveApp.getFolderById(${J(rootId)}).createFile('CHECK_C-2099-0001_20261028.pdf', '%PDF-(가상)', 'application/pdf')`, ctx);
  pipeline(ctx);
  const cb = table(ctx, 'DB_RAW', 'R_BATCH').filter(b => b.source === 'CHECK_SCAN');
  ok(cb.length === 2 && cb.filter(b => b.status === '완료').length === 1 && table(ctx, 'DB_WORK', 'T_ATTACH').some(a => a.case_id === ckCase.case_id && /체크리스트\(서면\)/.test(a.file_name) && a.locked), '서면 스캔(CHECK_*.pdf) → 관리 건 증빙 첨부(잠금), 없는 관리 건은 오류', cb.map(b => b.status).join(','));
  // 주간 생성 주기
  const due = run(ctx, `[snapshotDueToday_({ SNAPSHOT_FREQ: '주간', SNAPSHOT_WEEKDAY: '3' }, '정기'), snapshotDueToday_({ SNAPSHOT_FREQ: '주간', SNAPSHOT_WEEKDAY: '3' }, '수동'), snapshotDueToday_({ SNAPSHOT_FREQ: '일간', SNAPSHOT_WEEKDAY: '1' }, '정기'), dowOf_(todayStr_())]`);
  ok(due[0] === true && due[1] === true && due[2] === true, '주간 모드: 지정 요일(수요일=오늘)·수동 실행·일간 모드에서 생성', `오늘 요일 ${due[3]}`);
  ok(run(ctx, `snapshotDueToday_({ SNAPSHOT_FREQ: '주간', SNAPSHOT_WEEKDAY: '1' }, '정기')`) === false, '주간 모드: 다른 요일의 정기 처리에서는 생성하지 않음');
}

/* ───── 3d. 월별 사업실적 파일만 있는 운영 (일별·미수 자료 없음) ───── */
section('월별 사업실적 파일만으로 운영 (실제 추출 파일 열 배치: 2024-01 ~ 마감 월)');
{
  const c2 = boot();
  run(c2, `(function(){ var f = DriveApp.createFolder('2611_AI혁신센터_채권관리'); __root = f.getId(); })()`);
  const root2 = run(c2, '__root');
  run(c2, `setupWithFolder('2611_AI혁신센터_채권관리')`);
  // 중도매인 6명: 전년 동월 대비 급감 2명(−60%, −45%), 완만 감소 1명, 증가 2명, 2026-08 거래 없음 1명
  const prof = [['1', '(가상)갑', 1.0], ['2', '(가상)을', 1.0], ['3', '(가상)병', 1.0], ['4', '(가상)정', 1.0], ['5', '(가상)무', 1.0], ['6', '(가상)기', 1.0]];
  const factor = (ws, ym) => {
    if (ym < '2026-06') return 1.0;
    if (ws === '1') return 0.4; if (ws === '2') return 0.55; if (ws === '3') return 0.85; if (ws === '4') return 1.3; if (ws === '5') return 1.1;
    return ym >= '2026-08' ? 0 : 1.0;   // 6번: 2026-08 거래 없음
  };
  const mrows = [];
  for (let ym = '2024-01'; ym <= '2026-08'; ym = run(c2, `addMonths_('${ym}', 1)`)) prof.forEach(w => { const f = factor(w[0], ym); if (f > 0) mrows.push([ym, w[0], w[1], 1000, Math.round(30000000 * f)]); });
  putFile(c2, root2, '2024년~2026년8월_공판장거래인_사업실적.xlsx의 사본.csv', nhMonthly(mrows));
  const r2 = pipeline(c2);
  const st2 = run(c2, 'readStatus_()');
  ok(r2.status === '완료', '정기 처리가 스냅샷까지 완료(기준일 없음으로 멈추지 않음)', r2.status);
  ok(st2.latest_base_date === '2026-08-31' && st2.data_start === '2024-01-01' && st2.ar_available === '아니오', '기준일 = 최신 기표년월 말일, 자료 시작 = 첫 달 1일, 미수 자료 없음 표시', `${st2.latest_base_date} / ${st2.data_start} / ${st2.ar_available}`);
  const met2 = table(c2, 'DB_AGG', 'A_METRIC').filter(m => m.category === '전체');
  const yoy = (ws) => met2.find(m => m.wholesaler_id === ws && m.metric === '구매증감_전년');
  const m3 = (ws) => met2.find(m => m.wholesaler_id === ws && m.metric === '구매증감_3개월');
  const mk = (ws) => met2.find(m => m.wholesaler_id === ws && m.metric === '구매증감_시장대비');
  ok(yoy('1') && yoy('1').status === '정상' && Math.abs(Number(yoy('1').value) - (-0.6)) < 1e-6 && /월 합계/.test(yoy('1').method), '전년 동월 비교 = 월 합계 대 월 합계(일별 자료 없음)', yoy('1') ? `${(Number(yoy('1').value) * 100).toFixed(1)}% · ${yoy('1').method}` : '지표 없음');
  ok(m3('1') && m3('1').status === '정상' && /월평균/.test(m3('1').method), '직전 3개월 비교 = 당월 합계 ÷ 직전 3개월 월평균', m3('1') ? `${(Number(m3('1').value) * 100).toFixed(1)}% · ${m3('1').method}` : '지표 없음');
  ok(mk('1') && mk('1').status === '정상' && Number(mk('1').value) < -0.2, '부류 전체(시장) 대비 증감 산출', mk('1') ? `${(Number(mk('1').value) * 100).toFixed(1)}%p` : '지표 없음');
  const sig2 = table(c2, 'DB_WORK', 'T_SIGNAL');
  ok(sig2.some(s => s.wholesaler_id === '1' && s.rule_id === 'S04') && !sig2.some(s => s.wholesaler_id === '3' && s.rule_id === 'S04'), 'S04 구매 급감 신호: 3중 조건 충족한 중도매인만(−60%·3개월·시장 대비)', sig2.map(s => s.wholesaler_id + ':' + s.rule_id).join(', ') || '신호 없음');
  const sum2 = run(c2, 'api_summary()').data;
  const gr = sum2.matrix.growthRank;
  ok(sum2.matrix.points.length === 0 && gr && gr.points.length === 5 && gr.points[0].wholesaler_id === '1' && gr.idle.length === 1 && gr.idle[0].wholesaler_id === '6', '회전율 없음 → 4분면 대신 전년 동월 대비 증감 순위(거래 없는 중도매인은 따로)', gr ? `순위 ${gr.points.map(p => p.wholesaler_id + ' ' + p.x.toFixed(0) + '%').join(', ')} / 거래 없음 ${gr.idle.map(p => p.wholesaler_id).join(',')}` : '순위 없음');
  const html2 = run(c2, `(function(){ var f = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_DEPLOY')); var it = f.getFiles(); while (it.hasNext()) { var x = it.next(); if (/전체/.test(x.getName())) return x.getBlob().getDataAsString('UTF-8'); } return ''; })()`);
  ok(html2.indexOf('growthRank') >= 0 && html2.indexOf('(가상)갑') >= 0, '스냅샷 HTML 에 증감 순위 자료 포함');
}

/* ───── 3e. 한 파일 설치본(dist/apps-script/Code.gs)만으로 동작 ───── */
section('Apps Script 한 파일 설치본: Code.gs 하나로 시작 함수·웹앱 화면·스냅샷');
{
  const built = require('../tools/build_bundle.js').build();
  const bundle = fs.readFileSync(built.code, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(built.manifest, 'utf8'));
  ok(!/Install\.gs|installFiles_/.test(bundle) && /var START_ROOT_FOLDER = /.test(bundle.slice(0, 4000)), '설치본: 설치기 제외, 폴더 이름 설정이 파일 첫 화면에 있음', Math.round(built.bytes / 1024) + 'KB · ' + built.lines + '줄');
  ok(!manifest.oauthScopes.some(x => /script\.projects|external_request/.test(x)) && manifest.dependencies.enabledAdvancedServices[0].serviceId === 'drive', '설치본 권한: Apps Script API·외부 호출 권한 없음, 엑셀 변환용 Drive 서비스 포함', manifest.oauthScopes.length + '개 권한');
  const gas3 = createGas({ ownerEmail: OWNER, gasDir: '/nonexistent' });   // 별도 HTML 파일이 없어도 동작해야 한다
  const c3 = vm.createContext(Object.assign({ Date: FrozenDate }, gas3.globals));
  vm.runInContext(bundle, c3, { filename: 'Code.gs' });
  c3.__gas = gas3;
  gas3.state.resolveInclude = (n) => vm.runInContext('include_(' + J(n) + ')', c3);
  run(c3, `(function(){ var f = DriveApp.createFolder('2611_AI혁신센터_채권관리'); __root = f.getId(); })()`);
  const root3 = run(c3, '__root');
  const mrows3 = [];
  for (let ym = '2024-01'; ym <= '2026-08'; ym = run(c3, `addMonths_('${ym}', 1)`)) [['1', '(가상)갑', 1], ['2', '(가상)을', ym >= '2026-06' ? 0.5 : 1]].forEach(w => mrows3.push([ym, w[0], w[1], 1000, Math.round(20000000 * w[2])]));
  putFile(c3, root3, '2024년~2026년8월_공판장거래인_사업실적.xlsx의 사본.csv', nhMonthly(mrows3));
  const log3 = run(c3, 'startHere()');
  ok(log3.some(l => /^✔ 1\. 기초자료 폴더 연결/.test(l)) && log3.some(l => /^✔ 3\. .*: 완료/.test(l)) && log3.some(l => /^✔ 5\. 주간 스냅샷/.test(l)) && log3.some(l => /^✔ 4\. 정기 실행 예약/.test(l)), 'startHere 한 번: 폴더 연결 → 엑셀 처리 → 정기 실행 예약 → 스냅샷', log3.filter(l => /^[✔✖–]/.test(l)).map(l => l.slice(0, 2) + l.slice(2, 14)).join(' / '));
  ok(log3.some(l => /^✖ 2\. 업무매뉴얼/.test(l)) && log3.some(l => /새 배포/.test(l)), '매뉴얼 폴더가 없어도 멈추지 않고 표시만, 마지막에 배포 안내', log3.find(l => /2\. 업무매뉴얼/.test(l)));
  const page = run(c3, 'doGet()');
  const html3 = page.getContent();
  ok(page.getTitle() === run(c3, 'APP.NAME') && html3.indexOf('<?') < 0 && /function pageHome|SummaryView/.test(html3) && html3.length > 100000, '웹앱 화면(doGet): 내장 HTML 로 완성된 페이지(제목·스타일·화면 코드 포함)', Math.round(html3.length / 1024) + 'KB · 제목 ' + page.getTitle());
  const snap3 = run(c3, `(function(){ var f = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_DEPLOY')); var it = f.getFiles(), o=[]; while (it.hasNext()) { var x = it.next(); o.push(x.getBlob().getDataAsString('UTF-8')); } return o; })()`);
  ok(snap3.length >= 1 && snap3[0].indexOf('<!--STYLES-->') < 0 && snap3[0].indexOf('(가상)갑') >= 0, '스냅샷 HTML 도 내장 화면으로 생성', snap3.length + '개');
  const again = run(c3, 'startHere()');
  ok(again.some(l => /^✔ 3\. .*: 완료/.test(l)) && table(c3, 'DB_RAW', 'R_SALES_MONTHLY').length === mrows3.length, 'startHere 를 다시 실행해도 자료 중복 없음', table(c3, 'DB_RAW', 'R_SALES_MONTHLY').length + '행');
  const wrong = boot(); run(wrong, `(function(){ setProp_('X','1'); })()`);
  vm.runInContext("START_ROOT_FOLDER = '없는폴더'", wrong);
  let err = ''; try { run(wrong, 'startHere()'); } catch (e) { err = e.message; }
  ok(/START_ROOT_FOLDER/.test(err), '폴더 이름이 틀리면 고칠 곳을 알려 주고 멈춤', err.slice(0, 60));
}

/* ───── 4. 가상 데이터(미수 포함) 환경에서도 회귀 없음 ───── */
section('가상 데이터(미수 자료 포함) 환경 회귀');
{
  const c2 = boot();
  run(c2, 'setupSystem()');
  run(c2, `loadVirtualData_({ startDate: '2024-10-01', endDate: '2026-10-27', seed: 20261027 })`);
  const r = pipeline(c2);
  const st = run(c2, 'readStatus_()');
  ok(r.status === '완료' && st.ar_available === '예' && st.data_status === '정상' && Number(st.snapshot_files) === 4, '정기 처리 + 스냅샷(전체 + 경매사 3) 완료', `스냅샷 ${st.snapshot_files}개`);
  ok(table(c2, 'DB_AGG', 'A_RECON').filter(x => x.calc_run_id === st.last_calc_run_id).every(x => x.result === '일치'), '대사 일치 유지');
}

console.log('중도매인 통합관리 하이브리드 배포 검증 (모의 Apps Script, 가상 자료, 기준일 2026-10-28)');
console.log(out.join('\n'));
console.log(`\n합계: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
