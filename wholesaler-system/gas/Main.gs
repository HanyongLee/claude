/**
 * Main.gs — 웹앱 진입점
 * 화면 껍데기만 내려주고, 데이터는 모두 api_* 호출에서 권한 확인 후 내려준다.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** 템플릿에서 다른 HTML 파일을 끼워 넣는다(서버에서만 실행). */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
