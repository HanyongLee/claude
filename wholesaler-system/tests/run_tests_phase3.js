/**
 * run_tests_phase3.js — 3단계 검증 (node tests/run_tests_phase3.js)
 * 실적관리 요약·상세, 거래·회수 매트릭스(경계·분류·제외·비연결), 기준선 산정, 백테스트(분할 실행·요약), 그림자 운영 집계
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas_mock');
const GAS = path.join(__dirname, '..', 'gas');
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs',
  'Master.gs', 'Metrics.gs', 'Signals.gs', 'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs'];
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
const pct = (g) => g && g.status === '정상' ? (g.value * 100).toFixed(1) + '%' : (g ? g.reason : '—');

const ctx = boot();
run(ctx, 'setupSystem()');
run(ctx, `loadVirtualData_({ startDate: '${START}', endDate: '${END}', seed: 20261027 })`);
pipeline(ctx);

section('실적관리 요약');
{
  const p = run(ctx, 'api_performance()').data;
  ok(p.meta.baseDate === END && p.meta.monthsAvailable >= 24, '기준일·24개월 이상 자료 확보 표시', `${p.meta.baseDate}, ${p.meta.monthsAvailable}개월`);
  ok(!p.meta.monthComplete && p.meta.lastCompleteYm === '2026-09' && /동일 경과 경매일/.test(p.meta.partialNote), '진행 중인 월(2026-10)은 마감 월과 구분, 동일 경과 경매일 비교 안내', p.meta.partialNote.substring(0, 60));
  const w = p.rows.find(r => r.wholesaler_id === 'W0123');
  const all = w.byCategory['전체'], fr = w.byCategory['과일'], vg = w.byCategory['채소'];
  ok(Math.abs(fr.amount12 + vg.amount12 - all.amount12) < 1, '부류 합 = 전체 (최근 12개월 구매금액)', all.amount12.toLocaleString());
  ok(Math.abs(fr.shareInWs + vg.shareInWs - 1) < 1e-9, '구성비 합 = 100%', `${(fr.shareInWs * 100).toFixed(1)}% / ${(vg.shareInWs * 100).toFixed(1)}%`);
  ok(all.lastMonth.ym === '2026-09' && all.lastMonth.yoy.status === '정상' && all.ytd.growth.status === '정상', '전년 동월·전년 동기 누적 증감률(마감 월 기준)', `동월 ${pct(all.lastMonth.yoy)}, 누적 ${pct(all.ytd.growth)} (${all.ytd.from}~${all.ytd.to})`);
  ok(all.mtd && all.mtd.ym === '2026-10' && all.mtd.elapsed === 23, '진행 중 월: 동일 경과 경매일(23일) 비교값 제공', `${all.mtd.amount.toLocaleString()} vs 전년 ${all.mtd.prevAmount.toLocaleString()} → ${pct(all.mtd.growth)}`);
  const mon = table(ctx, 'DB_AGG', 'A_MONTHLY').filter(m => m.wholesaler_id === 'W0123' && m.category === '전체' && m.ym >= '2025-11' && m.ym <= '2026-10').reduce((s, m) => s + m.purchase_amount, 0);
  ok(mon === all.amount12, '요약의 12개월 합계 = 월 집계 원장 합계(대사)', mon.toLocaleString());
  ok(w.turnover > 0 && w.collectionDays > 0 && w.overdue > 0, '회수 지표(회전율·회수일수·연체) 표시', `회전율 ${w.turnover.toFixed(2)}, 회수일수 ${w.collectionDays.toFixed(1)}, 연체 ${w.overdue.toLocaleString()}`);
  ok(w.limitUsage === null && /LIMIT_COMBINE/.test(w.limitUsageInfo.reason), '한도 사용률은 결합 방식 확정 전 미표시(사유 표시)');
  const nw = p.rows.find(r => r.wholesaler_id === 'W0310');
  ok(nw.isNew && nw.byCategory['전체'].ytd.growth.status === '비교불가', '신규 중도매인: 비교불가 표시');
  const auc = as(ctx, 'auctioneer2@example.invalid', 'api_performance()').data;
  const asg2 = table(ctx, 'DB_MASTER', 'M_ASSIGNMENT').filter(a => a.user_id === 'auctioneer2@example.invalid').map(a => a.wholesaler_id);
  ok(auc.rows.length === asg2.length && auc.rows.every(r => asg2.indexOf(r.wholesaler_id) >= 0), '경매사 실적 조회는 담당분만', `${auc.rows.length}명`);
  ok(as(ctx, 'viewer1@example.invalid', 'api_performance()').ok, '조회자도 실적관리 조회 가능');
  const d = run(ctx, 'api_performanceDetail("W0123")').data;
  ok(d.trend.length === 24 && d.trend[23].partial && d.trend[0].ym === '2024-11', '상세: 24개월 월별 추이, 마지막 월 진행 중 표시');
}

section('거래·회수 매트릭스 (시나리오: 참고용 4분면, 신호에 비연결)');
{
  const m = run(ctx, 'api_matrix("전체")').data;
  ok(m.points.length > 0 && m.excluded.length >= 2, '포함·제외 분리', `포함 ${m.points.length}, 제외 ${m.excluded.length}`);
  ok(m.excluded.some(e => e.wholesaler_id === 'W0310' && /신규/.test(e.reason)) && m.excluded.some(e => e.wholesaler_id === 'W0405' && /휴업/.test(e.reason)), '신규·휴업은 그래프 밖 목록으로', m.excluded.map(e => e.wholesaler_id + ':' + e.reason).join(', '));
  const xs = m.points.map(p => p.x).sort((a, b) => a - b), mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  ok(m.boundaries.x === mid && /당기중앙값/.test(m.boundaries.xSource), '가로축 경계 = 포함 점의 당기 중앙값', m.boundaries.x.toLocaleString());
  ok(/당기중앙값/.test(m.boundaries.ySource) && /고정값 미설정/.test(m.boundaries.ySource), '세로축: 고정값 미설정 → 당기 중앙값으로 대체하고 표시', m.boundaries.ySource);
  const sum = Object.keys(m.counts).reduce((s, k) => s + m.counts[k], 0);
  ok(sum === m.points.length && m.points.every(p => p.quadrantLabel), '4분면 분류 합 = 포함 점 수', JSON.stringify(m.counts));
  const w123 = m.points.find(p => p.wholesaler_id === 'W0123');
  ok(w123 && w123.quadrant === 'HL', '(가상) W0123: 구매 높음·회전율 낮음 → 집중 점검군', `${w123 && w123.quadrantLabel} (x ${w123 && w123.x.toLocaleString()}, y ${w123 && w123.y.toFixed(2)})`);
  const f = run(ctx, 'api_matrix("과일")').data;
  const same = f.points.filter(p => m.points.some(q => q.wholesaler_id === p.wholesaler_id)).every(p => p.y === m.points.find(q => q.wholesaler_id === p.wholesaler_id).y);
  ok(same && f.boundaries.x !== m.boundaries.x && /전체 기준/.test(f.axes.y), '부류 필터는 가로축·색상만 바꾸고 세로축(회전율)은 전체 기준 유지', `과일 x경계 ${f.boundaries.x.toLocaleString()}`);
  ok(f.excluded.some(e => /구매 없음/.test(e.reason)), '해당 부류 구매가 없는 중도매인은 제외 목록', f.excluded.filter(e => /구매 없음/.test(e.reason)).map(e => e.wholesaler_id).join(','));
  ok(/신용등급이나 거래제한 기준이 아닙니다/.test(m.disclaimer), '참고용 고지 문구 포함');
  const sigBefore = table(ctx, 'DB_WORK', 'T_SIGNAL').length, caseBefore = table(ctx, 'DB_WORK', 'T_CASE').length;
  run(ctx, 'api_matrix("채소")');
  ok(table(ctx, 'DB_WORK', 'T_SIGNAL').length === sigBefore && table(ctx, 'DB_WORK', 'T_CASE').length === caseBefore && !JSON.stringify(m).includes('case_id'), '매트릭스 조회는 신호·관리 건을 만들거나 참조하지 않음');
  ok(m.points.every(p => p.growth.status !== '정상' || typeof p.growth.value === 'number'), '색상 값(전년 동기 누적 증감률) 비교불가는 별도 상태', `비교불가 ${m.points.filter(p => p.growth.status !== '정상').length}개`);
}

section('세로축 기준선 산정(전년 연간 중앙값)');
{
  ok(!as(ctx, 'credit1@example.invalid', 'api_computeMatrixBaseline()').ok, '채권담당 → 기준선 재산정 거부');
  const b = run(ctx, 'api_computeMatrixBaseline()').data;
  ok(b.value > 0 && b.months.length === 12 && /2025년 월말/.test(b.source), '2025년 12개 월말 기준 회전율 중앙값의 중앙값', `${b.value}회 (${b.months.map(x => x.median).join(', ')})`);
  const st = table(ctx, 'DB_MASTER', 'M_SETTING');
  ok(st.find(s => s.key === 'MATRIX_Y_FIXED').value === String(b.value) && st.find(s => s.key === 'MATRIX_Y_FIXED').is_assumed === false, '설정 시트에 저장(출처 포함)');
  const m = run(ctx, 'api_matrix("전체")').data;
  ok(m.boundaries.y === b.value && /전년고정/.test(m.boundaries.ySource), '매트릭스 세로축이 고정 기준선으로 전환', m.boundaries.ySource);
  ok(table(ctx, 'DB_LOG', 'L_AUDIT').some(a => a.record_key === 'MATRIX_Y_FIXED'), '기준선 변경 이력 기록');
}

section('백테스트 (분할 실행·요약)');
{
  ok(!as(ctx, 'credit1@example.invalid', 'api_startBacktest({})').ok, '채권담당 → 백테스트 실행 거부');
  const t = table(ctx, 'DB_MASTER', 'M_BACKTEST_TRUTH');
  ok(t.length === 2 && t.every(x => !/[0-9]{3}-[0-9]{4}/.test(x.note)), '가상 정답 표본 2건(익명 코드·시점만)');
  // 첫 호출은 시간 예산을 아주 작게 → 분할 동작 확인
  run(ctx, 'APP.JOB_TIME_BUDGET_MS = 1;');
  const s1 = run(ctx, `api_startBacktest({ dateFrom: '2026-04-01' })`);
  run(ctx, 'APP.JOB_TIME_BUDGET_MS = 270000;');
  ok(s1.ok && s1.data.progress.status === '진행' && s1.data.progress.done < s1.data.progress.total, '시간 예산 초과 시 진행 상태 저장', `${s1.data.progress.done}/${s1.data.progress.total}`);
  ok(ctx.__gas.triggers.some(tr => tr.getHandlerFunction() === 'triggerContinueBacktest'), '이어서 실행 트리거 등록');
  ok(!run(ctx, `api_startBacktest({})`).ok, '진행 중에는 새 백테스트 시작 거부');
  let r, n = 0;
  do { r = run(ctx, 'triggerContinueBacktest()'); n++; } while (r.status === '진행' && n < 50);
  ok(r.status === '완료' && !ctx.__gas.triggers.some(tr => tr.getHandlerFunction() === 'triggerContinueBacktest'), '트리거로 이어서 완료, 트리거 정리', `${n}회`);
  const st = run(ctx, 'api_backtestStatus()').data;
  const sm = st.runs[0].summary;
  ok(st.current === '' && st.runs[0].status === '완료' && sm, '실행 기록·요약 저장');
  const hitsAll = table(ctx, 'DB_AGG', 'A_BACKTEST_HIT').filter(h => h.run_id === st.runs[0].run_id);
  const expectCaptured = t.filter(x => hitsAll.some(h => h.wholesaler_id === x.wholesaler_id && h.rule_id !== 'S07' && h.base_date <= x.event_date && h.base_date >= run(ctx, `addDays_('${x.event_date}', -90)`))).length;
  ok(sm.truth_count === 2 && sm.captured === expectCaptured && sm.capture_rate === expectCaptured / 2, '포착률 = 사안 전 90일 이내 신호가 있던 표본 비율(판정 결과와 일치)', JSON.stringify(sm.truth_detail.map(x => ({ ws: x.wholesaler_id, c: x.captured, lead: x.lead_days, rule: x.rule }))));
  const w123 = sm.truth_detail.find(x => x.wholesaler_id === 'W0123');
  ok(w123.captured && w123.lead_days >= 0 && w123.lead_days <= 90 && w123.first_signal < '2026-09-20', '선행기간: 사안(2026-09-20) 이전 신호 시작일', `${w123.first_signal} (${w123.rule}), 선행 ${w123.lead_days}일`);
  ok(sm.alerts > 0 && sm.precision !== null && sm.precision <= 1 && sm.alerts_per_auctioneer_week.length > 0, '적중률·경매사별 주간 경보량 산출', `경보 ${sm.alerts}, 적중 ${sm.precise}, 적중률 ${(sm.precision * 100).toFixed(0)}%, 주당 ${sm.alerts_per_week.toFixed(2)}`);
  ok(/표본이 2건으로 적어/.test(sm.caveat), '표본 부족 경고 표시');
  const hits = table(ctx, 'DB_AGG', 'A_BACKTEST_HIT');
  ok(hits.length > 0 && hits.every(h => h.run_id === st.runs[0].run_id && h.rule_id !== 'S06'), '기준일별 판정 결과 저장(S06 제외)', `${hits.length}건`);
  // 임시 기준값으로 두 번째 실행: 더 엄격 → 경보 감소, 저장된 설정 불변
  const s2 = run(ctx, `api_startBacktest({ dateFrom: '2026-04-01', overrides: { S01_DROP_PCT: '60', S02_RATIO: '2.0' } })`);
  let r2 = s2.data.progress, k = 0; while (r2.status === '진행' && k++ < 50) r2 = run(ctx, 'triggerContinueBacktest()');
  const sm2 = run(ctx, 'api_backtestStatus()').data.runs[0].summary;
  ok(sm2.alerts < sm.alerts, '더 엄격한 임시 기준 → 경보 감소', `${sm.alerts} → ${sm2.alerts}`);
  ok(table(ctx, 'DB_MASTER', 'M_SETTING').find(s => s.key === 'S01_DROP_PCT').value === '30', '임시 기준값은 저장되지 않음');
  const tr = run(ctx, `api_saveTruth({ wholesaler_id: 'W0109', event_date: '2026-10-15', event_type: '(가상) 추가 사안' }, '테스트')`);
  ok(tr.ok && run(ctx, `api_deleteTruth(${JSON.stringify(tr.data.truth_id)}, '테스트')`).ok && table(ctx, 'DB_MASTER', 'M_BACKTEST_TRUTH').filter(x => !x.is_deleted).length === 2, '정답 표본 추가·삭제(논리 삭제)');
}

section('그림자 운영 집계');
{
  const sig = table(ctx, 'DB_WORK', 'T_SIGNAL').find(s => s.wholesaler_id === 'W0109' && s.rule_id === 'S02');
  if (sig) run(ctx, `api_flagFalseAlarm(${JSON.stringify(sig.signal_id)}, '(가상) 일시적 대금 지연', true)`);
  const sh = run(ctx, 'api_backtestStatus()').data.shadow;
  ok(sh.total_signals > 0 && sh.false_alarm === (sig ? 1 : 0) && sh.false_alarm_rate !== null, '불필요한 경보 비율 = (오탐 확정 + 일시적 변화) ÷ 전체', `${sh.total_signals}건 중 오탐 ${sh.false_alarm}, 비율 ${(sh.false_alarm_rate * 100).toFixed(0)}%`);
  ok(sh.per_auctioneer_week.length > 0 && sh.by_rule.length > 0, '경매사별 주간 경보량·규칙별 집계', sh.per_auctioneer_week.map(x => x.auctioneer + ' ' + x.per_week).join(', '));
}

console.log('중도매인 통합관리 3단계 로컬 검증 (모의 Apps Script, 가상 데이터, 기준일 2026-10-28)');
console.log(out.join('\n'));
console.log(`\n합계: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
