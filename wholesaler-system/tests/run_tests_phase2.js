/**
 * run_tests_phase2.js — 2단계 검증 (node tests/run_tests_phase2.js)
 * 시나리오 1(신호→동향→조치→종결), 2(계절 감소 비판정), 4 확장(신호·관리 건 중복 없음), 5(부류별 회전율 미생성),
 * 6(근거 없으면 절차 미생성·충돌 표시), 7 확장(업무 권한), 8 확장(판단 근거 스냅샷)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas_mock');
const GAS = path.join(__dirname, '..', 'gas');
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs',
  'Master.gs', 'Metrics.gs', 'Signals.gs', 'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs', 'NhImport.gs', 'Snapshot.gs'];
const OWNER = 'owner@example.invalid', START = '2024-10-01', END = '2026-10-27';
const FROZEN = new Date('2026-10-28T09:00:00+09:00').getTime();
let tick = 0;
const REAL0 = Date.now();
// '오늘'은 고정하되 경과 시간은 실제로 흐르게 한다(실행시간 예산 검사용)
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
const J = (o) => JSON.stringify(o);

const ctx = boot();
run(ctx, 'setupSystem()');
run(ctx, `loadVirtualData_({ startDate: '${START}', endDate: '${END}', seed: 20261027 })`);
const pipe = pipeline(ctx);

section('지표·신호 판정');
{
  ok(pipe.status === '완료', '정기 처리(가져오기→집계→지표·신호) 완료');
  const st = run(ctx, 'readStatus_()');
  ok(st.signal_base_date === END && Number(st.signals_open) > 0, '신호 판정 기준일 = 최신 기준일, 활성 신호 존재', `${st.signals_open}건`);
  const met = table(ctx, 'DB_AGG', 'A_METRIC');
  const w123 = met.filter(m => m.wholesaler_id === 'W0123');
  const t = w123.find(m => m.metric === '회전율' && m.category === '전체'), tp = w123.find(m => m.metric === '회전율_직전' && m.category === '전체');
  ok(t && tp && t.status === '정상' && t.value < tp.value, '(가상) W0123 최근 3개월 회전율 < 직전 3개월', `${tp.value.toFixed(2)} → ${t.value.toFixed(2)} (${t.period_from}~${t.period_to}, ${t.method})`);
  ok(w123.find(m => m.metric === '회수일수' && m.category === '전체').value > 0, '회수일수 = 기간일수 ÷ 회전율');
  const lu = w123.find(m => m.metric === '한도사용률');
  ok(lu && lu.status === '산출불가' && /LIMIT_COMBINE/.test(lu.reason), '한도 사용률: 결합 방식 미확인(가정) → 산출불가, S05 자동 생성 안 함', lu.reason);
  const sig = table(ctx, 'DB_WORK', 'T_SIGNAL');
  const s123 = sig.filter(s => s.wholesaler_id === 'W0123').map(s => s.rule_id).sort();
  ok(s123.indexOf('S01') >= 0 && s123.indexOf('S03') >= 0 && s123.indexOf('S07') >= 0, '(가상) W0123: 회전율 저하 + 연체 → 복수 징후', s123.join(','));
  const s01 = sig.find(s => s.wholesaler_id === 'W0123' && s.rule_id === 'S01');
  const ev = JSON.parse(s01.evidence_json), pr = JSON.parse(s01.params_json);
  ok(ev.dropPct >= 30 && ev.collectionDays >= 20 && pr.S01_DROP_PCT === '30', '신호에 근거 수치와 판정 시점 기준값이 함께 저장됨', `하락 ${ev.dropPct}%, 회수일수 ${ev.collectionDays}일, 기준 ${pr.S01_DROP_PCT}%`);
  ok(!sig.some(s => s.rule_id === 'S05'), '한도 사용률 신호(S05)는 규정 확인 전까지 생성되지 않음');
  const newWs = sig.filter(s => s.wholesaler_id === 'W0310' && s.rule_id === 'S04').length;
  ok(newWs === 0, '신규 중도매인(W0310)은 구매 급감 신호 제외');
  const closed = sig.filter(s => s.wholesaler_id === 'W0405' && s.rule_id === 'S04').length;
  ok(closed === 0, '휴업 중도매인(W0405)은 구매 급감 신호 제외');
}

section('시나리오 2. 계절적 구매 감소만 있는 대상이 자동으로 부실 판정되지 않는다');
{
  const sig = table(ctx, 'DB_WORK', 'T_SIGNAL').filter(s => s.wholesaler_id === 'W0207');
  const met = table(ctx, 'DB_AGG', 'A_METRIC').filter(m => m.wholesaler_id === 'W0207' && m.category === '과일');
  const y = met.find(m => m.metric === '구매증감_전년'), m3 = met.find(m => m.metric === '구매증감_3개월'), mk = met.find(m => m.metric === '구매증감_시장대비');
  ok(!sig.some(s => s.rule_id === 'S04'), '(가상) W0207 사계과일: 구매 급감 신호 없음', `전년 ${y && y.status === '정상' ? (y.value * 100).toFixed(1) + '%' : y.reason}, 3개월 ${m3 && m3.status === '정상' ? (m3.value * 100).toFixed(1) + '%' : m3.reason}, 시장 대비 ${mk && mk.status === '정상' ? (mk.value * 100).toFixed(1) + '%p' : mk.reason}`);
  // 직전 3개월(7~9월) 대비 10월은 계절상 증가. 7월 기준으로 재판정해도 전년 동월 대비는 급감 아님 → 설계 의도 확인: 전년 조건이 계절성을 걸러낸다
  const r = run(ctx, `api_simulateSettings({ S04_YOY_PCT: '0', S04_MA3_PCT: '0', S04_MARKET_GAP_PP: '0' })`);
  ok(r.ok && r.data.total === 20, '기준값 시뮬레이션은 저장하지 않고 신호 건수만 계산', J(r.data.counts));
  ok(table(ctx, 'DB_MASTER', 'M_SETTING').find(s => s.key === 'S04_YOY_PCT').value === '-40', '시뮬레이션 후 저장된 기준값 불변');
}

section('시나리오 5. 부류별 채권 배분이 불가능하면 부류별 회전율을 만들지 않는다');
{
  const met = table(ctx, 'DB_AGG', 'A_METRIC');
  const catTurn = met.filter(m => m.metric === '회전율' && (m.category === '과일' || m.category === '채소'));
  const marker = met.filter(m => m.metric === '회전율' && m.category === '부류별');
  ok(catTurn.length === 0, '과일·채소 회전율 행 없음(전체만 산출)');
  ok(marker.length > 0 && marker[0].status === '미산출' && /배분 근거/.test(marker[0].reason), '부류별 회전율은 "미산출" 사유 행으로 명시', marker[0] && marker[0].reason);
  const w = run(ctx, 'api_wsWork("W0123")').data;
  ok(w.metrics.filter(m => m.metric === '회전율' && m.status === '정상').every(m => m.category === '전체'), '통합 상세 지표에도 전체 기준 회전율만 전달');
}

section('시나리오 1. 회전율 저하 신호 → 동향 확인 → 조치 → 승인 → 종결 → 재점검');
let caseId;
{
  const cases = table(ctx, 'DB_WORK', 'T_CASE');
  const c = cases.find(x => x.wholesaler_id === 'W0123');
  caseId = c && c.case_id;
  ok(c && c.status === '동향확인중' && c.auctioneer_id === 'auctioneer1@example.invalid' && c.trend_due > END, '신호로 관리 건 자동 생성, 담당 경매사 배정, 동향 확인 기한(3경매일) 설정', `${caseId} 기한 ${c && c.trend_due}`);
  ok(cases.filter(x => x.wholesaler_id === 'W0123').length === 1, '중도매인당 열린 관리 건 1개');
  const a1 = 'auctioneer1@example.invalid', a2 = 'auctioneer2@example.invalid', cr = 'credit1@example.invalid', ad = 'admin2@example.invalid', vw = 'viewer1@example.invalid';
  const home = as(ctx, a1, 'api_home()').data.work;
  ok(home.trendWait.some(x => x.case_id === caseId) && home.newSignals.some(x => x.case_id === caseId), '경매사 홈: 신규 신호·동향 확인 대기에 표시', `신규 ${home.newSignals.length}, 대기 ${home.trendWait.length}`);
  ok(home.trendWait.every(x => x.wholesaler_id !== 'W0207'), '경매사1 홈에는 담당 외(W0207) 관리 건 없음');
  const det = as(ctx, a1, `api_caseDetail(${J(caseId)})`).data;
  ok(det.signals.length >= 2 && det.signals[0].evidence && det.guide.basis.data_base_date === END, '관리 건 상세: 신호 근거 수치, 데이터 기준일·매뉴얼 버전 표시', det.guide.basis.manual_versions.join(' / '));
  // 권한
  ok(!as(ctx, a2, `api_caseDetail(${J(caseId)})`).ok, '담당 외 경매사 → 관리 건 조회 거부');
  ok(!as(ctx, a2, `api_saveTrend({ case_id: ${J(caseId)} }, false)`).ok, '담당 외 경매사 → 동향보고 저장 거부');
  ok(!as(ctx, vw, `api_createAction({ case_id: ${J(caseId)}, action_type: '결제 독려', content: 'x', due_date: '2026-11-05' })`).ok, '조회자 → 조치 등록 거부');
  ok(!as(ctx, a1, `api_createAction({ case_id: ${J(caseId)}, action_type: '결제 독려', content: 'x', due_date: '2026-11-05' })`).ok, '경매사 → 조치 등록 거부(채권 영역)');
  // 동향보고: 사실 없이 제출 → 거부
  const bad = as(ctx, a1, `api_saveTrend({ case_id: ${J(caseId)}, checked_date: '2026-10-28', check_method: '방문', result_class: '채권 검토 필요', recheck_date: '2026-11-30', facts: [] }, true)`);
  ok(!bad.ok && /사실/.test(bad.error), '확인된 사실 없이 제출 → 거부(사실·의견 분리)', bad.error);
  const draft = as(ctx, a1, `api_saveTrend({ case_id: ${J(caseId)}, checked_date: '2026-10-28', check_method: '방문', facts: ['(가상) 10월 중순 거래처 대금 회수 지연으로 결제 늦어짐'] }, false)`);
  ok(draft.ok && draft.data.status === '임시', '임시 저장');
  const forms = as(ctx, a1, `[api_trendFormText(${J(caseId)}, false).data, api_trendFormText(${J(caseId)}, true).data]`);
  ok(forms[0].text.indexOf('W0123') < 0 && forms[1].text.indexOf('(가상)한빛청과') >= 0 && /공식 원본은 시스템 입력/.test(forms[1].text), '동향 빈 양식·기본정보 채운 양식 제공, 공식 원본 안내');
  const sub = as(ctx, a1, `api_saveTrend({ report_id: ${J(draft.data.report_id)}, case_id: ${J(caseId)}, checked_date: '2026-10-28', check_method: '방문', counterpart: '대표', facts: ['(가상) 10월 중순 거래처 대금 회수 지연으로 결제 늦어짐', '(가상) 11월 10일까지 연체분 결제 약속'], business_status: '(가상) 영업 정상', payment_plan: '(가상) 11/10 3,900만원', opinion: '(가상) 일시적으로 보이나 결제 이행 확인 필요', result_class: '채권 검토 필요', recheck_date: '2026-11-30', further_checks: '결제 이행 여부' }, true)`);
  ok(sub.ok && sub.data.status === '제출' && sub.data.version === 1, '동향보고 제출(v1)');
  let c2 = run(ctx, `findCase_(${J(caseId)})`);
  ok(c2.status === '조치진행' && c2.result_class === '채권 검토 필요' && c2.action_due > '2026-10-28', '결과 "채권 검토 필요" → 조치진행, 조치 기한 설정', `${c2.status} / 기한 ${c2.action_due}`);
  const crHome = as(ctx, cr, 'api_home()').data.work;
  ok(crHome.actionWait.some(x => x.case_id === caseId), '채권담당 홈: 채권 조치 대기에 표시');
  // 절차 안내
  const g = as(ctx, cr, `api_caseDetail(${J(caseId)})`).data.guide;
  const ovd = g.procedures.find(p => p.situation_code === 'SIT-OVD-NEW');
  ok(ovd && ovd.status === '정상' && ovd.steps.length === 3 && ovd.steps[0].article && ovd.steps[0].page && ovd.steps[0].forms[0].form_doc_id === 'FORM-PAYPLAN', '상황 "연체 발생(채권 검토 필요)": 절차 3단계·조항·쪽수·서식 연결', ovd && `${ovd.steps[0].doc_name} ${ovd.steps[0].version} ${ovd.steps[0].article} p.${ovd.steps[0].page}`);
  ok(g.facts.length >= 3 && g.nextSteps.length === 1, '안내 형식: 확인된 상황 → 추가 확인 → 절차 → 근거 → 서식 → 다음 할 일', g.nextSteps[0]);
  // 서식 작성본
  const dr = as(ctx, cr, `api_createDraftForm(${J(caseId)}, 'FORM-PAYPLAN')`);
  const drFile = ctx.__gas.files.get(dr.data.attach.file_id);
  const txt = drFile.bytes.toString('utf8');
  ok(dr.ok && dr.data.filled === 'text' && txt.indexOf('(가상)한빛청과') >= 0 && txt.indexOf('{{') < 0 && txt.indexOf(END) >= 0, '작성본: 기본정보·기준일 자동 입력, 관리 건 폴더 저장', dr.data.attach.file_name);
  const orig = ctx.__gas.files.get(table(ctx, 'DB_MASTER', 'M_DOC_VER').find(v => v.doc_id === 'FORM-PAYPLAN').file_id);
  ok(orig.bytes.toString('utf8').indexOf('{{상호}}') >= 0 && drFile.parentId !== orig.parentId, '원본 서식은 변경되지 않음(복사본만 생성)');
  ok(table(ctx, 'DB_LOG', 'L_ACCESS').some(x => x.action === 'form.draft'), '서식 생성이 접근 기록에 남음');
  // 조치
  const act = as(ctx, cr, `api_createAction({ case_id: ${J(caseId)}, action_type: '한도 조정 요청', content: '(가상) 결제 이행 시까지 기본한도 20% 감액 요청', due_date: '2026-11-05', situation_code: 'SIT-OVD-NEW' })`);
  ok(act.ok && act.data.needs_approval === true && act.data.approval_status === '미요청', '한도 조정 요청 조치 등록 → 승인 필요');
  const done0 = as(ctx, cr, `api_completeAction(${J(act.data.action_id)}, '임의 완료', '')`);
  ok(!done0.ok && /승인/.test(done0.error), '승인 전 결과 등록 거부');
  const req = as(ctx, cr, `api_requestApproval(${J(act.data.action_id)})`);
  ok(req.ok && req.data.basis.basis_snapshot_id, '승인 요청 시 판단 근거 스냅샷 생성');
  c2 = run(ctx, `findCase_(${J(caseId)})`);
  ok(c2.status === '승인대기', '관리 건 상태 → 승인대기');
  ok(!as(ctx, cr, `api_decideApproval(${J(req.data.approval.approval_id)}, '승인', '')`).ok, '채권담당(요청자) → 승인 거부(권한·본인)');
  const pend = as(ctx, ad, 'api_pendingApprovals()').data;
  ok(pend.length === 1 && pend[0].canDecide, '관리자 승인 대기 목록 1건');
  const dec = as(ctx, ad, `api_decideApproval(${J(req.data.approval.approval_id)}, '승인', '(가상) 승인')`);
  ok(dec.ok && dec.data.action.approval_status === '승인' && run(ctx, `findCase_(${J(caseId)})`).status === '조치진행', '관리자 승인 → 조치진행 복귀');
  const fin = as(ctx, cr, `api_uploadFinal(${J(caseId)}, { file_name: '결제계획확인서_서명.pdf', base64: ${J(Buffer.from('%PDF-가상').toString('base64'))}, kind: '제출본', ref_type: 'ACTION', ref_id: ${J(act.data.action_id)}, form_doc_id: 'FORM-PAYPLAN', form_version: 'v3' })`);
  ok(fin.ok && fin.data.locked === true && fin.data.kind === '제출본', '제출본 업로드 → 잠금');
  const done = as(ctx, cr, `api_completeAction(${J(act.data.action_id)}, '(가상) 11/1 한도 감액 반영, 결제계획 접수', '2026-11-01')`);
  ok(done.ok && done.data.status === '완료', '조치 결과 등록');
  const closeBad = as(ctx, cr, `api_closeCase(${J(caseId)}, '조치 완료', '2026-10-01', '')`);
  ok(!closeBad.ok, '재점검일이 과거이면 종결 거부');
  const close = as(ctx, cr, `api_closeCase(${J(caseId)}, '조치 완료', '2026-11-30', '(가상) 결제계획 접수·한도 감액')`);
  ok(close.ok && close.data.status === '재점검대기' && close.data.basis_snapshot_id, '종결 → 재점검대기, 근거 스냅샷 고정', `재점검일 ${close.data.recheck_date}`);
  const detail = as(ctx, cr, `api_caseDetail(${J(caseId)})`).data;
  const kinds = detail.attachments.map(a => a.kind).sort().join(',');
  ok(detail.history.map(h => h.to_status).join('>') === '동향확인중>조치진행>승인대기>조치진행>재점검대기', '타임라인: 상태 전환 이력 순서', detail.history.map(h => h.to_status).join(' > '));
  ok(kinds === '작성본,제출본', '첨부 구분: 작성본·제출본', kinds);
  const rc = as(ctx, cr, `api_recheckCase(${J(caseId)}, '(가상) 재점검')`);
  ok(rc.ok && rc.data.reopened === true && rc.data.caseRow.status === '동향확인중', '재점검: 활성 신호가 남아 있으면 재개', rc.data.caseRow.status);
}

section('시나리오 8 확장. 판단 근거 스냅샷은 이후 변경에 영향받지 않는다');
{
  const det = run(ctx, `api_caseDetail(${J(caseId)})`).data;
  const basis = det.basisList[0];
  const limBefore = basis.limits.find(l => l.limit_type === '기본한도').amount;
  as(ctx, 'credit1@example.invalid', `api_submitVersion('M_LIMIT', { limit_id: 'LW0123-B', wholesaler_id: 'W0123', limit_type: '기본한도', amount: 50000000, valid_from: '2026-10-28', approval_basis: '(가상) 감액' }, '테스트')`);
  run(ctx, `api_decideVersion('M_LIMIT', 'LW0123-B', 3, '승인', '')`);
  run(ctx, `api_updateSetting('S01_DROP_PCT', '50', true, '', '테스트 변경')`);
  const after = run(ctx, `api_caseDetail(${J(caseId)})`).data.basisList[0];
  ok(after.limits.find(l => l.limit_type === '기본한도').amount === limBefore && after.settings.settings.S01_DROP_PCT === '30', '한도·기준값 변경 후에도 스냅샷의 당시 값 유지', `한도 ${limBefore}, S01 기준 30%`);
  const now360 = run(ctx, 'api_get360("W0123")').data.limits.find(l => l.limit_type === '기본한도');
  ok(now360.amount === 50000000, '현재 조회는 새 한도 표시');
  ok(table(ctx, 'DB_LOG', 'L_AUDIT').some(a => a.table_name === 'M_SETTING' && a.record_key === 'S01_DROP_PCT'), '기준값 변경 이력 기록');
}

section('시나리오 6. 매뉴얼 근거가 없으면 절차를 지어내지 않는다 / 문서 충돌 표시');
{
  const p1 = run(ctx, `proceduresFor_('SIT-TURN-DROP', todayStr_())`);
  ok(p1.status === '확인 필요' && p1.steps.length === 0 && /임의로 만들지 않습니다/.test(p1.message), '절차 미등록 상황 → "확인 필요", 절차 0줄', p1.message);
  const p2 = run(ctx, `proceduresFor_('SIT-MULTI', todayStr_())`);
  ok(p2.status === '충돌' && p2.steps.length === 2 && new Set(p2.steps.map(s => s.doc_id)).size === 2, '같은 상황에 두 문서 절차 → "충돌", 두 근거 모두 표시', p2.steps.map(s => s.doc_name + ' ' + s.article).join(' | '));
  const p3 = run(ctx, `proceduresFor_('SIT-OVD-NEW', '2024-06-01')`);
  ok(p3.status === '확인 필요', '문서 시행일 이전 기준일에는 그 문서 절차를 쓰지 않음');
  const det = run(ctx, `api_caseDetail(${J(caseId)})`).data.guide;
  const turn = det.procedures.find(p => p.situation_code === 'SIT-TURN-DROP'), multi = det.procedures.find(p => p.situation_code === 'SIT-MULTI');
  ok(turn && turn.status === '확인 필요' && multi && multi.status === '충돌', 'W0123 관리 건 안내: 회전율 저하 → 확인 필요, 복수 징후 → 충돌 표시');
  ok(!run(ctx, `api_createDraftForm(${J(caseId)}, 'FORM-NONE')`).ok, '등록되지 않은 서식은 작성본 생성 불가');
}

section('시나리오 4 확장. 정기 처리를 다시 실행해도 신호·관리 건이 중복되지 않는다');
{
  const before = { sig: table(ctx, 'DB_WORK', 'T_SIGNAL').length, cases: table(ctx, 'DB_WORK', 'T_CASE').length, met: table(ctx, 'DB_AGG', 'A_METRIC').length };
  pipeline(ctx);
  const after = { sig: table(ctx, 'DB_WORK', 'T_SIGNAL').length, cases: table(ctx, 'DB_WORK', 'T_CASE').length, met: table(ctx, 'DB_AGG', 'A_METRIC').length };
  ok(before.sig === after.sig && before.cases === after.cases && before.met === after.met, '재실행 후 신호·관리 건·지표 스냅샷 수 불변', J(after));
  const s01 = table(ctx, 'DB_WORK', 'T_SIGNAL').find(s => s.wholesaler_id === 'W0123' && s.rule_id === 'S01');
  ok(s01.last_date === END && s01.miss_count === 0, '같은 구간은 기존 신호의 최근 판정일만 갱신');
  const held = run(ctx, `(function(){ mergeStatus_({ data_status: '지연' }); var r = evaluateAll_('RUN-HOLD', '테스트'); var s = readTable_('DB_WORK','T_SIGNAL').filter(function(x){return x.wholesaler_id==='W0123';}); return { held: r.held, statuses: s.map(function(x){return x.status;}) }; })()`);
  ok(held.held && held.statuses.every(x => x === '보류'), '데이터 상태가 정상이 아니면 신호 판정 보류, 기존 신호 "보류"', held.statuses.join(','));
  const rc = run(ctx, `api_recheckCase(${J(caseId)}, '')`);
  const back = run(ctx, `(function(){ mergeStatus_({ data_status: '정상' }); evaluateAll_('RUN-BACK', '테스트'); return readTable_('DB_WORK','T_SIGNAL').filter(function(x){return x.wholesaler_id==='W0123';}).map(function(x){return x.status;}); })()`);
  ok(back.every(x => x === '연결'), '데이터 정상화 후 재판정 → "연결" 복귀', back.join(','));
  void rc;
}

section('관리 건 묶음 규칙: 수동 개시·재발');
{
  const m = run(ctx, `api_openCase('W0123', '테스트')`).data;
  ok(m.existing === true && m.caseRow.case_id === caseId, '열린 관리 건이 있으면 새로 만들지 않고 기존 건 반환');
  const dec = run(ctx, `decideCase_([{ case_id: 'C-X', status: '종결', closed_date: '2026-09-15' }], [{ rule_id: 'S02' }], '2026-10-27', readSettings_())`);
  ok(dec.action === 'recur' && dec.parentId === 'C-X', '종결 후 90일 이내 → 재발(이전 건 연결)');
  const dec2 = run(ctx, `decideCase_([{ case_id: 'C-X', status: '종결', closed_date: '2026-05-01' }], [{ rule_id: 'S02' }], '2026-10-27', readSettings_())`);
  ok(dec2.action === 'new', '90일 경과 → 신규');
  ok(run(ctx, `decideCase_([], [{ rule_id: 'S06' }], '2026-10-27', readSettings_())`).action === 'none', '기한 도래(S06)만 있으면 관리 건 생성 안 함');
  const s06 = table(ctx, 'DB_WORK', 'T_SIGNAL').filter(s => s.rule_id === 'S06');
  ok(s06.length > 0 && s06.every(s => !s.case_id || table(ctx, 'DB_WORK', 'T_SIGNAL').some(x => x.case_id === s.case_id && x.rule_id !== 'S06')), 'S06 신호는 관리 건 없이(또는 기존 건에만) 기록', `${s06.length}건`);
}

section('기준값 관리');
{
  const r = run(ctx, 'api_settings()').data;
  ok(r.settings.length === 44 && r.settings.every(s => s.is_assumed === true || s.key === 'S01_DROP_PCT'), '기준값 44개 적재, 모두 "가정값" 표시', `${r.settings.length}개`);
  ok(!run(ctx, `api_updateSetting('LIMIT_COMBINE', '마음대로', false, '', 'x')`).ok, '허용되지 않은 결합 방식 값 거부');
  const upd = run(ctx, `api_updateSetting('LIMIT_COMBINE', '기본한도만', false, '(가상) 규정 제3조', '규정 확인')`);
  ok(upd.ok && upd.data.is_assumed === false, '결합 방식 확정 입력 → 가정 표시 해제');
  pipeline(ctx);
  const lu = table(ctx, 'DB_AGG', 'A_METRIC').find(m => m.wholesaler_id === 'W0123' && m.metric === '한도사용률');
  ok(lu && lu.status === '정상' && lu.method === '기본한도만' && lu.denominator === 128000000, '결합 방식 확정 후 한도 사용률 산출(기본한도만, 기준일 2026-10-27 유효 v2 한도)', `${(lu.value * 100).toFixed(1)}% (${lu.numerator.toLocaleString()} / ${lu.denominator.toLocaleString()})`);
  ok(table(ctx, 'DB_WORK', 'T_SIGNAL').some(s => s.wholesaler_id === 'W0123' && s.rule_id === 'S05'), '한도 사용률 신호(S05) 생성 시작');
  ok(!as(ctx, 'credit1@example.invalid', `api_updateSetting('S02_RATIO', '1.5', true, '', 'x')`).ok, '채권담당 → 기준값 변경 거부');
}

console.log('중도매인 통합관리 2단계 로컬 검증 (모의 Apps Script, 가상 데이터, 기준일 2026-10-28)');
console.log(out.join('\n'));
console.log(`\n합계: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
