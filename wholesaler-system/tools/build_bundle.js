/**
 * build_bundle.js — Apps Script 에 붙여넣을 한 파일 설치본을 만든다.
 *   결과: dist/apps-script/Code.gs (서버 코드 + 화면 HTML 내장), dist/apps-script/appsscript.json
 *   사용: node tools/build_bundle.js
 *
 * 설치본은 GitHub·Apps Script API 없이 동작한다. 화면 HTML(Index·Styles·Client·SummaryView·SnapshotTemplate)은
 * 문자열로 내장하고 htmlFile_ 가 그 문자열을 돌려준다. 한 파일 설치기(Install.gs)는 넣지 않는다(파일을 따로 추가해 중복이 생기므로).
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GAS = path.join(ROOT, 'gas');
const OUT = path.join(ROOT, 'dist', 'apps-script');

// Start.gs 를 맨 앞에 두어 사용자가 고칠 두 줄(폴더 이름)이 파일 첫 화면에 보이게 한다
const ORDER = ['Start.gs', 'Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs', 'Master.gs',
  'Metrics.gs', 'Signals.gs', 'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs',
  'VirtualData.gs', 'TestData.gs', 'Main.gs', 'NhImport.gs', 'Snapshot.gs', 'Checklist.gs'];
const HTML = ['Index', 'Styles', 'Client', 'SummaryView', 'SnapshotTemplate'];

function build() {
  const missing = fs.readdirSync(GAS).filter(f => /\.gs$/.test(f) && f !== 'Install.gs' && ORDER.indexOf(f) < 0);
  if (missing.length) throw new Error('설치본 목록에 없는 .gs 파일: ' + missing.join(', ') + ' (tools/build_bundle.js ORDER 에 추가)');
  const version = (fs.readFileSync(path.join(GAS, 'Config.gs'), 'utf8').match(/VERSION:\s*'([^']+)'/) || [])[1] || '';

  const HTML_FN = /function htmlFile_\(name\) \{\n  return HtmlService\.createHtmlOutputFromFile\(name\)\.getContent\(\);\n\}/;
  const parts = ORDER.map(f => {
    let src = fs.readFileSync(path.join(GAS, f), 'utf8');
    if (f === 'Main.gs') {
      if (!HTML_FN.test(src)) throw new Error('Main.gs 의 htmlFile_ 형태가 바뀌었습니다. build_bundle.js 를 맞춰 주세요.');
      src = src.replace(HTML_FN, "function htmlFile_(name) {\n  if (!Object.prototype.hasOwnProperty.call(BUNDLED_HTML_, name)) throw new Error('내장 화면 없음: ' + name);\n  return BUNDLED_HTML_[name];\n}");
    }
    return '/* ══════════════ ' + f + ' ══════════════ */\n' + src.trim() + '\n';
  });

  const html = {};
  HTML.forEach(n => { html[n] = fs.readFileSync(path.join(GAS, n + '.html'), 'utf8'); });
  // </script> 와 줄 구분 문자가 문자열을 깨지 않도록 이스케이프
  const lit = JSON.stringify(html, null, 1).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  const header = [
    '/**',
    ' * 중도매인 통합관리 ' + version + ' — Apps Script 한 파일 설치본 (자동 생성: tools/build_bundle.js. 폴더 이름 두 줄 외에는 고치지 마세요)',
    ' *',
    ' * 설치 (처음 한 번):',
    ' *  1) script.google.com → 새 프로젝트. 이 파일 전체를 Code.gs 에 붙여넣고 저장(Ctrl+S).',
    ' *  2) 왼쪽 톱니(프로젝트 설정) → "편집기에 appsscript.json 매니페스트 파일 표시" 체크 →',
    ' *     편집기의 appsscript.json 을 함께 받은 appsscript.json 내용으로 바꾸고 저장.',
    ' *  3) 바로 아래 START_ROOT_FOLDER(기초자료 폴더 이름)를 확인하고, 위쪽 함수 목록에서 startHere → ▶ 실행 → 권한 허용.',
    ' *  4) 배포 → 새 배포 → 웹 앱(실행: 나 / 액세스: 나만) → 웹 앱 URL 이 홈페이지 주소.',
    ' *',
    ' * 새 버전으로 바꿀 때: 이 파일 전체를 새 Code.gs 로 덮어쓰고 저장 → 배포 관리 → 연필 → 새 버전 → 배포.',
    ' *   (폴더 이름 두 줄만 다시 확인. 시트·자료·설정은 드라이브에 그대로 남는다)',
    ' */',
    ''
  ].join('\n');

  const code = header + parts.join('\n') + '\n/* ══════════════ 내장 화면 (gas/*.html) ══════════════ */\nvar BUNDLED_HTML_ = ' + lit + ';\n';

  const manifest = JSON.parse(fs.readFileSync(path.join(GAS, 'appsscript.json'), 'utf8'));
  // 설치본에는 설치기(Apps Script API)·외부 호출이 없으므로 그 권한을 빼서 권한 요청을 줄인다
  manifest.oauthScopes = manifest.oauthScopes.filter(s => !/script\.projects|script\.external_request/.test(s));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'Code.gs'), code);
  fs.writeFileSync(path.join(OUT, 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { code: path.join(OUT, 'Code.gs'), bytes: Buffer.byteLength(code), lines: code.split('\n').length, manifest: path.join(OUT, 'appsscript.json'), version };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 1));
module.exports = { build };
