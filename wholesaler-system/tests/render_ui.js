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
  'Master.gs', 'Api.gs', 'VirtualData.gs', 'TestData.gs', 'Main.gs'];
const OWNER = 'owner@example.invalid';

(async () => {
  const gas = createGas({ ownerEmail: OWNER });
  const ctx = vm.createContext(Object.assign({}, gas.globals));
  vm.runInContext(ORDER.map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n;\n'), ctx);
  vm.runInContext(`setupSystem(); loadVirtualData_({ startDate: '2024-10-01', endDate: '2026-10-27', seed: 20261027 }); runPipeline_('UI');`, ctx);

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
        ? [['home', ''], ['ws360', '#/ws/W0123'], ['import', '#/import'], ['master', '#/master/W0123'], ['ws360-past', '#/ws/W0123/2026-02-15']]
        : [['home', ''], ['ws360', '#/ws/W0101']];
      for (const [name, hash] of shots) {
        if (scheme === 'dark' && name !== 'ws360') continue;
        await page.evaluate(h => { location.hash = h; }, hash);
        await page.waitForTimeout(600);
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
  await browser.close();
  console.log(errors.length ? '오류:\n' + errors.join('\n') : '스크립트 오류 없음');
})();
