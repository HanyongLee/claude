/**
 * render_ui.js — 웹앱 화면을 모의 서버에 연결해 헤드리스 브라우저로 열고 화면 캡처·스크립트 오류를 확인한다.
 * 사용: node tests/render_ui.js <출력폴더>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { createGas } = require('./gas_mock');

const GAS = path.join(__dirname, '..', 'gas');
const OUT = process.argv[2] || '.';
const ORDER = ['Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs',
  'Master.gs', 'Metrics.gs', 'Signals.gs', 'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs', 'NhImport.gs', 'Snapshot.gs', 'Checklist.gs'];
const OWNER = 'owner@example.invalid';

(async () => {
  const gas = createGas({ ownerEmail: OWNER });
  // 검증 기준 '오늘'을 2026-10-28 09:00(KST)로 고정한다(가상 자료 종료일 2026-10-27 의 다음 날)
  const FROZEN = new Date('2026-10-28T09:00:00+09:00').getTime();
  let tick = 0;
  const REAL0 = Date.now();
// '오늘'은 고정하되 경과 시간은 실제로 흐르게 한다(실행시간 예산 검사용)
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(FROZEN + (Date.now() - REAL0)); else super(...a); } static now() { return FROZEN + (Date.now() - REAL0); } }
  const ctx = vm.createContext(Object.assign({ Date: FrozenDate }, gas.globals));
  vm.runInContext(ORDER.map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n;\n'), ctx);
  vm.runInContext(`setupSystem(); loadVirtualData_({ startDate: '2024-10-01', endDate: '2026-10-27', seed: 20261027 }); runPipeline_('UI');`, ctx);

  // 관리 건 하나를 조치 진행 상태까지 만들어 화면을 채운다
  const caseId = vm.runInContext(`(function(){
    var c = readTable_('DB_WORK','T_CASE').filter(function(x){return x.wholesaler_id==='W0123';})[0];
    _testUserOverride = 'auctioneer1@example.invalid';
    api_saveTrend({ case_id: c.case_id, checked_date: '2026-10-28', check_method: '방문', counterpart: '대표', facts: ['(가상) 거래처 대금 회수 지연으로 결제 늦어짐', '(가상) 11/10 연체분 결제 약속'], payment_plan: '(가상) 11/10 3,900만원', opinion: '(가상) 일시적으로 보임', result_class: '채권 검토 필요', recheck_date: '2026-11-30' }, true);
    _testUserOverride = 'credit1@example.invalid';
    var a = api_createAction({ case_id: c.case_id, action_type: '한도 조정 요청', content: '(가상) 결제 이행 시까지 기본한도 20% 감액', due_date: '2026-11-05' });
    api_requestApproval(a.data.action_id);
    api_createDraftForm(c.case_id, 'FORM-PAYPLAN');
    _testUserOverride = null;
    return c.case_id; })()`, ctx);
  const inc = (n) => fs.readFileSync(path.join(GAS, n + '.html'), 'utf8');
  const html = inc('Index').replace(/<\?!= include_\('(\w+)'\); \?>/g, (m, n) => inc(n));
  const browser = await chromium.launch();
  const errors = [];
  for (const who of [{ email: OWNER, tag: 'admin' }, { email: 'auctioneer1@example.invalid', tag: 'auctioneer' }]) {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      page.on('pageerror', e => errors.push(who.tag + ' ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(who.tag + ' console ' + m.text()); });
      await page.exposeFunction('__api', (fn, args) => {
        gas.state.activeEmail = who.email;
        vm.runInContext('_tableMemo = {}; _ssMemo = {};', ctx);
        ctx.__args = args;
        try { return vm.runInContext(fn + '.apply(null, __args)', ctx); } finally { gas.state.activeEmail = OWNER; }
      });
      await page.addInitScript(() => {
        const make = (ok, ko) => new Proxy({}, { get: (t, k) => {
          if (k === 'withSuccessHandler') return (f) => make(f, ko);
          if (k === 'withFailureHandler') return (f) => make(ok, f);
          return (...a) => window.__api(k, a).then(ok, ko);
        } });
        window.google = { script: { run: make(() => {}, () => {}) } };
      });
      await page.route('http://app.local/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
      await page.goto('http://app.local/');
      const shots = who.tag === 'admin'
        ? [['home', ''], ['ws360', '#/ws/W0123'], ['import', '#/import'], ['master', '#/master/W0123'], ['ws360-past', '#/ws/W0123/2026-02-15'],
           ['credit', '#/credit'], ['case', '#/case/' + caseId], ['rules', '#/rules'], ['docs', '#/docs'], ['perf', '#/perf'], ['perf-detail', '#/perf/W0123'], ['qa', '#/qa/' + caseId]]
        : [['home', ''], ['ws360', '#/ws/W0101'], ['trend', '#/trend'], ['case', '#/case/' + caseId]];
      for (const [name, hash] of shots) {
        if (scheme === 'dark' && name !== 'ws360' && name !== 'case' && name !== 'perf') continue;
        await page.evaluate(h => { location.hash = h; }, hash);
        await page.waitForTimeout(600);
        if (name === 'qa') { await page.fill('#qf input[name=q]', '연체 발생 시 결제계획 확인 절차'); await page.click('#qf button'); await page.waitForTimeout(800); await page.screenshot({ path: path.join(OUT, `${who.tag}-qa-answer-${scheme}.png`), fullPage: true }); }
        if (name === 'perf') { await page.click('#pTabs button[data-t="matrix"]'); await page.waitForTimeout(800); await page.screenshot({ path: path.join(OUT, `${who.tag}-matrix-${scheme}.png`), fullPage: true }); await page.click('#pTabs button[data-t="collect"]'); await page.waitForTimeout(500); }
        await page.screenshot({ path: path.join(OUT, `${who.tag}-${name}-${scheme}.png`), fullPage: true });
        const bad = await page.evaluate(() => Array.from(document.querySelectorAll('.note.bad')).map(n => n.textContent).join(' | '));
        if (/접속할 수 없습니다|is not|undefined/.test(bad)) errors.push(who.tag + ' ' + name + ': ' + bad);
      }
      // 모바일 폭 가로 스크롤 확인
      if (scheme === 'light') {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.evaluate(() => { location.hash = '#/ws/' + (document.querySelector('.who').textContent.indexOf('경매사') >= 0 ? 'W0101' : 'W0123'); });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) errors.push(who.tag + ' 모바일 가로 넘침 ' + overflow + 'px');
        await page.screenshot({ path: path.join(OUT, `${who.tag}-ws360-mobile.png`), fullPage: true });
      }
      await page.close();
    }
  }
  // 접속코드 모드: 식별 불가 사용자로 열면 로그인 화면 → 로그인 후 홈
  vm.runInContext(`_tableMemo = {}; api_updateSetting('AUTH_MODE', 'code', false, '', 'UI'); var __c = api_issueAccessCode('auctioneer1@example.invalid', 'UI').data.code; __code = __c;`, ctx);
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', e => errors.push('login ' + e.message));
    await page.exposeFunction('__api', (fn, args) => { gas.state.activeEmail = ''; vm.runInContext('_tableMemo = {}; _ssMemo = {};', ctx); ctx.__args = args; try { return vm.runInContext(fn + '.apply(null, __args)', ctx); } finally { gas.state.activeEmail = OWNER; } });
    await page.addInitScript(() => { const make = (ok, ko) => new Proxy({}, { get: (t, k) => { if (k === 'withSuccessHandler') return (f) => make(f, ko); if (k === 'withFailureHandler') return (f) => make(ok, f); return (...a) => window.__api(k, a).then(ok, ko); } }); window.google = { script: { run: make(() => {}, () => {}) } }; });
    await page.route('http://app.local/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('http://app.local/'); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'code-login.png'), fullPage: true });
    const hasLogin = await page.$('#lf');
    if (!hasLogin) errors.push('접속코드 모드인데 로그인 화면이 없음');
    await page.fill('#lf input[name=email]', 'auctioneer1@example.invalid'); await page.fill('#lf input[name=code]', vm.runInContext('__code', ctx)); await page.click('#lf button');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'code-home.png'), fullPage: true });
    const who = await page.evaluate(() => document.querySelector('.who').textContent);
    if (who.indexOf('경매사1') < 0) errors.push('접속코드 로그인 후 사용자 표시 실패: ' + who);
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? '오류:\n' + errors.join('\n') : '스크립트 오류 없음');
})();
