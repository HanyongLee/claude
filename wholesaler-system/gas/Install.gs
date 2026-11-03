/**
 * Install.gs — 한 파일 설치기
 *
 * 사용법 (한 번만):
 *  1) https://script.google.com/home/usersettings 에서 "Google Apps Script API" 를 켠다.
 *  2) 새 Apps Script 프로젝트를 만들고, 이 파일 내용을 Code.gs 에 붙여넣는다.
 *  3) 프로젝트 설정에서 "appsscript.json 매니페스트 표시"를 켜고, 아래 INSTALL_MANIFEST 내용을 appsscript.json 에 붙여넣는다.
 *  4) 함수 install 을 실행한다(권한 허용). → GitHub 에서 나머지 파일을 모두 받아 이 프로젝트에 넣는다.
 *  5) 페이지를 새로고침한 뒤 함수 setupAll 을 실행한다. → 폴더·시트 생성, (선택) 가상 데이터, 정기 처리, 트리거.
 *  6) 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 아래 설명 참고) → URL 공유.
 *
 * 이후 코드가 바뀌면 update 를 실행하고 "배포 관리"에서 새 버전으로 다시 배포한다.
 * 이 파일은 다른 파일에 의존하지 않는다(설치 전에도 단독으로 동작해야 하므로).
 */

var INSTALL_SOURCE = {
  owner: 'HanyongLee', repo: 'claude', branch: 'claude/wholesaler-management-system-ae6ph9', dir: 'wholesaler-system/gas',
  files: ['appsscript.json', 'Config.gs', 'Logic.gs', 'Db.gs', 'Audit.gs', 'Auth.gs', 'Setup.gs', 'Pipeline.gs', 'Backup.gs', 'Master.gs',
    'Metrics.gs', 'Signals.gs', 'Work.gs', 'Docs.gs', 'Performance.gs', 'Backtest.gs', 'Qa.gs', 'Notify.gs', 'Api.gs',
    'VirtualData.gs', 'TestData.gs', 'Main.gs', 'Install.gs', 'NhImport.gs', 'Snapshot.gs', 'Index.html', 'Styles.html', 'Client.html', 'SnapshotTemplate.html']
};

/** 설치 전 appsscript.json 에 붙여넣을 내용(설치가 이 매니페스트의 권한 범위를 필요로 한다) */
var INSTALL_MANIFEST = JSON.stringify({
  timeZone: 'Asia/Seoul', dependencies: { enabledAdvancedServices: [{ userSymbol: 'Drive', version: 'v3', serviceId: 'drive' }] }, exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8',
  oauthScopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/script.scriptapp', 'https://www.googleapis.com/auth/script.projects',
    'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.send_mail',
    'https://www.googleapis.com/auth/userinfo.email'],
  webapp: { executeAs: 'USER_DEPLOYING', access: 'MYSELF' }
}, null, 2);

function installRawUrl_(name) {
  var s = INSTALL_SOURCE;
  return 'https://raw.githubusercontent.com/' + s.owner + '/' + s.repo + '/' + s.branch + '/' + s.dir + '/' + name;
}

/** [편집기 실행] GitHub 에서 전체 파일을 받아 이 프로젝트에 설치한다 */
function install() { return installFiles_('설치'); }

/** [편집기 실행] 최신 코드로 갱신한다(저장소의 자료·설정은 건드리지 않음). 갱신 후 "배포 관리"에서 새 버전으로 배포 */
function update() { return installFiles_('갱신'); }

function installFiles_(label) {
  var files = INSTALL_SOURCE.files.map(function (name) {
    var res = UrlFetchApp.fetch(installRawUrl_(name), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error(name + ' 을(를) 받지 못했습니다 (HTTP ' + res.getResponseCode() + '). 저장소 주소·브랜치를 확인하세요.');
    var text = res.getContentText('UTF-8');
    if (name === 'appsscript.json') return { name: 'appsscript', type: 'JSON', source: text };
    if (/\.html$/.test(name)) return { name: name.replace(/\.html$/, ''), type: 'HTML', source: text };
    return { name: name.replace(/\.gs$/, ''), type: 'SERVER_JS', source: text };
  });
  var scriptId = ScriptApp.getScriptId();
  var res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + scriptId + '/content', {
    method: 'put', contentType: 'application/json', payload: JSON.stringify({ files: files }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    var hint = /PERMISSION_DENIED|Apps Script API/.test(body)
      ? ' → https://script.google.com/home/usersettings 에서 Google Apps Script API 를 켰는지, 매니페스트(appsscript.json)를 INSTALL_MANIFEST 내용으로 바꿨는지 확인하세요.'
      : '';
    throw new Error(label + ' 실패 (HTTP ' + res.getResponseCode() + '): ' + body.substring(0, 300) + hint);
  }
  var msg = label + ' 완료: ' + files.length + '개 파일. 페이지를 새로고침한 뒤 ' + (label === '설치' ? 'setupAll 을 실행하세요.' : '배포 → 배포 관리에서 새 버전으로 배포하세요.');
  Logger.log(msg);
  return msg;
}
