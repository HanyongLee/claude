/** render_snapshot.js — 생성된 스냅샷 HTML(docs/샘플_스냅샷_전체.html)을 브라우저로 열어 오류·가로 넘침·폼 파일 생성 확인 */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const OUT = process.argv[2] || '.';
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', '샘플_스냅샷_전체.html'), 'utf8');
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, tag] of [[1280, 'desktop'], [390, 'mobile']]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    page.on('pageerror', e => errors.push(tag + ' ' + e.message));
    await page.route('http://snap.local/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('http://snap.local/'); await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) errors.push(tag + ' 가로 넘침 ' + over + 'px');
    await page.screenshot({ path: path.join(OUT, `snapshot-${tag}.png`), fullPage: tag === 'desktop' });
    if (tag === 'desktop') {
      const dl = page.waitForEvent('download');
      await page.fill('#tf input[name=checked_date]', '2026-10-28'); await page.fill('#tf textarea[name=facts]', '(가상) 사실 1\n(가상) 사실 2');
      await page.selectOption('#tf select[name=result_class]', '지속 관찰'); await page.fill('#tf input[name=recheck_date]', '2026-11-30');
      await page.click('#mk');
      const d = await dl; const p = await d.path(); const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!/^TREND_C-.*\.json$/.test(d.suggestedFilename()) || j.facts.length !== 2 || j.result_class !== '지속 관찰') errors.push('동향보고 파일 생성 실패: ' + d.suggestedFilename());
      else console.log('동향보고 파일 생성 확인: ' + d.suggestedFilename() + ' (' + JSON.stringify(Object.keys(j)) + ')');
    }
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? '오류:\n' + errors.join('\n') : '스냅샷 HTML: 스크립트 오류·가로 넘침 없음');
})();
