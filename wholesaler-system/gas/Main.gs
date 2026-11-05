/**
 * Main.gs — 웹앱 진입점
 * 화면 껍데기만 내려주고, 데이터는 모두 api_* 호출에서 권한 확인 후 내려준다.
 */

function doGet() {
  return HtmlService.createTemplate(htmlFile_('Index')).evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** 템플릿에서 다른 HTML 파일을 끼워 넣는다(서버에서만 실행). */
function include_(name) {
  return htmlFile_(name);
}

/** 프로젝트의 HTML 파일 내용. 한 파일 설치본(dist)에서는 이 함수가 내장 문자열을 돌려주는 버전으로 바뀐다. */
function htmlFile_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
