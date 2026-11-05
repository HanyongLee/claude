/**
 * Start.gs — 처음 한 번 실행하는 시작 함수
 *
 * 1) 아래 두 줄의 폴더 이름을 내 드라이브에 맞게 고친다(폴더 ID 를 넣어도 된다).
 * 2) 편집기 위쪽 함수 목록에서 startHere 를 고르고 ▶ 실행 → 권한 허용.
 * 3) 실행 로그의 안내대로 "배포 → 새 배포 → 웹 앱" 을 누르면 홈페이지 주소가 나온다.
 *
 * 연습용 가상 자료로만 둘러보려면 startHere 대신 setupAll 을 실행한다(새 폴더 '중도매인통합관리'에 가상 자료).
 */

/** 기초자료 폴더(농협 추출 엑셀을 넣어 두는 폴더). 이름 또는 폴더 ID */
var START_ROOT_FOLDER = '2611_AI혁신센터_채권관리';

/** 업무매뉴얼 폴더(HWP·PDF 파일명만 등록, 본문은 읽지 않음). 없으면 '' 로 둔다 */
var START_MANUAL_FOLDER = '기초 자료';

/**
 * [편집기 실행] 폴더 연결 → 매뉴얼 등록 → 엑셀 읽기·집계·신호 → 정기 실행 예약 → 주간 스냅샷 → 보안 점검.
 * 여러 번 실행해도 같은 결과가 된다(이미 있는 폴더·시트·자료는 다시 만들지 않는다).
 */
function startHere() {
  requireOwner_();
  var out = [];
  var step = function (label, fn) {
    try { var r = fn(); out.push('✔ ' + label + (r ? ': ' + r : '')); return true; }
    catch (e) { out.push('✖ ' + label + ': ' + (e && e.message ? e.message : e)); return false; }
  };
  if (!step('1. 기초자료 폴더 연결', function () { return setupWithFolder(START_ROOT_FOLDER)[0]; })) {
    Logger.log(out.join('\n'));
    throw new Error('기초자료 폴더를 찾지 못했습니다. Start.gs 맨 위의 START_ROOT_FOLDER 를 내 드라이브 폴더 이름(또는 ID)으로 고친 뒤 다시 실행하세요.');
  }
  if (START_MANUAL_FOLDER) step('2. 업무매뉴얼 파일명 등록', function () { return registerManuals(START_MANUAL_FOLDER).message.split('\n')[0]; });
  else out.push('– 2. 업무매뉴얼: 건너뜀(START_MANUAL_FOLDER 비어 있음)');
  var piped = null;
  step('3. 엑셀 읽기·집계·이상 징후 판정', function () {
    piped = runPipeline_('시작');   // 한 번의 실행 시간(4.5분)을 넘기면 스스로 1분 뒤 이어서 실행을 예약한다
    return piped.status === '계속' ? '자료가 많아 나눠서 처리 중(1분 간격 자동 이어서 실행, 몇 분 뒤 웹앱에서 확인)' : piped.status;
  });
  step('4. 정기 실행 예약(매일 06시 처리·02시 백업·08시 알림)', function () { return installTriggers(); });
  if (piped && piped.status === '완료') step('5. 주간 스냅샷 HTML 생성(40_배포 폴더)', function () { var s = buildSnapshotsNow(); return (s || []).map(function (x) { return x.name; }).join(', '); });
  else out.push('– 5. 주간 스냅샷: 처리가 끝난 뒤 정기 실행 때 생성(지금 만들려면 처리 완료 후 buildSnapshotsNow 실행)');
  step('6. 보안 점검(시트·폴더 외부 공유 여부)', function () { var c = checkSecurity(); return c.warnings.length ? '경고 ' + c.warnings.join(' / ') : '모두 비공개'; });
  out.push('');
  out.push('다음 단계: 오른쪽 위 [배포] → [새 배포] → 톱니바퀴에서 [웹 앱] → 실행 사용자 "나", 액세스 "나만" → [배포] → 웹 앱 URL 이 홈페이지 주소입니다.');
  out.push('다른 담당자도 쓰게 하려면 액세스를 "Google 계정이 있는 모든 사용자"로 하고, 웹앱의 지표·신호 기준에서 AUTH_MODE 를 code 로 바꾼 뒤 사용자·권한에서 접속코드를 발급하세요.');
  Logger.log(out.join('\n'));
  return out;
}
