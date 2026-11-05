/**
 * 중도매인 통합관리 0.7.0-weekly — Apps Script 한 파일 설치본 (자동 생성: tools/build_bundle.js. 폴더 이름 두 줄 외에는 고치지 마세요)
 *
 * 설치 (처음 한 번):
 *  1) script.google.com → 새 프로젝트. 이 파일 전체를 Code.gs 에 붙여넣고 저장(Ctrl+S).
 *  2) 왼쪽 톱니(프로젝트 설정) → "편집기에 appsscript.json 매니페스트 파일 표시" 체크 →
 *     편집기의 appsscript.json 을 함께 받은 appsscript.json 내용으로 바꾸고 저장.
 *  3) 바로 아래 START_ROOT_FOLDER(기초자료 폴더 이름)를 확인하고, 위쪽 함수 목록에서 startHere → ▶ 실행 → 권한 허용.
 *  4) 배포 → 새 배포 → 웹 앱(실행: 나 / 액세스: 나만) → 웹 앱 URL 이 홈페이지 주소.
 *
 * 새 버전으로 바꿀 때: 이 파일 전체를 새 Code.gs 로 덮어쓰고 저장 → 배포 관리 → 연필 → 새 버전 → 배포.
 *   (폴더 이름 두 줄만 다시 확인. 시트·자료·설정은 드라이브에 그대로 남는다)
 */
/* ══════════════ Start.gs ══════════════ */
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

/* ══════════════ Config.gs ══════════════ */
/**
 * Config.gs — 전역 설정과 시트 스키마 정의
 * 이 파일은 Google 서비스를 호출하지 않는다(테스트 환경에서도 그대로 로드 가능).
 */

var APP = {
  NAME: '중도매인 통합관리',
  VERSION: '0.7.0-weekly',
  TZ: 'Asia/Seoul',
  ROOT_FOLDER_NAME: '중도매인통합관리',
  OPEN_END: '9999-12-31',          // 종료일 미정 표시
  JOB_TIME_BUDGET_MS: 270000,      // 4.5분: 실행 제한 6분(공식 문서, 2026-09-03 갱신본) 대비 여유
  CONTINUE_AFTER_MS: 60000,        // 이어서 실행 트리거 지연
  BACKUP_KEEP_DAILY: 30,           // [가정] 일 백업 보관 세대
  BACKUP_KEEP_MONTHLY: 12,         // [가정] 월말 백업 보관 개월
  EXPIRY_WARN_DAYS: 60,            // [가정] 담보·보증 기한 도래 표시 기준
  DQ_LOOKBACK_DAYS: 30,            // 통합 상세에서 데이터 이상을 확인하는 기간
  ALLOW_SELF_APPROVAL: false,      // 요청자 본인 승인 금지
  CATEGORIES: ['과일', '채소', '기타'],   // 기타 = 곡류·특작·절화·관엽·분화 등(농협 대분류 매핑)
  ALL: '전체',
  OVERDUE_TERMS_NOTE: '연체 정의는 내부 규정 확인 전까지 원천 제공값을 그대로 표시'
};

var ROLES = {
  AUCTIONEER: '경매사',
  CREDIT: '채권담당',
  ADMIN: '관리자',
  VIEWER: '조회자'
};

var FOLDERS = {
  INBOX: '01_가져오기_대기',
  DONE: '02_가져오기_완료',
  ERROR: '03_가져오기_오류',
  FORMS: '10_원본서식',
  CASES: '20_관리건',
  EVIDENCE: '30_증빙',
  DEPLOY: '40_배포',
  BACKUP: '90_백업'
};

/** 농협 전산(EBFW916007 등) 추출 파일의 대분류명 → 시스템 부류 */
var NH_CATEGORY_MAP = { '과일': '과일', '채소': '채소', '곡류': '기타', '특작': '기타', '절화': '기타', '관엽': '기타', '분화': '기타' };

/** 기초·업무 테이블 공통 감사 필드 */
var AUDIT_COLS = [
  'created_at:datetime', 'created_by:text', 'updated_at:datetime', 'updated_by:text',
  'row_version:num', 'is_deleted:bool'
];

/** 유효기간형(버전) 테이블 공통 필드 */
var VERSION_COLS = [
  'valid_from:date', 'valid_to:date', 'approval_status:text', 'change_reason:text',
  'requested_by:text', 'requested_at:datetime', 'approved_by:text', 'approved_at:datetime',
  'reject_reason:text'
];

/**
 * 저장소(스프레드시트 파일) → 테이블(시트) → 컬럼 'name:type'
 * type: text | date(yyyy-MM-dd) | datetime | num | bool | json
 */
var SCHEMA = {
  DB_MASTER: {
    M_WHOLESALER: ['wholesaler_id:text', 'name:text', 'representative:text', 'biz_status:text',
      'trade_start_date:date', 'categories:text', 'settle_group:text', 'note:text'].concat(AUDIT_COLS),
    M_WS_STATUS_HIST: ['status_hist_id:text', 'wholesaler_id:text', 'status:text', 'valid_from:date',
      'valid_to:date', 'change_reason:text', 'created_at:datetime', 'created_by:text'],
    M_ASSIGNMENT: ['assign_id:text', 'wholesaler_id:text', 'user_id:text', 'valid_from:date',
      'valid_to:date', 'change_reason:text'].concat(AUDIT_COLS),
    M_CONTACT: ['contact_id:text', 'wholesaler_id:text', 'contact_type:text', 'value:text'].concat(AUDIT_COLS),
    M_COLLATERAL: ['collateral_id:text', 'version_no:num', 'wholesaler_id:text', 'collateral_type:text',
      'set_amount:num', 'appraised_amount:num', 'appraisal_date:date', 'recognized_amount:num',
      'confirmed_date:date', 'review_status:text', 'expiry_date:date', 'evidence_ids:text'].concat(VERSION_COLS),
    M_GUARANTEE: ['guarantee_id:text', 'version_no:num', 'wholesaler_id:text', 'has_guarantee:text',
      'guarantor_ref:text', 'scope:text', 'guarantee_limit:num', 'period_from:date', 'period_to:date',
      'confirmed_date:date', 'doc_ids:text'].concat(VERSION_COLS),
    // 한도의 적용기간 = valid_from ~ valid_to. 유형(기본/마감/추가) 간 합산 컬럼은 두지 않는다.
    M_LIMIT: ['limit_id:text', 'version_no:num', 'wholesaler_id:text', 'limit_type:text', 'amount:num',
      'approval_basis:text', 'approver:text'].concat(VERSION_COLS),
    M_EVIDENCE: ['evidence_id:text', 'wholesaler_id:text', 'target_table:text', 'target_id:text',
      'file_id:text', 'file_name:text', 'file_hash:text', 'doc_type:text', 'created_at:datetime', 'created_by:text'],
    // 접속코드 방식(AUTH_MODE=code)용 컬럼: 코드는 해시만 저장, 세션 토큰도 해시만 저장
    M_USER: ['user_id:text', 'name:text', 'role:text', 'status:text', 'code_hash:text', 'code_salt:text', 'code_issued_at:datetime',
      'token_hash:text', 'token_expires:datetime', 'fail_count:num', 'lock_until:datetime', 'last_login:datetime'].concat(AUDIT_COLS),
    M_CALENDAR: ['date:date', 'is_auction_day:bool', 'note:text'],
    // 운영 기준값. 회사 내부 기준은 이 시트(드라이브)에만 두고 코드에는 가정값만 둔다. is_assumed=true 면 '가정값' 표시
    M_SETTING: ['key:text', 'value:text', 'label:text', 'unit:text', 'is_assumed:bool', 'note:text'].concat(AUDIT_COLS),
    M_DOC: ['doc_id:text', 'doc_name:text', 'doc_type:text', 'owner_dept:text', 'note:text'].concat(AUDIT_COLS),
    M_DOC_VER: ['doc_id:text', 'version:text', 'effective_from:date', 'effective_to:date', 'file_id:text', 'file_hash:text',
      'note:text'].concat(AUDIT_COLS),
    M_SITUATION: ['situation_code:text', 'label:text', 'condition_json:json', 'note:text'].concat(AUDIT_COLS),
    M_PROCEDURE: ['proc_step_id:text', 'situation_code:text', 'step_no:num', 'content:text', 'checks:text', 'doc_id:text',
      'doc_version:text', 'article:text', 'page:text'].concat(AUDIT_COLS),
    M_PROC_FORM: ['proc_step_id:text', 'form_doc_id:text', 'required:bool'].concat(AUDIT_COLS),
    // 백테스트 정답 표본: 과거 실제 사안(익명 코드·시점). 개인정보·금액은 넣지 않는다
    M_BACKTEST_TRUTH: ['truth_id:text', 'wholesaler_id:text', 'event_date:date', 'event_type:text', 'note:text'].concat(AUDIT_COLS),
    // 이상징후 체크리스트 항목(현장 확인용). 기본 항목은 가정이며 담당자가 수정한다
    M_CHECKLIST: ['item_id:text', 'sort_no:num', 'category:text', 'text:text', 'weight:num', 'is_assumed:bool', 'active:bool'].concat(AUDIT_COLS)
  },
  DB_PII: {
    P_GUARANTOR: ['guarantor_ref:text', 'name:text', 'relation:text', 'note:text'].concat(AUDIT_COLS)
  },
  DB_RAW: {
    R_BATCH: ['batch_id:text', 'run_id:text', 'source:text', 'file_name:text', 'file_id:text', 'file_hash:text',
      'date_from:date', 'date_to:date', 'row_count:num', 'accepted_count:num', 'duplicate_count:num',
      'revised_count:num', 'rejected_count:num', 'control_rows:num', 'control_amount:num',
      'accepted_amount:num', 'control_result:text', 'status:text', 'message:text',
      'started_at:datetime', 'finished_at:datetime'],
    R_SALES: ['row_key:text', 'content_hash:text', 'batch_id:text', 'source_txn_no:text', 'line_no:text',
      'txn_date:date', 'wholesaler_id:text', 'category:text', 'amount:num', 'txn_type:text',
      'correction_type:text', 'orig_txn_no:text', 'loaded_at:datetime'],
    // 월 합계만 있는 기간(농협 사업실적 월별 추출)용. 일별 자료가 있는 달에는 쓰지 않는다
    R_SALES_MONTHLY: ['row_key:text', 'content_hash:text', 'batch_id:text', 'ym:text', 'wholesaler_id:text', 'amount:num', 'weight:num', 'loaded_at:datetime'],
    R_RECEIPT: ['row_key:text', 'content_hash:text', 'batch_id:text', 'source_receipt_no:text',
      'receipt_date:date', 'posted_date:date', 'wholesaler_id:text', 'amount:num', 'receipt_type:text',
      'loaded_at:datetime'],
    R_AR_BAL: ['row_key:text', 'content_hash:text', 'batch_id:text', 'base_date:date', 'wholesaler_id:text',
      'balance:num', 'overdue_amount:num', 'max_overdue_days:num', 'is_revision:bool', 'loaded_at:datetime'],
    R_REJECT: ['reject_id:text', 'batch_id:text', 'source:text', 'line_no:num', 'error_code:text',
      'error_message:text', 'raw_line:text', 'created_at:datetime']
  },
  DB_AGG: {
    // 일 집계: 전기일(처리일) 기준. 원장 대사·잔액 연속성 점검용
    A_DAILY: ['wholesaler_id:text', 'date:date', 'category:text', 'purchase_amount:num', 'credit_sales:num',
      'cash_sales:num', 'correction_amount:num', 'receipts:num', 'ar_balance:num', 'overdue_amount:num',
      'max_overdue_days:num', 'calc_run_id:text'],
    // 월 집계: 실적 분석용. 반품·취소는 원거래일 월로 귀속
    A_MONTHLY: ['wholesaler_id:text', 'ym:text', 'category:text', 'purchase_amount:num', 'purchase_days:num',
      'auction_days:num', 'credit_sales:num', 'cash_sales:num', 'receipts:num', 'month_end_balance:num',
      'avg_daily_balance:num', 'avg_method:text', 'calc_run_id:text'],
    A_RECON: ['recon_id:text', 'calc_run_id:text', 'item:text', 'period:text', 'source_value:num',
      'system_value:num', 'diff:num', 'result:text', 'note:text', 'created_at:datetime'],
    A_DQ: ['wholesaler_id:text', 'date:date', 'status:text', 'reason_code:text', 'detail:text', 'calc_run_id:text'],
    A_METRIC: ['metric_key:text', 'wholesaler_id:text', 'base_date:date', 'metric:text', 'category:text', 'value:num',
      'numerator:num', 'denominator:num', 'period_from:date', 'period_to:date', 'status:text', 'reason:text',
      'method:text', 'calc_run_id:text'],
    A_STATUS: ['key:text', 'value:text', 'updated_at:datetime'],
    A_BACKTEST_RUN: ['run_id:text', 'status:text', 'params_json:json', 'date_from:date', 'date_to:date', 'sample_days:num',
      'dates_total:num', 'dates_done:num', 'next_index:num', 'started_at:datetime', 'finished_at:datetime', 'summary_json:json', 'message:text'],
    A_BACKTEST_HIT: ['run_id:text', 'base_date:date', 'wholesaler_id:text', 'rule_id:text', 'severity:text', 'evidence_json:json']
  },
  DB_WORK: {
    // 신호: 한 중도매인에서 한 규칙의 조건이 연속으로 충족된 한 구간
    T_SIGNAL: ['signal_id:text', 'wholesaler_id:text', 'rule_id:text', 'case_id:text', 'severity:text', 'status:text',
      'first_date:date', 'last_date:date', 'miss_count:num', 'evidence_json:json', 'params_json:json', 'resolved_date:date',
      'false_alarm_reason:text', 'updated_at:datetime'],
    // 관리 건: 한 중도매인의 한 사안. 열린 관리 건은 중도매인당 1개
    T_CASE: ['case_id:text', 'wholesaler_id:text', 'status:text', 'owner_id:text', 'auctioneer_id:text', 'opened_date:date',
      'origin:text', 'parent_case_id:text', 'is_recurrence:bool', 'trend_due:date', 'action_due:date', 'result_class:text',
      'close_reason:text', 'closed_date:date', 'recheck_date:date', 'basis_snapshot_id:text', 'summary:text'].concat(AUDIT_COLS),
    T_CASE_HIST: ['hist_id:text', 'case_id:text', 'from_status:text', 'to_status:text', 'reason:text', 'at:datetime', 'user_id:text'],
    // 동향보고: 제출 후 수정은 새 버전
    T_TREND: ['report_id:text', 'version:num', 'case_id:text', 'wholesaler_id:text', 'status:text', 'written_date:date',
      'writer_id:text', 'signals_json:json', 'checked_date:date', 'check_method:text', 'counterpart:text',
      'facts_json:json', 'business_status:text', 'payment_plan:text', 'evidence_ids:text', 'opinion:text',
      'further_checks:text', 'result_class:text', 'followup:text', 'followup_owner:text', 'followup_due:date',
      'recheck_date:date', 'official_source:text', 'submitted_at:datetime'].concat(AUDIT_COLS),
    T_ACTION: ['action_id:text', 'case_id:text', 'wholesaler_id:text', 'action_type:text', 'owner_id:text', 'due_date:date',
      'content:text', 'needs_approval:bool', 'approval_status:text', 'status:text', 'result:text', 'done_date:date',
      'attach_ids:text', 'situation_code:text'].concat(AUDIT_COLS),
    T_APPROVAL: ['approval_id:text', 'action_id:text', 'case_id:text', 'basis_snapshot_id:text', 'requested_by:text',
      'requested_at:datetime', 'decided_by:text', 'decided_at:datetime', 'decision:text', 'reason:text'],
    // 판단 근거 스냅샷: 승인 요청·종결 시점의 참조값 묶음. 수정 불가
    T_BASIS: ['basis_snapshot_id:text', 'case_id:text', 'created_at:datetime', 'created_by:text', 'base_date:date',
      'limits_json:json', 'collaterals_json:json', 'guarantees_json:json', 'metrics_json:json', 'signals_json:json',
      'docs_json:json', 'settings_json:json'],
    T_ATTACH: ['attach_id:text', 'case_id:text', 'ref_type:text', 'ref_id:text', 'kind:text', 'form_doc_id:text',
      'form_version:text', 'file_id:text', 'file_name:text', 'file_hash:text', 'locked:bool', 'created_at:datetime', 'created_by:text']
  },
  DB_LOG: {
    L_AUDIT: ['audit_id:text', 'at:datetime', 'user_id:text', 'action:text', 'db:text', 'table_name:text',
      'record_key:text', 'before_json:json', 'after_json:json', 'reason:text', 'request_id:text'],
    L_JOB: ['job_id:text', 'run_id:text', 'stage:text', 'status:text', 'started_at:datetime',
      'finished_at:datetime', 'processed:num', 'errors:num', 'message:text', 'trigger:text'],
    L_ACCESS: ['access_id:text', 'at:datetime', 'user_id:text', 'action:text', 'target:text',
      'result:text', 'detail:text']
  }
};

/** 원천 파일 형식 (CSV, UTF-8, 첫 줄 헤더, 마지막 줄 #CONTROL,행수,금액합계) */
var SOURCE_SPEC = {
  SALES: {
    prefix: 'SALES_', table: 'R_SALES',
    cols: ['source_txn_no', 'line_no', 'txn_date', 'wholesaler_id', 'category', 'amount', 'txn_type',
      'correction_type', 'orig_txn_no'],
    key: ['source_txn_no', 'line_no'], dateField: 'txn_date', amountField: 'amount',
    onConflict: 'REJECT'   // 같은 키 다른 내용 = 거부 (정정은 새 거래번호로)
  },
  RECEIPT: {
    prefix: 'RECEIPT_', table: 'R_RECEIPT',
    cols: ['source_receipt_no', 'receipt_date', 'posted_date', 'wholesaler_id', 'amount', 'receipt_type'],
    key: ['source_receipt_no'], dateField: 'posted_date', amountField: 'amount',
    onConflict: 'REJECT'
  },
  AR_BAL: {
    prefix: 'AR_BAL_', table: 'R_AR_BAL',
    cols: ['base_date', 'wholesaler_id', 'balance', 'overdue_amount', 'max_overdue_days'],
    key: ['base_date', 'wholesaler_id'], dateField: 'base_date', amountField: 'balance',
    onConflict: 'REVISE'   // 같은 키 다른 내용 = 수정본으로 적재, 최신 배치 우선
  }
};

/**
 * 운영 기준값 기본(가정값). 실제 값은 드라이브의 DB_MASTER.M_SETTING 에서 관리자가 입력한다.
 * 코드에는 회사 내부 기준을 두지 않는다. 여기 값은 모두 is_assumed=true 로 적재된다.
 */
var SETTING_DEFAULTS = [
  ['S01_DROP_PCT', '30', '회전율 저하: 직전 3개월 대비 하락률 기준', '%'],
  ['S01_MIN_DAYS', '20', '회전율 저하: 회수일수 최소 기준', '일'],
  ['S02_RATIO', '1.3', '미수금 증가: 최근 3개월 평균 잔액 대비 배수', '배'],
  ['S02_MIN_AMOUNT', '10000000', '미수금 증가: 최소 증가액', '원'],
  ['S03_LONG_DAYS', '30', '연체 장기화: 연체일수 기준', '일'],
  ['S04_YOY_PCT', '-40', '구매 급감: 전년 동월(동일 경과일) 대비', '%'],
  ['S04_MA3_PCT', '-30', '구매 급감: 직전 3개월 평균 대비', '%'],
  ['S04_MARKET_GAP_PP', '-20', '구매 급감: 부류 전체 증감률과의 차이', '%p'],
  ['S05_WARN_PCT', '80', '한도 사용률 주의', '%'],
  ['S05_ALERT_PCT', '95', '한도 사용률 경고', '%'],
  ['S06_DAYS', '60', '담보·보증 기한 도래 표시', '일'],
  ['S07_MIN_SIGNALS', '2', '복수 징후: 동시 신호 수', '개'],
  ['RESOLVE_MISS_N', '5', '신호 해소: 연속 미충족 판정 횟수', '회'],
  ['RECURRENCE_DAYS', '90', '재발 판단 기간(종결 후)', '일'],
  ['SLA_TREND_DAYS', '3', '동향 확인 기한', '경매일'],
  ['SLA_ACTION_DAYS', '5', '조치 등록 기한', '경매일'],
  ['SLA_APPROVAL_DAYS', '3', '승인 기한', '경매일'],
  ['RECHECK_DAYS', '30', '종결 후 재점검일 기본값', '일'],
  ['TURNOVER_WINDOW_DAYS', '91', '회전율 집계기간(롤링)', '일'],
  ['NEW_WS_MONTHS', '12', '신규 중도매인 판단(거래 개월 미만)', '개월'],
  ['LIMIT_COMBINE', '미확인', '적용 한도 산정: 미확인 | 기본한도만 | 기본+추가 | 전체합산 (내부 규정 확인 후 입력)', ''],
  ['LIMIT_BASE_AMOUNT', '미수잔액', '한도 산정 대상 채권: 미수잔액 | (내부 규정 확인 후 입력)', ''],
  ['OVERDUE_DEFINITION', '원천값', '연체 정의: 원천값(원천 제공 연체금액·일수 사용) | (내부 규정 확인 후 입력)', ''],
  ['CATEGORY_AR_SPLIT', '불가', '부류별 채권 배분: 불가 | 가능(배분 근거 문서 번호)', ''],
  ['APPROVER_ROLE', 'ADMIN', '조치·종결 승인 역할(ADMIN | CREDIT_LEAD 등 사용자 역할)', ''],
  ['MATRIX_X_MODE', '전년동월증감', '4분면 가로축: 전년동월증감(전년 동월 대비 실적 증감률, 경계 0%) | 당기중앙값(최근 12개월 구매금액)', ''],
  ['MATRIX_Y_MODE', '전년고정', '4분면 세로축(회전율) 경계: 당기중앙값 | 전년고정(MATRIX_Y_FIXED) | 목표값(MATRIX_Y_FIXED)', ''],
  ['MATRIX_Y_FIXED', '', '4분면 세로축 고정 경계값(회전율, 회). 비어 있으면 당기중앙값으로 대체. "기준선 재산정"으로 전년 연간 중앙값 채움', '회'],
  ['MATRIX_Y_FIXED_SOURCE', '', '세로축 고정값 출처(자동 산정 일시 또는 내부 목표 근거)', ''],
  ['BACKTEST_SAMPLE_DAYS', '5', '백테스트 표본 간격(경매일마다 → 5면 5경매일마다 판정)', '경매일'],
  ['BACKTEST_LEAD_MAX_DAYS', '90', '백테스트: 사안 발생 전 최대 몇 일 이내 신호를 "사전 포착"으로 볼지', '일'],
  ['BACKTEST_HORIZON_DAYS', '90', '백테스트: 신호 후 몇 일 이내 사안 발생을 "적중"으로 볼지', '일'],
  ['METRIC_KEEP_DAYS', '45', '지표 스냅샷 보존: 최근 N일은 매 기준일, 그 이전은 월말 경매일만 보존', '일'],
  ['NOTIFY_EMAIL', '아니오', '일일 요약 이메일 발송: 예 | 아니오 (금액·개인정보 미포함, 건수와 관리건ID만)', ''],
  ['AI_ENABLED', '아니오', '자유 질의응답 AI 사용: 예 | 아니오. "예"로 바꾸려면 AI_ORG_APPROVED=예 가 먼저 필요', ''],
  ['AI_ORG_APPROVED', '미확인', '조직의 외부 AI 사용 승인 여부: 미확인 | 예 | 아니오 (생성형 AI 보안서약서·클라우드 기준 확인 결과)', ''],
  ['AI_DATA_SCOPE', '매뉴얼본문만', 'AI에 제공하는 데이터 범위: 매뉴얼본문만 | 매뉴얼+익명수치 (중도매인 식별정보는 어떤 경우에도 제외)', ''],
  ['AI_PROVIDER_NOTE', '', 'AI 서비스·비용·계약 확인 메모(서비스명, 단가, 데이터 보존 조건)', ''],
  ['AUTH_MODE', 'google', '사용자 확인 방식: google(같은 Workspace 도메인 계정 식별) | code(관리자가 발급한 개인 접속코드로 로그인. 개인 Gmail·카톡 링크 배포용)', ''],
  ['SESSION_HOURS', '12', '접속코드 방식 로그인 유지 시간', '시간'],
  ['LOGIN_MAX_FAIL', '5', '접속코드 연속 실패 허용 횟수(초과 시 15분 잠금)', '회'],
  ['NH_AUTO_REGISTER_WS', '예', '농협 실적 파일에 있는 미등록 중도매인을 자동 등록: 예 | 아니오(거부 행으로 남김)', ''],
  ['SNAPSHOT_ENABLED', '예', '정기 처리 후 배포용 스냅샷 HTML 생성(40_배포 폴더): 예 | 아니오', ''],
  ['SNAPSHOT_EMAIL', '아니오', '스냅샷 HTML을 담당자 이메일로 첨부 발송: 예 | 아니오 (사내망 전달용. 금액 포함 파일이므로 조직 기준 확인 후)', ''],
  ['SNAPSHOT_FREQ', '주간', '스냅샷 생성 주기: 주간 | 일간', ''],
  ['SNAPSHOT_WEEKDAY', '1', '주간 스냅샷 생성 요일(0=일 … 6=토). 정기 처리가 이 요일에 돌 때 생성', ''],
  ['CHECKLIST_HIGH_SCORE', '4', '체크리스트 "예" 가중 합계(총 15)가 이 값 이상이면 "연체 가능성 높음" 제안(가정값)', '점']
];

/** 이상징후 체크리스트 기본 항목(가정). 중도매인 대면·경매 현장에서 확인할 수 있는 것만. 현업 확인 후 M_CHECKLIST 에서 수정 */
var CHECKLIST_SEED = [
  // [구분, 현장에서 확인할 내용, 가중치]  — 금융권 조기경보 항목(결제·경영진·인력·신용·자금) + 청과 도매(중도매인) 특성 반영. 가중치는 가정
  ['인력', '종업원·배송 인력이 줄었거나 경리·판매 담당 등 핵심 직원이 그만뒀다 (매출·수익 감소의 강한 신호)', 2],
  ['결제', '결제일 연기·분할·부분 결제를 요청했거나, 결제 약속을 어긴 적이 있다', 2],
  ['결제', '결제 수단이 바뀌었다 (현금→어음·카드·소액 분할, 제3자 명의 입금 등)', 1],
  ['거래', '경매 참여 횟수가 줄었거나 낙찰 물량·단가가 평소 패턴과 다르게 급감·저가 위주로 바뀌었다', 1],
  ['거래', '주요 납품처(마트·식당·소매) 이탈·축소가 있거나 "거래처에서 돈을 못 받고 있다"고 호소한다', 1],
  ['현장', '점포·창고 재고가 비정상적으로 줄었거나, 차량·설비를 줄이거나 팔았거나, 운영 시간이 짧아졌다', 1],
  ['대표자', '대표자가 연락을 피하거나 현장 부재가 잦고, 건강·가정·소송·경영권 분쟁 등 사정이 확인됐다', 2],
  ['신용', '타 금융기관 연체, 세금 체납, 압류·가압류 통지, 담보 부동산 처분·추가 설정 소식이 있다', 2],
  ['자금', '선지급·외상한도 증액·결제 유예를 급히 요청하거나, 사채·고금리 자금을 쓰는 정황이 있다', 2],
  ['관계', '다른 공판장·도매시장으로 거래를 옮기거나, 다른 중도매인 명의로 거래하는 정황이 있다', 1]
];

var MATRIX_QUADRANTS = {
  HH: { code: 'HH', label: '핵심 유지군', desc: '실적 증가·회전율 높음' },
  HL: { code: 'HL', label: '집중 점검군', desc: '실적 증가·회전율 낮음 (거래는 늘고 회수는 느림)' },
  LH: { code: 'LH', label: '육성 검토군', desc: '실적 감소·회전율 높음' },
  LL: { code: 'LL', label: '개별 진단군', desc: '실적 감소·회전율 낮음' }
};
var MATRIX_DISCLAIMER = '이 분류는 관리 우선순위를 찾기 위한 참고 자료이며, 신용등급이나 거래제한 기준이 아닙니다. 신호·조치 판단에 자동으로 연결되지 않습니다.';

var SIGNAL_RULES = {
  S01: { label: '미수금 회전율 저하', family: '회수', severity: '주의' },
  S02: { label: '미수금 증가', family: '회수', severity: '주의' },
  S03: { label: '연체 발생·장기화', family: '회수', severity: '경고' },
  S04: { label: '구매실적 급감', family: '거래', severity: '주의' },
  S05: { label: '한도 사용률 상승', family: '회수', severity: '주의' },
  S06: { label: '담보·보증 기한 도래', family: '기한', severity: '정보' },
  S07: { label: '복수 징후 동시 발생', family: '복합', severity: '경고' }
};

var CASE_STATUS = ['접수', '동향확인중', '확인완료', '조치진행', '승인대기', '재점검대기', '종결'];
var RESULT_CLASSES = ['일시적 변화', '지속 관찰', '채권 검토 필요', '판정 보류(자료 부족)'];
var ACTION_TYPES = [   // [확인 필요] 내부 조치 유형 목록으로 교체. needsApproval 은 거래제한·한도변경은 항상 true
  { type: '결제 독려', needsApproval: false },
  { type: '결제계획 확인', needsApproval: false },
  { type: '추가 담보 요청', needsApproval: true },
  { type: '한도 조정 요청', needsApproval: true },
  { type: '거래 조건 변경 요청', needsApproval: true },
  { type: '거래 제한 요청', needsApproval: true },
  { type: '기타', needsApproval: false }
];

/* ══════════════ Logic.gs ══════════════ */
/**
 * Logic.gs — 공통 업무 로직 (순수 함수)
 * Google 서비스를 호출하지 않는다. 날짜는 모두 'yyyy-MM-dd' 문자열로 다룬다.
 * 같은 산식·판정을 화면·정기 처리·테스트가 함께 쓰도록 이 파일에만 둔다.
 */

/* ───────────── 날짜 ───────────── */

function ymdToUtc_(ymd) {
  var p = String(ymd).split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function utcToYmd_(ms) {
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
function addDays_(ymd, n) { return utcToYmd_(ymdToUtc_(ymd) + n * 86400000); }
function daysBetween_(a, b) { return Math.round((ymdToUtc_(b) - ymdToUtc_(a)) / 86400000); }
function ymOf_(ymd) { return String(ymd).substring(0, 7); }
function dowOf_(ymd) { return new Date(ymdToUtc_(ymd)).getUTCDay(); }
function addMonths_(ym, n) {
  var y = +ym.substring(0, 4), m = +ym.substring(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
  return y + '-' + (m < 10 ? '0' : '') + m;
}
function monthEnd_(ym) { return addDays_(addMonths_(ym, 1) + '-01', -1); }
function isYmd_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  return utcToYmd_(ymdToUtc_(s)) === s;
}
function dateRange_(from, to) {
  var out = [];
  for (var d = from; d <= to; d = addDays_(d, 1)) out.push(d);
  return out;
}

/* ───────────── 해시 (변경 감지용, 보안 목적 아님) ───────────── */

function fnv1a_(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* ───────────── CSV ───────────── */

function parseCsv_(text) {
  text = String(text).replace(/^﻿/, '');
  var rows = [], row = [], field = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
}

function toCsvLine_(arr) {
  return arr.map(function (v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

function detectSource_(fileName) {
  var n = String(fileName).toUpperCase();
  for (var k in SOURCE_SPEC) if (n.indexOf(SOURCE_SPEC[k].prefix) === 0) return k;
  return null;
}

/* ───────────── 가져오기 검증 ───────────── */

/**
 * 원천 파일 1개를 검증·분류한다.
 * @param text 파일 내용
 * @param source SALES | RECEIPT | AR_BAL
 * @param ctx { wholesalerIds: {id:true}, existing: {row_key: content_hash} }  existing 은 이 함수가 갱신한다
 * @return {accepted[], duplicates, revisions, rejects[], control, controlResult, dateFrom, dateTo, acceptedAmount, rowCount}
 */
function validateImport_(text, source, ctx) {
  var spec = SOURCE_SPEC[source];
  var lines = parseCsv_(text);
  var res = { accepted: [], duplicates: 0, revisions: 0, rejects: [], control: null,
    controlResult: '', dateFrom: '', dateTo: '', acceptedAmount: 0, rowCount: 0, fatal: '' };
  if (!lines.length) { res.fatal = '빈 파일'; return res; }

  var header = lines[0].map(function (h) { return String(h).trim(); });
  var missing = spec.cols.filter(function (c) { return header.indexOf(c) < 0; });
  if (missing.length) { res.fatal = '헤더 누락: ' + missing.join(', '); return res; }

  var seenInFile = {};
  for (var i = 1; i < lines.length; i++) {
    var ln = lines[i];
    if (String(ln[0]).trim() === '#CONTROL') {
      res.control = { rows: Number(ln[1]), amount: Number(ln[2]) };
      continue;
    }
    res.rowCount++;
    var o = {};
    header.forEach(function (h, j) { o[h] = ln[j] === undefined ? '' : String(ln[j]).trim(); });
    var err = validateRow_(source, o, ctx);
    if (err) { res.rejects.push({ line: i + 1, code: err[0], msg: err[1], raw: toCsvLine_(ln) }); continue; }

    var rec = normalizeRow_(source, o);
    rec.row_key = spec.key.map(function (k) { return rec[k]; }).join('|');
    rec.content_hash = fnv1a_(spec.cols.map(function (k) { return rec[k]; }).join('|'));

    if (seenInFile[rec.row_key]) {
      res.rejects.push({ line: i + 1, code: 'DUP_IN_FILE', msg: '같은 파일 안에 같은 키가 중복됨: ' + rec.row_key, raw: toCsvLine_(ln) });
      continue;
    }
    seenInFile[rec.row_key] = true;

    var prev = ctx.existing[rec.row_key];
    if (prev !== undefined) {
      if (prev === rec.content_hash) { res.duplicates++; continue; }   // 이미 적재된 같은 자료
      if (spec.onConflict === 'REJECT') {
        res.rejects.push({ line: i + 1, code: 'KEY_CONFLICT',
          msg: '이미 적재된 키의 내용이 다름(정정은 새 거래번호로 보내야 함): ' + rec.row_key, raw: toCsvLine_(ln) });
        continue;
      }
      rec.is_revision = true;
      res.revisions++;
    } else if (source === 'AR_BAL') rec.is_revision = false;

    ctx.existing[rec.row_key] = rec.content_hash;
    res.accepted.push(rec);
    res.acceptedAmount += Number(rec[spec.amountField]);
    var d = rec[spec.dateField];
    if (!res.dateFrom || d < res.dateFrom) res.dateFrom = d;
    if (!res.dateTo || d > res.dateTo) res.dateTo = d;
  }

  // 관리 합계 대조: 원천이 보낸 행 수·금액 합계 vs 이 파일에서 실제로 읽은 행 수·금액 합계
  // (전송 중 잘림·누락 확인용. 거부·중복 행도 원천 합계에는 포함되므로 읽은 값 전체와 비교)
  if (!res.control) res.controlResult = '관리합계없음';
  else {
    var amtIdx = header.indexOf(spec.amountField), readAmount = 0;
    for (var r = 1; r < lines.length; r++) {
      if (String(lines[r][0]).trim() === '#CONTROL') continue;
      readAmount += Number(lines[r][amtIdx]) || 0;
    }
    var fileOk = res.control.rows === res.rowCount && Math.abs(res.control.amount - readAmount) < 0.5;
    res.controlResult = fileOk ? (res.rejects.length ? '파일일치·일부거부' : '일치') : '불일치';
  }
  return res;
}

function validateRow_(source, o, ctx) {
  var num = function (v) { return v !== '' && isFinite(Number(v)); };
  if (!ctx.wholesalerIds[o.wholesaler_id]) return ['UNKNOWN_WS', '기초자료에 없는 중도매인코드: ' + o.wholesaler_id];
  if (source === 'SALES') {
    if (!o.source_txn_no) return ['REQUIRED', '거래번호 없음'];
    if (!isYmd_(o.txn_date)) return ['BAD_DATE', '거래일 형식 오류: ' + o.txn_date];
    if (APP.CATEGORIES.indexOf(o.category) < 0) return ['BAD_CATEGORY', '부류 오류: ' + o.category];
    if (!num(o.amount)) return ['BAD_AMOUNT', '금액 오류: ' + o.amount];
    if (['현금', '외상', '미구분'].indexOf(o.txn_type) < 0) return ['BAD_TXN_TYPE', '거래구분 오류(현금/외상/미구분): ' + o.txn_type];
    var ct = o.correction_type || '정상';
    if (['정상', '반품', '취소', '정정'].indexOf(ct) < 0) return ['BAD_CORRECTION', '정정구분 오류: ' + ct];
    if (ct === '정상' && Number(o.amount) < 0) return ['NEGATIVE_AMOUNT', '정상 거래의 음수 금액'];
    if (ct !== '정상' && !o.orig_txn_no) return ['ORIG_REQUIRED', '반품·취소·정정은 원거래번호 필요'];
  } else if (source === 'RECEIPT') {
    if (!o.source_receipt_no) return ['REQUIRED', '입금번호 없음'];
    if (!isYmd_(o.receipt_date) || !isYmd_(o.posted_date)) return ['BAD_DATE', '입금일·반영일 형식 오류'];
    if (o.posted_date < o.receipt_date) return ['BAD_DATE', '반영일이 입금일보다 빠름'];
    if (!num(o.amount)) return ['BAD_AMOUNT', '금액 오류: ' + o.amount];
  } else if (source === 'AR_BAL') {
    if (!isYmd_(o.base_date)) return ['BAD_DATE', '기준일 형식 오류: ' + o.base_date];
    if (!num(o.balance)) return ['BAD_AMOUNT', '잔액 오류: ' + o.balance];
    if (o.overdue_amount !== '' && !num(o.overdue_amount)) return ['BAD_AMOUNT', '연체금액 오류'];
    if (o.max_overdue_days !== '' && !num(o.max_overdue_days)) return ['BAD_AMOUNT', '연체일수 오류'];
  }
  return null;
}

function normalizeRow_(source, o) {
  var r = {};
  SOURCE_SPEC[source].cols.forEach(function (c) { r[c] = o[c]; });
  if (source === 'SALES') {
    r.amount = Number(r.amount);
    r.correction_type = r.correction_type || '정상';
    r.line_no = r.line_no || '1';
  } else if (source === 'RECEIPT') {
    r.amount = Number(r.amount);
  } else if (source === 'AR_BAL') {
    r.balance = Number(r.balance);
    r.overdue_amount = r.overdue_amount === '' ? 0 : Number(r.overdue_amount);
    r.max_overdue_days = r.max_overdue_days === '' ? 0 : Number(r.max_overdue_days);
  }
  return r;
}

/* ───────────── 집계·데이터 품질 ───────────── */

/** 같은 (중도매인, 기준일) 잔액이 여러 번 들어오면 나중에 적재된 행을 쓴다 */
function latestArRows_(arRows) {
  var m = {};
  arRows.forEach(function (r) { m[r.wholesaler_id + '|' + r.base_date] = r; });
  return Object.keys(m).map(function (k) { return m[k]; });
}

/**
 * 원천 자료로 일·월 집계와 데이터 품질 점검 결과를 만든다.
 * @param p { sales, receipts, arRows, calendar:[{date,is_auction_day}], wholesalers, statusHist, calcRunId, today }
 */
function buildAggregates_(p) {
  var calc = p.calcRunId, ALL = APP.ALL;
  var ar = latestArRows_(p.arRows);
  var daily = {}, monthly = {}, issues = [];
  function dkey(ws, d, c) { return ws + '|' + d + '|' + c; }
  function drow(ws, d, c) {
    var k = dkey(ws, d, c);
    if (!daily[k]) daily[k] = { wholesaler_id: ws, date: d, category: c, purchase_amount: 0, credit_sales: 0,
      cash_sales: 0, correction_amount: 0, receipts: 0, ar_balance: '', overdue_amount: '', max_overdue_days: '', calc_run_id: calc };
    return daily[k];
  }
  function mrow(ws, ym, c) {
    var k = ws + '|' + ym + '|' + c;
    if (!monthly[k]) monthly[k] = { wholesaler_id: ws, ym: ym, category: c, purchase_amount: 0, purchase_days: 0,
      auction_days: 0, credit_sales: 0, cash_sales: 0, receipts: '', month_end_balance: '', avg_daily_balance: '',
      avg_method: '', calc_run_id: calc, _days: {} };
    return monthly[k];
  }

  // 원거래일 조회표 (반품·취소의 월 귀속용)
  var origDate = {};
  p.sales.forEach(function (s) { if (s.correction_type === '정상') origDate[s.source_txn_no] = s.txn_date; });

  // 판매: 일 집계는 전기일, 월 집계는 원거래일 귀속
  p.sales.forEach(function (s) {
    var amt = Number(s.amount), credit = s.txn_type === '외상', cash = s.txn_type === '현금';   // 미구분은 구매금액에만 반영
    [s.category, ALL].forEach(function (c) {
      var r = drow(s.wholesaler_id, s.txn_date, c);
      r.purchase_amount += amt;
      if (credit) r.credit_sales += amt; else if (cash) r.cash_sales += amt;
      if (s.correction_type !== '정상') r.correction_amount += amt;
    });
    var attr = s.txn_date;
    if (s.correction_type !== '정상') {
      if (origDate[s.orig_txn_no]) attr = origDate[s.orig_txn_no];
      else issues.push({ wholesaler_id: s.wholesaler_id, date: s.txn_date, status: '경고', reason_code: 'ORIG_NOT_FOUND',
        detail: '원거래 ' + s.orig_txn_no + ' 없음 → 처리일 월로 집계', calc_run_id: calc });
    }
    [s.category, ALL].forEach(function (c) {
      var m = mrow(s.wholesaler_id, ymOf_(attr), c);
      m.purchase_amount += amt;
      if (credit) m.credit_sales += amt; else if (cash) m.cash_sales += amt;
      if (s.correction_type === '정상' && amt > 0) m._days[s.txn_date] = true;
    });
  });

  // 월 합계만 있는 달(농협 월별 사업실적): 그 달에 일별 자료가 없을 때만 전체 부류 월 집계로 쓴다
  (p.salesMonthly || []).forEach(function (r) {
    var has = Object.keys(monthly).some(function (k) { return k.indexOf(r.wholesaler_id + '|' + r.ym + '|') === 0; });
    if (has) return;
    var m = mrow(r.wholesaler_id, r.ym, ALL);
    m.purchase_amount += Number(r.amount) || 0;
    m.avg_method = 'MONTHLY_ONLY';   // 구매일수·부류별 구성비 산출 불가 표시
  });

  // 입금: 반영일 기준
  var receiptsByWs = {};
  p.receipts.forEach(function (r) {
    drow(r.wholesaler_id, r.posted_date, ALL).receipts += Number(r.amount);
    var m = mrow(r.wholesaler_id, ymOf_(r.posted_date), ALL);
    m.receipts = (m.receipts === '' ? 0 : m.receipts) + Number(r.amount);
    (receiptsByWs[r.wholesaler_id] = receiptsByWs[r.wholesaler_id] || []).push(r);
  });

  // 잔액
  var arByWs = {};
  ar.forEach(function (a) {
    var r = drow(a.wholesaler_id, a.base_date, ALL);
    r.ar_balance = Number(a.balance);
    r.overdue_amount = Number(a.overdue_amount) || 0;
    r.max_overdue_days = Number(a.max_overdue_days) || 0;
    (arByWs[a.wholesaler_id] = arByWs[a.wholesaler_id] || []).push(a);
  });

  // 경매일
  var auction = {}, auctionDaysByYm = {};
  p.calendar.forEach(function (c) {
    if (c.is_auction_day) {
      auction[c.date] = true;
      auctionDaysByYm[ymOf_(c.date)] = (auctionDaysByYm[ymOf_(c.date)] || 0) + 1;
    }
  });
  var latestBase = ar.reduce(function (mx, a) { return a.base_date > mx ? a.base_date : mx; }, '');
  var dataStart = ar.reduce(function (mn, a) { return !mn || a.base_date < mn ? a.base_date : mn; }, '');

  // 1) 잔액 연속성: 전일잔액 + 외상순증 − 입금 = 당일잔액
  var creditPosted = {}, receiptPosted = {};
  p.sales.forEach(function (s) {
    if (s.txn_type !== '외상') return;
    var k = s.wholesaler_id + '|' + s.txn_date;
    creditPosted[k] = (creditPosted[k] || 0) + Number(s.amount);
  });
  p.receipts.forEach(function (r) {
    var k = r.wholesaler_id + '|' + r.posted_date;
    receiptPosted[k] = (receiptPosted[k] || 0) + Number(r.amount);
  });
  Object.keys(arByWs).forEach(function (ws) {
    var list = arByWs[ws].slice().sort(function (a, b) { return a.base_date < b.base_date ? -1 : 1; });
    for (var i = 1; i < list.length; i++) {
      var prev = list[i - 1], cur = list[i], expected = Number(prev.balance);
      for (var d = addDays_(prev.base_date, 1); d <= cur.base_date; d = addDays_(d, 1)) {
        expected += (creditPosted[ws + '|' + d] || 0) - (receiptPosted[ws + '|' + d] || 0);
      }
      var diff = Number(cur.balance) - expected;
      if (Math.abs(diff) >= 0.5) {
        issues.push({ wholesaler_id: ws, date: cur.base_date, status: '불일치', reason_code: 'ROLLFWD_MISMATCH',
          detail: '잔액 연속성 차이 ' + diff + '원 (전일잔액+외상−입금=' + expected + ', 원천잔액=' + cur.balance + ')',
          calc_run_id: calc });
      }
    }
  });

  // 2) 잔액 누락: 영업 중(폐업 아님)이고 거래 시작 이후인 경매일에 잔액이 없으면 누락
  var arSet = {};
  ar.forEach(function (a) { arSet[a.wholesaler_id + '|' + a.base_date] = true; });
  if (dataStart) {
    p.wholesalers.forEach(function (w) {
      var from = w.trade_start_date && w.trade_start_date > dataStart ? w.trade_start_date : dataStart;
      for (var d = from; d <= latestBase; d = addDays_(d, 1)) {
        if (!auction[d] || arSet[w.wholesaler_id + '|' + d]) continue;
        var st = statusOn_(p.statusHist, w.wholesaler_id, d);
        if (st === '폐업') continue;
        issues.push({ wholesaler_id: w.wholesaler_id, date: d, status: '누락', reason_code: 'AR_MISSING',
          detail: '경매일 잔액 자료 없음', calc_run_id: calc });
      }
    });
  }

  // 월 집계 마무리: 구매일수·경매일수·월말잔액·일평균잔액
  var arDaily = {};
  ar.forEach(function (a) { arDaily[a.wholesaler_id + '|' + a.base_date] = Number(a.balance); });
  Object.keys(monthly).forEach(function (k) {
    var m = monthly[k];
    m.purchase_days = m.avg_method === 'MONTHLY_ONLY' ? '' : Object.keys(m._days).length;
    m.auction_days = auctionDaysByYm[m.ym] || 0;
    delete m._days;
  });
  Object.keys(arByWs).forEach(function (ws) {
    var list = arByWs[ws].map(function (a) { return a.base_date; }).sort();
    var first = list[0];
    var ymFrom = ymOf_(first), ymTo = ymOf_(latestBase);
    var carry = null;
    for (var ym = ymFrom; ym <= ymTo; ym = addMonths_(ym, 1)) {
      var end = monthEnd_(ym) < latestBase ? monthEnd_(ym) : latestBase;
      var sum = 0, n = 0, gaps = 0, last = '';
      for (var d = ym + '-01'; d <= end; d = addDays_(d, 1)) {
        if (d < first) continue;
        var v = arDaily[ws + '|' + d];
        if (v !== undefined) { carry = v; last = v; }
        else if (auction[d]) gaps++;
        if (carry !== null) { sum += carry; n++; }
      }
      if (!n) continue;
      var m = mrow(ws, ym, ALL);
      if (m._days) { m.purchase_days = 0; m.auction_days = auctionDaysByYm[ym] || 0; delete m._days; }
      m.month_end_balance = last === '' ? carry : last;
      m.avg_daily_balance = Math.round(sum / n);
      // 방식 코드: DAILY=일별 잔액(휴장일은 직전 잔액 유지), DAILY_GAP=경매일 잔액 일부 누락 → 직전 잔액으로 대체
      m.avg_method = gaps ? 'DAILY_GAP(' + gaps + ')' : 'DAILY';
    }
  });

  return {
    daily: Object.keys(daily).map(function (k) { return daily[k]; }).sort(cmpBy_(['wholesaler_id', 'date', 'category'])),
    monthly: Object.keys(monthly).map(function (k) { return monthly[k]; }).sort(cmpBy_(['wholesaler_id', 'ym', 'category'])),
    issues: issues,
    latestBase: latestBase,
    dataStart: dataStart
  };
}

function cmpBy_(fields) {
  return function (a, b) {
    for (var i = 0; i < fields.length; i++) {
      var x = a[fields[i]], y = b[fields[i]];
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };
}

/** 기간형 이력에서 특정 일자의 영업 상태 */
function statusOn_(statusHist, ws, d) {
  var st = '';
  statusHist.forEach(function (h) {
    if (h.wholesaler_id === ws && h.valid_from <= d && d <= (h.valid_to || APP.OPEN_END)) st = h.status;
  });
  return st;
}

/**
 * 대사: 원천 합계 ↔ 시스템 집계 합계
 * @return [{item, period, source_value, system_value, diff, result, note}]
 */
function reconcile_(p, agg) {
  var out = [], ALL = APP.ALL;
  function push(item, period, src, sys, note) {
    var diff = Math.round((sys - src) * 100) / 100;
    out.push({ item: item, period: period, source_value: src, system_value: sys, diff: diff,
      result: Math.abs(diff) < 0.5 ? '일치' : '불일치', note: note || '' });
  }
  function sumBy(rows, keyFn, valFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + valFn(r); });
    return m;
  }
  var dAll = agg.daily.filter(function (r) { return r.category === ALL; });

  // 판매(전기월): 원천 ↔ 일 집계
  var rawSales = sumBy(p.sales, function (r) { return ymOf_(r.txn_date); }, function (r) { return Number(r.amount); });
  var aggSales = sumBy(dAll, function (r) { return ymOf_(r.date); }, function (r) { return r.purchase_amount; });
  Object.keys(rawSales).sort().forEach(function (ym) { push('판매금액(전기월)', ym, rawSales[ym], aggSales[ym] || 0); });

  // 판매 총액: 원천 ↔ 월 집계(원거래월 귀속이라 월별은 다를 수 있으나 총액은 같아야 함)
  var rawTotal = p.sales.reduce(function (s, r) { return s + Number(r.amount); }, 0) +
    (p.salesMonthly || []).reduce(function (s, r) { return s + (agg.monthly.some(function (m) { return m.wholesaler_id === r.wholesaler_id && m.ym === r.ym && m.avg_method === 'MONTHLY_ONLY'; }) ? Number(r.amount) : 0); }, 0);
  var monTotal = agg.monthly.filter(function (r) { return r.category === ALL; })
    .reduce(function (s, r) { return s + r.purchase_amount; }, 0);
  push('판매금액 총액(월집계)', '전체', rawTotal, monTotal, '월 집계는 반품·취소를 원거래월로 귀속');

  // 부류 합 = 전체 (월 집계)
  var catSum = sumBy(agg.monthly.filter(function (r) { return r.category !== ALL; }),
    function (r) { return r.ym; }, function (r) { return r.purchase_amount; });
  var allSum = sumBy(agg.monthly.filter(function (r) { return r.category === ALL && r.avg_method !== 'MONTHLY_ONLY'; }),   // 월 합계만 있는 달은 부류 구분이 없어 제외
    function (r) { return r.ym; }, function (r) { return r.purchase_amount; });
  var badCat = Object.keys(allSum).filter(function (ym) { return Math.abs((catSum[ym] || 0) - allSum[ym]) >= 0.5; });
  push('부류합계=전체(월)', '전체', Object.keys(allSum).length, Object.keys(allSum).length - badCat.length,
    badCat.length ? '불일치 월: ' + badCat.join(',') : '');

  // 입금(반영월)
  var rawRc = sumBy(p.receipts, function (r) { return ymOf_(r.posted_date); }, function (r) { return Number(r.amount); });
  var aggRc = sumBy(dAll, function (r) { return ymOf_(r.date); }, function (r) { return r.receipts; });
  Object.keys(rawRc).sort().forEach(function (ym) { push('입금금액(반영월)', ym, rawRc[ym], aggRc[ym] || 0); });

  // 미수 잔액: 월말 경매일·최신 기준일
  var ar = latestArRows_(p.arRows);
  var rawBal = sumBy(ar, function (r) { return r.base_date; }, function (r) { return Number(r.balance); });
  var aggBal = sumBy(dAll.filter(function (r) { return r.ar_balance !== ''; }),
    function (r) { return r.date; }, function (r) { return r.ar_balance; });
  var lastOfMonth = {};
  Object.keys(rawBal).forEach(function (d) {
    var ym = ymOf_(d);
    if (!lastOfMonth[ym] || d > lastOfMonth[ym]) lastOfMonth[ym] = d;
  });
  Object.keys(lastOfMonth).sort().forEach(function (ym) {
    var d = lastOfMonth[ym];
    push('미수잔액 합계', d, rawBal[d], aggBal[d] || 0);
  });

  // 잔액 연속성 위반 건수 (0이어야 일치)
  var rf = agg.issues.filter(function (i) { return i.reason_code === 'ROLLFWD_MISMATCH'; }).length;
  push('잔액 연속성 위반 건수', '전체', 0, rf, '전일잔액+외상−입금=당일잔액');
  return out;
}

/**
 * 전체 데이터 상태 판정. 자료가 불완전하면 '정상'으로 표시하지 않는다.
 * @param p { latestBase, expectedBase, issuesOnLatest, reconFail, lastBatchProblem }
 */
function overallDataStatus_(p) {
  var reasons = [];
  if (!p.latestBase) return { status: '자료없음', reasons: ['적재된 잔액 자료 없음'] };
  if (p.expectedBase && p.latestBase < p.expectedBase) reasons.push('지연: 최신 기준일 ' + p.latestBase + ' < 예정 ' + p.expectedBase);
  if (p.issuesOnLatest) reasons.push('최신 기준일 데이터 이상 ' + p.issuesOnLatest + '건');
  if (p.reconFail) reasons.push('대사 불일치 ' + p.reconFail + '건');
  if (p.lastBatchProblem) reasons.push('최근 가져오기 문제: ' + p.lastBatchProblem);
  var status = '정상';
  if (reasons.length) status = p.reconFail || p.issuesOnLatest ? '불일치' : (p.lastBatchProblem ? '오류' : '지연');
  return { status: status, reasons: reasons };
}

/** 기준일 직전의 마지막 경매일(오늘 제외) = 오늘 아침 기준 예정 기준일 */
function expectedBaseDate_(calendar, today) {
  var best = '';
  calendar.forEach(function (c) { if (c.is_auction_day && c.date < today && c.date > best) best = c.date; });
  return best;
}

/* ───────────── 유효기간형 버전 ───────────── */

/**
 * 기준일에 유효한 승인 버전만 고른다. 같은 ID에 겹치는 승인 버전이 있으면 가장 높은 version_no.
 */
function asOfVersions_(rows, idField, wsId, asOf) {
  var best = {};
  rows.forEach(function (r) {
    if (wsId && r.wholesaler_id !== wsId) return;
    if (r.approval_status !== '승인' || r.is_deleted) return;
    if (!(r.valid_from <= asOf && asOf <= (r.valid_to || APP.OPEN_END))) return;
    var id = r[idField];
    if (!best[id] || Number(r.version_no) > Number(best[id].version_no)) best[id] = r;
  });
  return Object.keys(best).sort().map(function (k) { return best[k]; });
}

/**
 * 새 버전을 승인할 때 직전 승인 버전의 종료일을 정한다.
 * @return [{row, newValidTo}] 수정이 필요한 이전 버전 목록
 */
function closePreviousVersions_(rows, idField, newRow) {
  var out = [];
  rows.forEach(function (r) {
    if (r[idField] !== newRow[idField] || r.approval_status !== '승인') return;
    if (Number(r.version_no) === Number(newRow.version_no)) return;
    var to = r.valid_to || APP.OPEN_END;
    if (r.valid_from < newRow.valid_from && to >= newRow.valid_from) {
      out.push({ row: r, newValidTo: addDays_(newRow.valid_from, -1) });
    }
  });
  return out;
}

/* ───────────── 권한 ───────────── */

var PERMS = {
  'home.view': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'ws.view': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'ws.viewContacts': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'ws.viewGuarantorPII': ['CREDIT', 'ADMIN'],
  'ws.viewHistory': ['CREDIT', 'ADMIN'],
  'ws.viewEvidence': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'master.edit': ['CREDIT', 'ADMIN'],
  'master.approve': ['ADMIN'],
  'evidence.upload': ['CREDIT', 'ADMIN'],
  'user.manage': ['ADMIN'],
  'import.view': ['CREDIT', 'ADMIN'],
  'import.run': ['ADMIN'],
  'audit.view': ['ADMIN'],
  'work.view': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'trend.write': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'signal.flag': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'case.manage': ['CREDIT', 'ADMIN'],
  'approval.decide': ['ADMIN'],
  'form.draft': ['AUCTIONEER', 'CREDIT', 'ADMIN'],
  'form.blank': ['AUCTIONEER', 'CREDIT', 'ADMIN', 'VIEWER'],
  'settings.edit': ['ADMIN'],
  'docs.manage': ['ADMIN']
};

function can_(role, action) {
  return !!(PERMS[action] && PERMS[action].indexOf(role) >= 0);
}

/** 경매사는 기준일에 유효한 담당 지정이 있는 중도매인만. 다른 역할은 전체. */
function canAccessWs_(user, wsId, assignments, onDate) {
  if (!user || !user.role) return false;
  if (user.role !== 'AUCTIONEER') return true;
  return assignments.some(function (a) {
    return a.wholesaler_id === wsId && a.user_id === user.user_id && !a.is_deleted &&
      a.valid_from <= onDate && onDate <= (a.valid_to || APP.OPEN_END);
  });
}

/** 역할에 따라 응답에서 필드를 제거한다(화면 숨김이 아니라 전송 자체를 하지 않음). */
function filter360ByRole_(view, role) {
  if (!can_(role, 'ws.viewContacts')) delete view.contacts;
  if (!can_(role, 'ws.viewGuarantorPII')) {
    delete view.guarantors;
    (view.guarantees || []).forEach(function (g) { delete g.guarantor_ref; delete g.doc_ids; });
  }
  if (!can_(role, 'ws.viewEvidence')) (view.collaterals || []).forEach(function (c) { delete c.evidence_ids; });
  if (!can_(role, 'ws.viewHistory')) delete view.history;
  return view;
}

/* ───────────── 실적 요약 (통합 상세용) ───────────── */

/**
 * 최근 n개월과 전년 대응 월 구매금액. 진행 중인 월은 '동일 경과 경매일' 기준으로 전년과 비교한다.
 */
function monthlyTrend_(monthlyRows, dailyRows, calendar, ws, baseDate, n) {
  var endYm = ymOf_(baseDate), cats = APP.CATEGORIES.concat([APP.ALL]);
  var idx = {};
  monthlyRows.forEach(function (r) { if (r.wholesaler_id === ws) idx[r.ym + '|' + r.category] = r; });
  var monthComplete = baseDate >= lastAuctionDayOfMonth_(calendar, endYm);
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var ym = addMonths_(endYm, -i), py = addMonths_(ym, -12);
    var item = { ym: ym, partial: ym === endYm && !monthComplete, byCategory: {} };
    cats.forEach(function (c) {
      var cur = idx[ym + '|' + c], prev = idx[py + '|' + c];
      item.byCategory[c] = {
        amount: cur ? cur.purchase_amount : 0,
        prevYearAmount: prev ? prev.purchase_amount : null,
        purchaseDays: cur ? cur.purchase_days : 0
      };
    });
    if (item.partial) item.mtd = mtdCompare_(dailyRows, calendar, ws, baseDate);
    out.push(item);
  }
  // 전년 대비 증감률(완결 월만)
  out.forEach(function (it) {
    cats.forEach(function (c) {
      var b = it.byCategory[c];
      b.yoy = it.partial ? null : growthRate_(b.amount, b.prevYearAmount);
    });
  });
  return out;
}

/** 월의 마지막 경매일. 경매 일정이 월말까지 등록되지 않았으면 월말일로 본다(완결 여부를 알 수 없으므로 진행 중 취급). */
function lastAuctionDayOfMonth_(calendar, ym) {
  var last = '', covered = false, end = monthEnd_(ym);
  calendar.forEach(function (c) {
    if (c.date >= end) covered = true;
    if (c.is_auction_day && ymOf_(c.date) === ym && c.date > last) last = c.date;
  });
  return covered && last ? last : end;
}

/** 구매 증감률 = 당기 ÷ 비교기간 − 1. 비교기간 0·없음이면 비교불가 */
function growthRate_(cur, prev) {
  if (prev === null || prev === undefined) return { status: '비교불가', reason: '전년 자료 없음' };
  if (Number(prev) === 0) return { status: '비교불가', reason: '전년 실적 0' };
  return { status: '정상', value: Number(cur) / Number(prev) - 1 };
}

/**
 * 월별 자료만 있을 때의 전년 동월 비교(월 합계 대 월 합계). 기준 월 행이 없으면 null.
 * mtdCompare_ 와 같은 구조를 돌려주며 elapsedAuctionDays 는 0(경매일 환산 불가).
 */
function monthlyOnlyCompare_(monthlyRows, ws, baseDate) {
  var ym = ymOf_(baseDate), pym = addMonths_(ym, -12), any = false;
  var res = { basis: '월 합계(월별 사업실적)', elapsedAuctionDays: 0, prevPeriod: pym + '-01~' + monthEnd_(pym), byCategory: {}, monthlyOnly: true };
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) {
    var cur = null, prev = null;
    (monthlyRows || []).forEach(function (r) {
      if (r.wholesaler_id !== ws || r.category !== c) return;
      if (r.ym === ym) cur = (cur || 0) + (Number(r.purchase_amount) || 0);
      else if (r.ym === pym) prev = (prev || 0) + (Number(r.purchase_amount) || 0);
    });
    if (cur !== null) any = true;
    res.byCategory[c] = { amount: cur || 0, prevAmount: prev || 0, growth: growthRate_(cur || 0, prev) };
  });
  return any ? res : null;
}

/** 진행 중인 월: 당월 경과 경매일 수 k 만큼 전년 같은 달 처음 k 경매일과 비교 */
function mtdCompare_(dailyRows, calendar, ws, baseDate) {
  var ym = ymOf_(baseDate), pym = addMonths_(ym, -12);
  var curDays = calendar.filter(function (c) { return c.is_auction_day && ymOf_(c.date) === ym && c.date <= baseDate; })
    .map(function (c) { return c.date; }).sort();
  var prevDaysAll = calendar.filter(function (c) { return c.is_auction_day && ymOf_(c.date) === pym; })
    .map(function (c) { return c.date; }).sort();
  var k = curDays.length;
  var basis = '동일 경과 경매일';
  var prevDays = prevDaysAll.slice(0, k);
  if (!prevDaysAll.length) {   // 전년 경매 일정이 없으면 달력일로 대체
    basis = '동일 달력일(경매 일정 없음)';
    prevDays = dateRange_(pym + '-01', pym + '-' + baseDate.substring(8, 10));
  }
  var curSet = {}, prevSet = {};
  curDays.forEach(function (d) { curSet[d] = true; });
  prevDays.forEach(function (d) { prevSet[d] = true; });
  var res = { basis: basis, elapsedAuctionDays: k, prevPeriod: prevDays.length ? prevDays[0] + '~' + prevDays[prevDays.length - 1] : '', byCategory: {} };
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) {
    var cur = 0, prev = 0;
    dailyRows.forEach(function (r) {
      if (r.wholesaler_id !== ws || r.category !== c) return;
      if (curSet[r.date]) cur += r.purchase_amount;
      else if (prevSet[r.date]) prev += r.purchase_amount;
    });
    res.byCategory[c] = { amount: cur, prevAmount: prev, growth: growthRate_(cur, prevDays.length ? prev : null) };
  });
  return res;
}

/* ══════════════ Db.gs ══════════════ */
/**
 * Db.gs — 저장소(Google Sheets) 접근 계층
 * - 시트는 한 번에 읽고(실행 1회당 메모리 캐시) 한 번에 쓴다.
 * - 날짜는 'yyyy-MM-dd' 문자열로 저장한다(텍스트 서식 지정 + 읽을 때 정규화).
 */

var _ssMemo = {};
var _tableMemo = {};

function prop_(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function setProp_(key, val) { PropertiesService.getScriptProperties().setProperty(key, val); }

function nowStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function uid_(prefix) {
  return prefix + Utilities.formatDate(new Date(), APP.TZ, 'yyMMddHHmmss') + '-' +
    Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
}

function openDb_(db) {
  if (_ssMemo[db]) return _ssMemo[db];
  var id = prop_('DBID_' + db);
  if (!id) throw new Error('저장소가 설정되지 않았습니다(' + db + '). 편집기에서 setupSystem 을 먼저 실행하세요.');
  _ssMemo[db] = SpreadsheetApp.openById(id);
  return _ssMemo[db];
}

function colsOf_(db, table) {
  var def = SCHEMA[db] && SCHEMA[db][table];
  if (!def) throw new Error('스키마에 없는 테이블: ' + db + '.' + table);
  return def.map(function (s) { var p = s.split(':'); return { name: p[0], type: p[1] }; });
}

function getSheet_(db, table) {
  var sh = openDb_(db).getSheetByName(table);
  if (!sh) throw new Error('시트 없음: ' + db + '.' + table + ' — setupSystem 을 다시 실행하세요.');
  return sh;
}

function toCell_(v, type) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'num': return v === '' ? '' : Number(v);
    case 'bool': return v === true || v === 'TRUE' || v === 'true';
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    case 'date': return v instanceof Date ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd') : String(v);
    case 'datetime': return v instanceof Date ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss') : String(v);
    default: return String(v);
  }
}

function fromCell_(v, type) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, APP.TZ, type === 'datetime' ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  switch (type) {
    case 'num': return v === '' || v === null ? '' : Number(v);
    case 'bool': return v === true || v === 'TRUE' || v === 'true';
    default: return v === null || v === undefined ? '' : String(v);
  }
}

/** 테이블 전체를 객체 배열로 읽는다. 각 객체에 __row(시트 행 번호)를 붙인다. */
function readTable_(db, table) {
  var k = db + '.' + table;
  if (_tableMemo[k]) return _tableMemo[k];
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var last = sh.getLastRow(), out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { __row: i + 2 };
      for (var j = 0; j < cols.length; j++) o[cols[j].name] = fromCell_(vals[i][j], cols[j].type);
      out.push(o);
    }
  }
  _tableMemo[k] = out;
  return out;
}

function invalidate_(db, table) { delete _tableMemo[db + '.' + table]; }

function objToRow_(cols, o) { return cols.map(function (c) { return toCell_(o[c.name], c.type); }); }

function ensureRows_(sh, lastRowNeeded) {
  var max = sh.getMaxRows();
  if (max < lastRowNeeded) sh.insertRowsAfter(max, lastRowNeeded - max);
}

/** 행 추가 (일괄) */
function appendObjects_(db, table, objs) {
  if (!objs.length) return;
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var start = sh.getLastRow() + 1;
  ensureRows_(sh, start + objs.length - 1);
  sh.getRange(start, 1, objs.length, cols.length).setValues(objs.map(function (o) { return objToRow_(cols, o); }));
  var memo = _tableMemo[db + '.' + table];
  if (memo) objs.forEach(function (o, i) {
    var c = {}; cols.forEach(function (col) { c[col.name] = fromCell_(toCell_(o[col.name], col.type), col.type); });
    c.__row = start + i; memo.push(c);
  });
}

/** 한 행 덮어쓰기 (객체에 __row 필요) */
function writeObject_(db, table, o) {
  if (!o.__row) throw new Error('행 번호 없음: ' + table);
  var cols = colsOf_(db, table);
  getSheet_(db, table).getRange(o.__row, 1, 1, cols.length).setValues([objToRow_(cols, o)]);
}

/** 테이블 전체 교체 (재생성 가능한 집계 테이블 전용) */
function rewriteTable_(db, table, objs) {
  var cols = colsOf_(db, table), sh = getSheet_(db, table);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (objs.length) {
    ensureRows_(sh, objs.length + 1);
    var CHUNK = 20000;
    for (var i = 0; i < objs.length; i += CHUNK) {
      var part = objs.slice(i, i + CHUNK);
      sh.getRange(2 + i, 1, part.length, cols.length).setValues(part.map(function (o) { return objToRow_(cols, o); }));
    }
  }
  invalidate_(db, table);
}

/** 스크립트 잠금 안에서 실행 (쓰기 경합·중복 생성 방지) */
var _lockDepth = 0;   // 같은 실행 안에서 중첩 호출(정기 처리 → 보고서 적재 등)은 잠금을 다시 잡지 않는다
function withLock_(fn, waitMs) {
  if (_lockDepth > 0) { _lockDepth++; try { return fn(); } finally { _lockDepth--; } }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 30000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 시도하세요.');
  _lockDepth = 1;
  try { return fn(); } finally { _lockDepth = 0; lock.releaseLock(); }
}
/** 파이프라인처럼 직접 잠금을 잡는 곳에서 중첩 허용을 켠다 */
function markLocked_(on) { _lockDepth = on ? Math.max(1, _lockDepth) : 0; }

/**
 * 행 버전 검사 후 수정 (동시 수정 충돌 방지)
 * @return 수정된 객체
 */
function updateWithVersion_(db, table, keyField, keyVal, expectedVersion, changes, user, reason) {
  return withLock_(function () {
    invalidate_(db, table);
    var row = readTable_(db, table).filter(function (r) { return r[keyField] === keyVal && !r.is_deleted; })[0];
    if (!row) throw new Error('대상을 찾을 수 없습니다: ' + keyVal);
    if (Number(row.row_version) !== Number(expectedVersion)) {
      throw new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다(현재 버전 ' + row.row_version +
        ', 화면 버전 ' + expectedVersion + '). 새로 고친 뒤 다시 입력하세요.');
    }
    var before = JSON.parse(JSON.stringify(row));
    Object.keys(changes).forEach(function (k) { row[k] = changes[k]; });
    row.updated_at = nowStr_();
    row.updated_by = user.user_id;
    row.row_version = Number(row.row_version) + 1;
    writeObject_(db, table, row);
    audit_(user, 'UPDATE', db, table, keyVal, before, row, reason);
    return row;
  });
}

function newAuditFields_(user) {
  var n = nowStr_();
  return { created_at: n, created_by: user.user_id, updated_at: n, updated_by: user.user_id, row_version: 1, is_deleted: false };
}

function stripInternal_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k.indexOf('__') !== 0) c[k] = o[k]; });
  return c;
}

/* ══════════════ Audit.gs ══════════════ */
/**
 * Audit.gs — 변경 이력·접근 기록·작업 로그 (추가만 가능)
 * 이력 기록 실패가 업무 처리를 숨기지 않도록, 기록 실패는 예외로 올린다.
 */

function audit_(user, action, db, table, key, before, after, reason) {
  appendObjects_('DB_LOG', 'L_AUDIT', [{
    audit_id: uid_('AU'), at: nowStr_(), user_id: user ? user.user_id : 'system', action: action,
    db: db, table_name: table, record_key: key,
    before_json: before ? JSON.stringify(stripInternal_(before)) : '',
    after_json: after ? JSON.stringify(stripInternal_(after)) : '',
    reason: reason || '', request_id: _requestId
  }]);
}

function logAccess_(userId, action, target, result, detail) {
  appendObjects_('DB_LOG', 'L_ACCESS', [{
    access_id: uid_('AC'), at: nowStr_(), user_id: userId || '(식별불가)', action: action,
    target: target || '', result: result, detail: detail || ''
  }]);
}

function logJob_(runId, stage, status, startedAt, processed, errors, message, trigger) {
  appendObjects_('DB_LOG', 'L_JOB', [{
    job_id: uid_('JB'), run_id: runId, stage: stage, status: status, started_at: startedAt,
    finished_at: nowStr_(), processed: processed || 0, errors: errors || 0, message: message || '',
    trigger: trigger || ''
  }]);
}

var _requestId = '';

/* ══════════════ Auth.gs ══════════════ */
/**
 * Auth.gs — 사용자 식별과 서버 측 권한 확인
 *
 * 원칙
 * - 화면에서 메뉴를 숨기는 것은 편의 기능일 뿐이다. 모든 웹앱 요청은 apiCall_ 을 거쳐
 *   서버에서 사용자·역할·담당 범위를 다시 확인한다. 클라이언트가 보낸 역할·사용자 값은 쓰지 않는다.
 * - 사용자를 식별하지 못하면(이메일 빈 값) 거부한다(fail closed).
 *   공식 문서: 'execute as me' 웹앱은 같은 Google Workspace 도메인이 아니면 접속자 이메일을 얻지 못할 수 있다.
 * - 이름이 '_'로 끝나는 함수는 google.script.run 으로 호출할 수 없다(비공개 함수).
 *   그래서 공개 함수는 api_* (웹앱용)와 편집기 실행용 함수만 두고, 편집기용은 소유자 확인을 먼저 한다.
 */

var _testUserOverride = null;   // 테스트 함수에서만 설정. 실행(요청)마다 초기화되므로 다른 요청으로 새지 않는다.

function currentEmail_() {
  if (_testUserOverride !== null) return String(_testUserOverride).toLowerCase();
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function ownerEmail_() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}

var _tokenUser = null;   // 접속코드 방식에서 세션 토큰으로 확인된 사용자(요청마다 초기화)

function userView_(u) { return { user_id: u.user_id, name: u.name, role: u.role, roleLabel: ROLES[u.role] || u.role }; }

/**
 * 사용자 확인 순서
 *  1) Google 계정 이메일이 식별되고 등록 사용자이면 그 사용자 (같은 Workspace 도메인·소유 계정)
 *  2) AUTH_MODE=code 이고 유효한 세션 토큰이 있으면 그 사용자 (개인 Gmail·카톡 링크 배포용)
 *  3) 그 밖에는 null → 모든 요청 거부
 */
function resolveUser_() {
  var email = currentEmail_();
  var users = readTable_('DB_MASTER', 'M_USER');
  if (email) {
    var u = users.filter(function (r) { return String(r.user_id).toLowerCase() === email && r.status === '사용' && !r.is_deleted; })[0];
    if (u) return userView_(u);
  }
  if (_tokenUser) {
    var t = users.filter(function (r) { return r.user_id === _tokenUser && r.status === '사용' && !r.is_deleted; })[0];
    if (t) return userView_(t);
  }
  return null;
}

/* ───────────── 접속코드 방식 ───────────── */

function hashHex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v;
  }).join('');
}
function randomCode_(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';   // 혼동 문자(I,O,0,1) 제외
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  for (var i = 0; i < n; i++) out += chars[((bytes[i] < 0 ? bytes[i] + 256 : bytes[i]) % chars.length)];
  return out;
}

/** 관리자가 사용자에게 접속코드를 발급한다. 코드는 이때 한 번만 보이고 해시만 저장된다. */
function issueAccessCode_(admin, userId, reason) {
  requireText_(reason, '발급 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === String(userId).toLowerCase() && !r.is_deleted; })[0];
    if (!u) throw new Error('사용자를 찾을 수 없습니다: ' + userId);
    var code = randomCode_(10), salt = Utilities.getUuid();
    var before = JSON.parse(JSON.stringify(u));
    u.code_hash = hashHex_(salt + ':' + code); u.code_salt = salt; u.code_issued_at = nowStr_();
    u.token_hash = ''; u.token_expires = ''; u.fail_count = 0; u.lock_until = '';
    u.updated_at = nowStr_(); u.updated_by = admin.user_id; u.row_version = Number(u.row_version) + 1;
    writeObject_('DB_MASTER', 'M_USER', u);
    delete before.code_hash; delete before.code_salt; delete before.token_hash;
    audit_(admin, 'ISSUE_CODE', 'DB_MASTER', 'M_USER', u.user_id, before, { code_issued_at: u.code_issued_at }, reason);   // 이력에 코드·해시 미기록
    return { user_id: u.user_id, name: u.name, code: code, note: '이 코드는 지금만 표시됩니다. 카톡 단체방이 아닌 개인 채널로 전달하세요.' };
  });
}

/** 접속코드 로그인 → 세션 토큰. 연속 실패 시 15분 잠금. 토큰은 해시만 저장. */
function loginWithCode_(email, code) {
  email = String(email || '').trim().toLowerCase(); code = String(code || '').trim().toUpperCase();
  var settings = readSettings_();
  if (settings.AUTH_MODE !== 'code') throw new Error('접속코드 로그인이 꺼져 있습니다(AUTH_MODE=google). 조직 Google 계정으로 접속하세요.');
  if (!email || !code) throw new Error('이메일과 접속코드를 입력하세요.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === email && r.status === '사용' && !r.is_deleted; })[0];
    var fail = function (why) { logAccess_(email, 'login', '', '거부', why); throw new Error('이메일 또는 접속코드가 올바르지 않습니다.'); };
    if (!u || !u.code_hash) fail('미등록 또는 코드 미발급');
    if (u.lock_until && u.lock_until > nowStr_()) { logAccess_(email, 'login', '', '거부', '잠금 중 ' + u.lock_until); throw new Error('연속 실패로 잠겨 있습니다. ' + u.lock_until + ' 이후 다시 시도하세요.'); }
    if (hashHex_(u.code_salt + ':' + code) !== u.code_hash) {
      u.fail_count = Number(u.fail_count || 0) + 1;
      if (u.fail_count >= settingNum_(settings, 'LOGIN_MAX_FAIL', 5)) { u.lock_until = Utilities.formatDate(new Date(Date.now() + 15 * 60000), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); u.fail_count = 0; }
      writeObject_('DB_MASTER', 'M_USER', u);
      fail('코드 불일치' + (u.lock_until ? ' → 잠금' : ''));
    }
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    u.token_hash = hashHex_(token); u.fail_count = 0; u.lock_until = ''; u.last_login = nowStr_();
    u.token_expires = Utilities.formatDate(new Date(Date.now() + settingNum_(settings, 'SESSION_HOURS', 12) * 3600000), APP.TZ, 'yyyy-MM-dd HH:mm:ss');
    writeObject_('DB_MASTER', 'M_USER', u);
    logAccess_(email, 'login', '', '허용', '세션 ' + u.token_expires + ' 까지');
    return { token: token, expires: u.token_expires, user: userView_(u) };
  });
}

/** 토큰 확인: 해시 일치 + 만료 전. 요청 전역 _tokenUser 에 사용자 설정 */
function authenticateToken_(token) {
  _tokenUser = null;
  if (!token || readSettings_().AUTH_MODE !== 'code') return null;
  var hsh = hashHex_(String(token));
  var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.token_hash === hsh && r.status === '사용' && !r.is_deleted; })[0];
  if (!u || !u.token_expires || u.token_expires <= nowStr_()) return null;
  _tokenUser = u.user_id;
  return u.user_id;
}

function logoutToken_(user) {
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === user.user_id; })[0];
    if (u) { u.token_hash = ''; u.token_expires = ''; writeObject_('DB_MASTER', 'M_USER', u); }
    logAccess_(user.user_id, 'logout', '', '허용', '');
    return true;
  });
}

/** 편집기에서 시스템 소유 계정이 직접 실행하는 경우만 허용 */
function requireOwner_() {
  var email = currentEmail_(), owner = ownerEmail_();
  if (!email || email !== owner) {
    throw new Error('이 기능은 Apps Script 편집기에서 시스템 소유 계정으로만 실행할 수 있습니다.');
  }
}

/** 시간 기반 트리거(이메일 빈 값일 수 있음) 또는 소유자만 허용 */
function requireOwnerOrTrigger_() {
  var email = currentEmail_();
  if (email && email !== ownerEmail_()) throw new Error('정기 처리는 소유 계정 또는 트리거만 실행할 수 있습니다.');
}

function ownerAsUser_() {
  return { user_id: ownerEmail_() || 'system', name: '시스템', role: 'ADMIN', roleLabel: ROLES.ADMIN };
}

function deny_(msg) {
  var e = new Error(msg);
  e.denied = true;
  throw e;
}

/** 담당 범위 확인 (경매사 = 담당 중도매인만) */
function requireWsAccess_(user, wsId) {
  var ok = canAccessWs_(user, wsId, readTable_('DB_MASTER', 'M_ASSIGNMENT'), todayStr_());
  if (!ok) deny_('담당 범위 밖의 중도매인입니다: ' + wsId);
}

/**
 * 웹앱 요청 공통 처리: 사용자 확인 → 권한 확인 → 실행 → 결과/오류 반환
 * @param action PERMS 의 키 (null 이면 등록 사용자 확인만)
 */
function apiCall_(action, fn) {
  _requestId = uid_('RQ');
  var email = '';
  try {
    email = currentEmail_() || _tokenUser || '';
    var user = resolveUser_();
    if (!user) {
      logAccess_(email, action, '', '거부', '미등록·비활성 또는 식별 불가 사용자');
      return { ok: false, error: '등록된 사용자가 아니거나 사용자를 식별할 수 없습니다. 관리자에게 문의하세요.' };
    }
    if (action && !can_(user.role, action)) {
      logAccess_(user.user_id, action, '', '거부', '역할 권한 없음(' + user.role + ')');
      return { ok: false, error: '권한이 없습니다.' };
    }
    return { ok: true, data: fn(user) };
  } catch (e) {
    _tokenUser = null;
    if (e && e.denied) {
      try { logAccess_(email, action, '', '거부', e.message); } catch (ignore) { /* 기록 실패는 응답을 막지 않음 */ }
      return { ok: false, error: e.message };
    }
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    _tokenUser = null;
  }
}

/* ══════════════ Setup.gs ══════════════ */
/**
 * Setup.gs — 초기 설정 (편집기에서 소유 계정으로 실행)
 * 여러 번 실행해도 안전하다(없는 폴더·파일·시트·컬럼만 만든다).
 */

/** [편집기 실행] 폴더·저장소·시트·초기 관리자를 만든다. */
function setupSystem() {
  requireOwner_();
  return withLock_(function () {
    var report = [];
    var root = getOrCreateRoot_(report);
    Object.keys(FOLDERS).forEach(function (k) { getOrCreateSubfolder_(root, k, report); });
    Object.keys(SCHEMA).forEach(function (db) { ensureDb_(db, root, report); });

    var owner = ownerAsUser_();
    invalidate_('DB_MASTER', 'M_USER');
    if (!readTable_('DB_MASTER', 'M_USER').length) {
      var admin = { user_id: owner.user_id, name: '시스템 관리자', role: 'ADMIN', status: '사용' };
      Object.assign(admin, newAuditFields_(owner));
      appendObjects_('DB_MASTER', 'M_USER', [admin]);
      audit_(owner, 'CREATE', 'DB_MASTER', 'M_USER', admin.user_id, null, admin, '초기 관리자 등록');
      report.push('초기 관리자 등록: ' + admin.user_id);
    }
    report.push('기준값 기본(가정값) 적재: ' + seedSettings_(owner) + '건');
    report.push('체크리스트 기본 항목(가정) 적재: ' + seedChecklist_(owner) + '건');
    setProp_('APP_VERSION', APP.VERSION);
    report.push('설정 완료. 다음: (가상 데이터) loadVirtualData → runPipeline → 웹앱 배포');
    Logger.log(report.join('\n'));
    return report;
  });
}

function getOrCreateRoot_(report) {
  var id = prop_('ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { report.push('기존 루트 폴더를 열 수 없어 새로 만듭니다.'); }
  }
  var f = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
  setProp_('ROOT_FOLDER_ID', f.getId());
  report.push('루트 폴더 생성: ' + f.getName());
  return f;
}

function getOrCreateSubfolder_(root, key, report) {
  var id = prop_('FOLDER_' + key);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 아래에서 새로 만든다 */ }
  }
  var f = root.createFolder(FOLDERS[key]);
  setProp_('FOLDER_' + key, f.getId());
  report.push('폴더 생성: ' + FOLDERS[key]);
  return f;
}

function folder_(key) {
  var id = prop_('FOLDER_' + key);
  if (!id) throw new Error('폴더가 설정되지 않았습니다(' + key + '). setupSystem 을 실행하세요.');
  return DriveApp.getFolderById(id);
}

function ensureDb_(db, root, report) {
  var id = prop_('DBID_' + db), ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(APP.NAME + '_' + db);
    DriveApp.getFileById(ss.getId()).moveTo(root);
    setProp_('DBID_' + db, ss.getId());
    report.push('저장소 생성: ' + ss.getName());
  }
  ss.setSpreadsheetTimeZone(APP.TZ);
  _ssMemo[db] = ss;

  Object.keys(SCHEMA[db]).forEach(function (table) {
    var cols = colsOf_(db, table);
    var sh = ss.getSheetByName(table);
    if (!sh) { sh = ss.insertSheet(table); report.push('  시트 생성: ' + db + '.' + table); }
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());

    var existing = sh.getRange(1, 1, 1, cols.length).getValues()[0].map(String);
    var want = cols.map(function (c) { return c.name; });
    var blank = existing.every(function (v) { return v === ''; });
    if (!blank && existing.join('|') !== want.join('|')) {
      // 끝에 컬럼이 추가된 경우만 자동 반영. 순서·이름이 바뀐 경우는 자료 보호를 위해 중단
      var prefixOk = existing.every(function (v, i) { return v === '' || v === want[i]; });
      if (!prefixOk && sh.getLastRow() > 1) {
        throw new Error('컬럼 구조가 다릅니다(' + db + '.' + table + '). 자료가 있어 자동 변경하지 않습니다. 이관 절차를 따르세요.');
      }
    }
    sh.getRange(1, 1, 1, cols.length).setValues([want]).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    cols.forEach(function (c, j) {
      if (c.type === 'text' || c.type === 'date' || c.type === 'datetime' || c.type === 'json') {
        sh.getRange(1, j + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  });

  // 새 파일의 기본 시트 제거
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (!SCHEMA[db][n] && (n === 'Sheet1' || n === '시트1') && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

/** [편집기 실행] 저장소·폴더 공유 상태 점검 — 사용자가 시트에 직접 접근하면 웹앱 권한 통제가 무력화된다. */
function checkSecurity() {
  requireOwner_();
  var owner = ownerEmail_(), warn = [], ok = [];
  var targets = Object.keys(SCHEMA).map(function (db) { return { name: db, file: DriveApp.getFileById(prop_('DBID_' + db)) }; });
  targets.push({ name: '루트 폴더', file: DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')) });
  targets.forEach(function (t) {
    var access = String(t.file.getSharingAccess());
    var others = t.file.getEditors().concat(t.file.getViewers())
      .map(function (u) { return String(u.getEmail()).toLowerCase(); })
      .filter(function (e) { return e && e !== owner; });
    if (access !== 'PRIVATE') warn.push(t.name + ': 링크 공유 켜짐(' + access + ')');
    if (others.length) warn.push(t.name + ': 소유자 외 접근자 ' + others.join(', '));
    if (access === 'PRIVATE' && !others.length) ok.push(t.name + ': 비공개');
  });
  var res = { warnings: warn, ok: ok };
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** [편집기 실행] 정기 처리 트리거 설치. 시각은 [가정]: 06시 처리, 02시 백업 */
function installTriggers() {
  requireOwner_();
  var mine = ['triggerDailyPipeline', 'triggerDailyBackup', 'triggerContinuePipeline', 'triggerContinueBacktest', 'triggerDailyNotify'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerDailyPipeline').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('triggerDailyBackup').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('triggerDailyNotify').timeBased().everyDays(1).atHour(8).create();
  return '트리거 설치: 매일 06시 정기 처리, 02시 백업, 08시 요약 알림(설정 NOTIFY_EMAIL=예 일 때만 발송)';
}

/** 없는 설정 키만 가정값으로 넣는다. 이미 입력된 실제 값은 건드리지 않는다. */
function seedSettings_(user) {
  invalidate_('DB_MASTER', 'M_SETTING');
  var have = {};
  readTable_('DB_MASTER', 'M_SETTING').forEach(function (r) { have[r.key] = true; });
  var rows = SETTING_DEFAULTS.filter(function (d) { return !have[d[0]]; }).map(function (d) {
    var r = { key: d[0], value: d[1], label: d[2], unit: d[3], is_assumed: true, note: '가정값(코드 기본). 내부 기준 확인 후 수정' };
    Object.assign(r, newAuditFields_(user)); return r;
  });
  appendObjects_('DB_MASTER', 'M_SETTING', rows);
  return rows.length;
}

/**
 * [편집기 실행] 한 번에 설정: 폴더·시트 생성 → (비어 있으면) 가상 데이터 → 정기 처리 → 트리거 설치 → 보안 점검
 * 실자료 운영 시에는 setupAllWithoutVirtualData 를 쓴다.
 */
function setupAll() { return setupAll_(true); }
function setupAllWithoutVirtualData() { return setupAll_(false); }

function setupAll_(withVirtual) {
  requireOwner_();
  var out = [];
  out.push('[1/5] 설정: ' + setupSystem().slice(-1)[0]);
  invalidate_('DB_MASTER', 'M_WHOLESALER');
  if (withVirtual && !readTable_('DB_MASTER', 'M_WHOLESALER').length) {
    var end = addDays_(todayStr_(), -1), start = addMonths_(ymOf_(end), -24) + '-01';
    out.push('[2/5] 가상 데이터: ' + JSON.stringify(loadVirtualData_({ startDate: start, endDate: end, seed: 20261027 })));
  } else out.push('[2/5] 가상 데이터: 건너뜀(' + (withVirtual ? '기초자료가 이미 있음' : '실자료 모드') + ')');
  var r = runPipeline_('setupAll'), n = 0;
  while (r.status === '계속' && n++ < 30) { Utilities.sleep(2000); r = runPipeline_('setupAll'); }
  out.push('[3/5] 정기 처리: ' + JSON.stringify(r));
  out.push('[4/5] ' + installTriggers());
  var sec = checkSecurity();
  out.push('[5/5] 보안 점검: ' + (sec.warnings.length ? '경고 ' + sec.warnings.join(' / ') : '모두 비공개'));
  out.push('다음: 배포 → 새 배포 → 웹 앱(실행: 나). 액세스는 "나만"(혼자 시험) 또는 "Google 계정이 있는 모든 사용자"(임직원 접속코드 방식, 설정 AUTH_MODE=code).');
  Logger.log(out.join('\n'));
  return out;
}

/**
 * [편집기 실행] 기존 드라이브 폴더(예: 담당자의 '2611_AI혁신센터_채권관리')를 시스템 루트로 지정한다.
 * 폴더 안에 하위 폴더·저장소 시트를 만들고, 폴더에 이미 있는 엑셀 파일은 다음 정기 처리 때 자동으로 읽는다.
 * @param folderIdOrName 폴더 ID 또는 이름(이름이면 내 드라이브에서 같은 이름의 첫 폴더)
 */
function setupWithFolder(folderIdOrName) {
  requireOwner_();
  var folder = null;
  try { folder = DriveApp.getFolderById(folderIdOrName); } catch (e) { folder = null; }
  if (!folder) {
    var it = DriveApp.getFoldersByName(folderIdOrName);
    if (!it.hasNext()) throw new Error('폴더를 찾을 수 없습니다: ' + folderIdOrName + ' (폴더 ID 또는 정확한 이름)');
    folder = it.next();
  }
  setProp_('ROOT_FOLDER_ID', folder.getId());
  var r = setupSystem();
  r.unshift('루트 폴더 지정: ' + folder.getName() + ' (' + folder.getId() + ')');
  Logger.log(r.join('\n'));
  return r;
}

/**
 * [편집기 실행] 매뉴얼 폴더(HWP·PDF·Google 문서)를 문서·버전으로 등록하고, 상황 코드 기본 세트에 근거 후보 문서를 연결한다.
 * 예: registerManuals('기초 자료')
 */
function registerManuals(folderIdOrName) {
  requireOwner_();
  var user = ownerAsUser_();
  var r = registerManualFolder_(user, folderIdOrName);
  var s = seedSituations_(user);
  var msg = '문서 ' + r.docs + '건 / 버전 ' + r.versions + '건 등록, 건너뜀 ' + r.skipped + ' / 상황 코드 생성 ' + s.created + ' 갱신 ' + s.updated +
    (r.noDate.length ? '\n시행일 미확인(파일명에 개정일 없음): ' + r.noDate.join(', ') : '');
  Logger.log(msg);
  return { message: msg, files: r.files };
}

/* ══════════════ Pipeline.gs ══════════════ */
/**
 * Pipeline.gs — 정기 처리: 가져오기 → 검증 → 적재 → 집계 → 대사·데이터 품질 → 상태 갱신
 *
 * - 단계 상태를 Script Properties 에 저장한다. 실행 시간이 부족하면 상태를 남기고
 *   1분 뒤 이어서 실행 트리거를 건다. 실패하면 상태가 남아 있어 다음 실행이 실패 단계부터 다시 시작한다.
 * - 각 단계는 다시 실행해도 결과가 같다(멱등): 파일 해시·행 키로 중복 적재를 막고, 집계는 원천에서 전체 재생성한다.
 */

var PIPE_STATE_KEY = 'PIPELINE_STATE';

/** [편집기 실행] 정기 처리를 지금 실행 */
function runPipeline() {
  requireOwner_();
  return runPipeline_('수동');
}

/** [트리거] 매일 정기 처리 */
function triggerDailyPipeline() {
  requireOwnerOrTrigger_();
  return runPipeline_('정기');
}

/** [트리거] 시간 부족으로 나눠진 처리 이어서 실행 */
function triggerContinuePipeline() {
  requireOwnerOrTrigger_();
  return runPipeline_('이어서');
}

function runPipeline_(trigger) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: '건너뜀', message: '다른 처리가 진행 중입니다.' };
  markLocked_(true);
  var t0 = Date.now();
  var state = JSON.parse(prop_(PIPE_STATE_KEY) || 'null') ||
    { runId: uid_('RUN'), stage: 'IMPORT', startedAt: nowStr_(), processed: 0 };
  var timeLeft = function () { return APP.JOB_TIME_BUDGET_MS - (Date.now() - t0); };
  var stageStart = nowStr_();
  try {
    if (state.stage === 'IMPORT') {
      var r = importInbox_(state.runId, trigger, timeLeft);
      state.processed += r.processed;
      if (!r.done) return pause_(state, '가져오기 ' + state.processed + '개 처리, 남은 파일 이어서 처리');
      state.stage = 'AGGREGATE';
      setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    }
    if (state.stage === 'AGGREGATE') {
      if (timeLeft() < 90000) return pause_(state, '집계 단계를 다음 실행에서 진행');
      stageStart = nowStr_();
      aggregateAll_(state.runId, trigger);
      state.stage = 'SIGNALS';
      setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    }
    if (state.stage === 'SIGNALS') {
      if (timeLeft() < 60000) return pause_(state, '지표·신호 단계를 다음 실행에서 진행');
      stageStart = nowStr_();
      evaluateAll_(state.runId, trigger);
      state.stage = 'SNAPSHOT';
      setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    }
    if (state.stage === 'SNAPSHOT') {
      if (timeLeft() < 60000) return pause_(state, '스냅샷 생성을 다음 실행에서 진행');
      stageStart = nowStr_();
      var sset = readSettings_();
      if ((sset.SNAPSHOT_ENABLED || '예') === '예' && snapshotDueToday_(sset, trigger)) {
        // 스냅샷 생성 실패는 작업 이력에 남기고 정기 처리 자체는 완료시킨다(다음 실행·수동 생성에서 재시도)
        try { buildSnapshots_(state.runId, trigger); } catch (se) { logJob_(state.runId, 'SNAPSHOT', '실패', stageStart, 0, 1, String(se.message || se), trigger); }
      }
    }
    PropertiesService.getScriptProperties().deleteProperty(PIPE_STATE_KEY);
    clearContinueTriggers_();
    return { status: '완료', runId: state.runId, files: state.processed };
  } catch (e) {
    setProp_(PIPE_STATE_KEY, JSON.stringify(state));
    try {
      logJob_(state.runId, state.stage, '실패', stageStart, 0, 1, String(e && e.message ? e.message : e), trigger);
      mergeStatus_({ last_failure_at: nowStr_(), last_failure: state.stage + ': ' + (e && e.message ? e.message : e) });
    } catch (ignore) { /* 기록 실패가 원래 오류를 가리지 않도록 */ }
    throw e;
  } finally {
    markLocked_(false);
    lock.releaseLock();
  }
}

function pause_(state, msg) {
  setProp_(PIPE_STATE_KEY, JSON.stringify(state));
  clearContinueTriggers_();
  ScriptApp.newTrigger('triggerContinuePipeline').timeBased().after(APP.CONTINUE_AFTER_MS).create();
  return { status: '계속', runId: state.runId, message: msg };
}

function clearContinueTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'triggerContinuePipeline') ScriptApp.deleteTrigger(t);
  });
}

/* ───────────── 가져오기 ───────────── */

function importInbox_(runId, trigger, timeLeft) {
  var inbox = folder_('INBOX'), files = [], it = inbox.getFiles();
  while (it.hasNext()) files.push(it.next());
  // 루트 폴더(담당자 드라이브 폴더)에 직접 놓인 엑셀·CSV·동향보고 파일도 가져오기 대상
  var rootId = prop_('ROOT_FOLDER_ID');
  if (rootId) {
    var rit = DriveApp.getFolderById(rootId).getFiles();
    while (rit.hasNext()) { var f = rit.next(); if (/\.(xlsx?|csv|json|pdf|jpe?g|png)$/i.test(f.getName()) || /spreadsheetml|ms-excel|text\/csv/.test(String(f.getMimeType ? f.getMimeType() : ''))) files.push(f); }
  }
  files.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  var wsIds = {};
  readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { if (!w.is_deleted) wsIds[w.wholesaler_id] = true; });
  var keyCache = {}, processed = 0;
  for (var i = 0; i < files.length; i++) {
    if (timeLeft() < 45000) return { done: false, processed: processed };
    importFile_(files[i], runId, trigger, wsIds, keyCache);
    processed++;
  }
  return { done: true, processed: processed };
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function importFile_(file, runId, trigger, wsIds, keyCache) {
  var started = nowStr_(), name = file.getName(), source = detectSource_(name);
  var blob = file.getBlob();
  var batch = {
    batch_id: uid_('B'), run_id: runId, source: source || '', file_name: name, file_id: file.getId(),
    file_hash: sha256Hex_(blob.getBytes()), date_from: '', date_to: '', row_count: 0, accepted_count: 0,
    duplicate_count: 0, revised_count: 0, rejected_count: 0, control_rows: '', control_amount: '',
    accepted_amount: 0, control_result: '', status: '', message: '', started_at: started, finished_at: ''
  };
  var dest = 'DONE';
  var prior0 = readTable_('DB_RAW', 'R_BATCH').filter(function (b) { return b.file_hash === batch.file_hash && ['완료', '부분적재', '참고자료'].indexOf(b.status) >= 0; })[0];

  if (prior0) {
    batch.source = prior0.source; batch.status = '중복파일';
    batch.message = '같은 내용의 파일이 이미 처리됨(' + prior0.batch_id + ') — 건너뜀';
  } else if (/^CHECK_.*\.(pdf|jpe?g|png)$/i.test(name)) {
    var ck = importChecklistFile_(file, batch);
    batch.source = 'CHECK_SCAN'; batch.status = ck.status; batch.message = ck.message; dest = ck.dest; batch.accepted_count = ck.ok ? 1 : 0; batch.rejected_count = ck.ok ? 0 : 1; batch.row_count = 1;
  } else if (/^TREND_.*\.json$/i.test(name)) {
    var tr = importTrendFile_(file, batch);
    batch.source = 'TREND_JSON'; batch.status = tr.status; batch.message = tr.message; dest = tr.dest; batch.accepted_count = tr.ok ? 1 : 0; batch.rejected_count = tr.ok ? 0 : 1; batch.row_count = 1;
  } else if (!source) {
    var nh = null;
    try { nh = importNhFile_(file, batch, readSettings_()); }
    catch (e) { batch.status = '형식오류'; batch.message = '농협 파일 처리 오류: ' + (e && e.message ? e.message : e); dest = 'ERROR'; }
    if (nh) {
      batch.status = nh.status; batch.message = nh.message; dest = nh.dest;
      batch.row_count = nh.rowCount || 0; batch.accepted_count = nh.accepted || 0; batch.rejected_count = nh.rejected || 0; batch.duplicate_count = nh.duplicates || 0;
      batch.date_from = nh.dateFrom || ''; batch.date_to = nh.dateTo || ''; batch.accepted_amount = nh.amount || 0; batch.control_result = '관리합계없음';
      appendObjects_('DB_RAW', 'R_REJECT', (nh.rejects || []).map(function (x) { return { reject_id: uid_('RJ'), batch_id: batch.batch_id, source: batch.source, line_no: x.line, error_code: x.code, error_message: x.msg, raw_line: String(x.raw || '').substring(0, 500), created_at: nowStr_() }; }));
    } else if (!batch.status) {
      batch.status = '형식오류';
      batch.message = '알 수 없는 형식: 파일명 접두어(SALES_/RECEIPT_/AR_BAL_/TREND_)도 아니고 농협 추출 파일 헤더(기표일자·기표년월·허가번호)도 찾지 못함';
      dest = 'ERROR';
    }
  } else {
    var prior = readTable_('DB_RAW', 'R_BATCH').filter(function (b) {
      return b.file_hash === batch.file_hash && (b.status === '완료' || b.status === '부분적재');
    })[0];
    if (prior) {
      batch.status = '중복파일';
      batch.message = '같은 내용의 파일이 이미 적재됨(' + prior.batch_id + ') — 건너뜀';
    } else {
      var spec = SOURCE_SPEC[source];
      if (!keyCache[source]) {
        var m = {};
        readTable_('DB_RAW', spec.table).forEach(function (r) { m[r.row_key] = r.content_hash; });
        keyCache[source] = m;
      }
      var res = validateImport_(blob.getDataAsString('UTF-8'), source, { wholesalerIds: wsIds, existing: keyCache[source] });
      if (res.fatal) {
        batch.status = '형식오류';
        batch.message = res.fatal;
        dest = 'ERROR';
      } else {
        var loadedAt = nowStr_();
        appendObjects_('DB_RAW', spec.table, res.accepted.map(function (r) {
          r.batch_id = batch.batch_id; r.loaded_at = loadedAt; return r;
        }));
        appendObjects_('DB_RAW', 'R_REJECT', res.rejects.map(function (x) {
          return { reject_id: uid_('RJ'), batch_id: batch.batch_id, source: source, line_no: x.line,
            error_code: x.code, error_message: x.msg, raw_line: x.raw, created_at: loadedAt };
        }));
        batch.date_from = res.dateFrom; batch.date_to = res.dateTo;
        batch.row_count = res.rowCount; batch.accepted_count = res.accepted.length;
        batch.duplicate_count = res.duplicates; batch.revised_count = res.revisions;
        batch.rejected_count = res.rejects.length; batch.accepted_amount = res.acceptedAmount;
        batch.control_rows = res.control ? res.control.rows : '';
        batch.control_amount = res.control ? res.control.amount : '';
        batch.control_result = res.controlResult;
        if (res.accepted.length === 0 && res.rejects.length > 0) { batch.status = '실패'; dest = 'ERROR'; }
        else if (res.rejects.length || res.controlResult !== '일치') batch.status = '부분적재';
        else batch.status = '완료';
        batch.message = '읽음 ' + res.rowCount + ' / 적재 ' + res.accepted.length + ' / 중복 ' + res.duplicates +
          ' / 수정본 ' + res.revisions + ' / 거부 ' + res.rejects.length + ' / 관리합계 ' + res.controlResult;
      }
    }
  }
  batch.finished_at = nowStr_();
  appendObjects_('DB_RAW', 'R_BATCH', [batch]);
  file.moveTo(folder_(dest));
  logJob_(runId, 'IMPORT:' + name, batch.status, started, batch.accepted_count, batch.rejected_count, batch.message, trigger);
  return batch;
}

/* ───────────── 집계·대사·상태 ───────────── */

function aggregateAll_(runId, trigger) {
  var started = nowStr_();
  var sales = readTable_('DB_RAW', 'R_SALES');
  var salesMonthly = readTable_('DB_RAW', 'R_SALES_MONTHLY');
  var receipts = readTable_('DB_RAW', 'R_RECEIPT');
  var arRows = readTable_('DB_RAW', 'R_AR_BAL');
  var calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');

  var agg = buildAggregates_({ sales: sales, salesMonthly: salesMonthly, receipts: receipts, arRows: arRows, calendar: calendar,
    wholesalers: wholesalers, statusHist: statusHist, calcRunId: runId });
  rewriteTable_('DB_AGG', 'A_DAILY', agg.daily);
  rewriteTable_('DB_AGG', 'A_MONTHLY', agg.monthly);
  rewriteTable_('DB_AGG', 'A_DQ', agg.issues);

  var created = nowStr_();
  var recon = reconcile_({ sales: sales, salesMonthly: salesMonthly, receipts: receipts, arRows: arRows }, agg).map(function (r) {
    r.recon_id = uid_('RC'); r.calc_run_id = runId; r.created_at = created; return r;
  });
  appendObjects_('DB_AGG', 'A_RECON', recon);

  var runBatches = readTable_('DB_RAW', 'R_BATCH').filter(function (b) { return b.run_id === runId; });
  var problems = runBatches.filter(function (b) { return ['형식오류', '실패', '부분적재'].indexOf(b.status) >= 0; });
  // 미수 잔액 자료가 없는 운영(농협 실적 파일만)에서는 최신 기표일을 기준일로 쓴다
  if (!agg.latestBase) {
    agg.latestBase = sales.reduce(function (mx, r) { return r.txn_date > mx ? r.txn_date : mx; }, '');
    // 월별 사업실적만 있으면 최신 기표년월의 말일을 기준일로 쓴다(일별·잔액 자료가 들어오면 그 날짜가 우선)
    if (!agg.latestBase && salesMonthly.length) agg.latestBase = monthEnd_(salesMonthly.reduce(function (mx, r) { return r.ym > mx ? r.ym : mx; }, ''));
    agg.arMissing = true;
  }
  if (!agg.dataStart) {
    agg.dataStart = sales.reduce(function (mn, r) { return !mn || r.txn_date < mn ? r.txn_date : mn; }, '');
    if (!agg.dataStart && salesMonthly.length) agg.dataStart = salesMonthly.reduce(function (mn, r) { return !mn || r.ym < mn ? r.ym : mn; }, '') + '-01';
  }
  var st = overallDataStatus_({
    latestBase: agg.latestBase,
    expectedBase: expectedBaseDate_(calendar, todayStr_()),
    issuesOnLatest: agg.issues.filter(function (i) { return i.date === agg.latestBase && i.status !== '경고'; }).length,
    reconFail: recon.filter(function (r) { return r.result !== '일치'; }).length,
    lastBatchProblem: problems.length ? problems.length + '개 파일(' + problems.map(function (b) { return b.file_name + ':' + b.status; }).join(', ') + ')' : ''
  });
  mergeStatus_({
    latest_base_date: agg.latestBase, data_start: agg.dataStart || (sales.length ? sales.reduce(function (mn, r) { return !mn || r.txn_date < mn ? r.txn_date : mn; }, '') : ''),
    ar_available: agg.arMissing ? '아니오' : '예',
    expected_base_date: expectedBaseDate_(calendar, todayStr_()),
    data_status: st.status, status_reasons: st.reasons.join(' / '),
    last_calc_run_id: runId, last_updated_at: nowStr_(),
    issue_count: String(agg.issues.length)
  });
  logJob_(runId, 'AGGREGATE', '완료', started, agg.daily.length, recon.filter(function (r) { return r.result !== '일치'; }).length,
    '일집계 ' + agg.daily.length + ' / 월집계 ' + agg.monthly.length + ' / 데이터이상 ' + agg.issues.length + ' / 상태 ' + st.status, trigger);
  return { status: st, recon: recon, issues: agg.issues.length };
}

function readStatus_() {
  var m = {};
  readTable_('DB_AGG', 'A_STATUS').forEach(function (r) { m[r.key] = r.value; });
  return m;
}

function mergeStatus_(obj) {
  var m = readStatus_(), now = nowStr_();
  Object.keys(obj).forEach(function (k) { m[k] = obj[k] === undefined || obj[k] === null ? '' : String(obj[k]); });
  rewriteTable_('DB_AGG', 'A_STATUS', Object.keys(m).sort().map(function (k) { return { key: k, value: m[k], updated_at: now }; }));
}

/** 주간 모드면 지정 요일(기본 월요일)에만, 일간이면 매번. 수동 실행은 항상 생성 */
function snapshotDueToday_(settings, trigger) {
  if ((settings.SNAPSHOT_FREQ || '주간') === '일간') return true;
  if (trigger && trigger.indexOf('정기') < 0) return true;
  return dowOf_(todayStr_()) === settingNum_(settings, 'SNAPSHOT_WEEKDAY', 1);
}

/* ══════════════ Backup.gs ══════════════ */
/**
 * Backup.gs — 백업·복구
 * - 매일 모든 저장소 파일 사본을 90_백업/yyyyMMdd 폴더에 만든다.
 * - 일 백업은 APP.BACKUP_KEEP_DAILY 세대, 그 밖에 각 월의 마지막 백업은 APP.BACKUP_KEEP_MONTHLY 개월 보관.
 * - 복구는 원본을 지우지 않는다: 백업 사본을 새 작업본으로 복사하고 연결만 바꾼 뒤, 기존 파일 이름에 '_교체됨' 표시.
 */

/** [트리거] 매일 백업 */
function triggerDailyBackup() {
  requireOwnerOrTrigger_();
  return backupAll_('정기');
}

/** [편집기 실행] 지금 백업 */
function backupNow() {
  requireOwner_();
  return backupAll_('수동');
}

function backupAll_(trigger) {
  var started = nowStr_(), runId = uid_('BK');
  var base = folder_('BACKUP');
  var stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd');
  var it = base.getFoldersByName(stamp);
  var dayFolder = it.hasNext() ? it.next() : base.createFolder(stamp);
  var copied = [];
  Object.keys(SCHEMA).forEach(function (db) {
    var f = DriveApp.getFileById(prop_('DBID_' + db));
    var c = f.makeCopy(db + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss'), dayFolder);
    copied.push(db + '→' + c.getId());
  });
  var removed = pruneBackups_(base);
  logJob_(runId, 'BACKUP', '완료', started, copied.length, 0, copied.join(', ') + (removed.length ? ' / 정리: ' + removed.join(',') : ''), trigger);
  return { folder: stamp, copied: copied, removed: removed };
}

/** 보관 기준을 넘은 백업 폴더를 휴지통으로 이동 (Drive 휴지통에서 일정 기간 복원 가능) */
function pruneBackups_(base) {
  var names = [], map = {}, it = base.getFolders();
  while (it.hasNext()) {
    var f = it.next(), n = f.getName();
    if (/^\d{8}$/.test(n)) { names.push(n); map[n] = f; }
  }
  names.sort().reverse();
  var keep = {};
  names.slice(0, APP.BACKUP_KEEP_DAILY).forEach(function (n) { keep[n] = true; });
  var monthLast = {};
  names.forEach(function (n) { var ym = n.substring(0, 6); if (!monthLast[ym]) monthLast[ym] = n; });
  Object.keys(monthLast).sort().reverse().slice(0, APP.BACKUP_KEEP_MONTHLY).forEach(function (ym) { keep[monthLast[ym]] = true; });
  var removed = [];
  names.forEach(function (n) { if (!keep[n]) { map[n].setTrashed(true); removed.push(n); } });
  return removed;
}

/**
 * [편집기 실행] 저장소 1개를 백업본으로 복구
 * @param db 'DB_MASTER' 등
 * @param backupFileId 90_백업 폴더 안 사본의 파일 ID
 * 복구 후 할 일: 백업 시점 이후 원천 파일을 02_가져오기_완료 → 01_가져오기_대기로 옮겨 runPipeline 재실행,
 *               업무 입력분은 L_AUDIT 의 after_json 으로 확인해 재입력 (운영 매뉴얼 참고)
 */
function restoreDb(db, backupFileId) {
  requireOwner_();
  if (!SCHEMA[db]) throw new Error('알 수 없는 저장소: ' + db);
  return withLock_(function () {
    var owner = ownerAsUser_();
    var oldId = prop_('DBID_' + db);
    var src = DriveApp.getFileById(backupFileId);
    var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
    var copy = src.makeCopy(APP.NAME + '_' + db, root);
    var old = DriveApp.getFileById(oldId);
    old.setName(old.getName() + '_교체됨_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss'));
    setProp_('DBID_' + db, copy.getId());
    delete _ssMemo[db];
    _tableMemo = {};
    audit_(owner, 'RESTORE', db, '*', db, { file_id: oldId }, { file_id: copy.getId(), from_backup: backupFileId }, '백업 복구');
    return { db: db, newFileId: copy.getId(), previousFileId: oldId };
  });
}

/* ══════════════ Master.gs ══════════════ */
/**
 * Master.gs — 기초자료 업무 로직 (중도매인·영업상태·담당·담보·보증·한도·사용자·증빙)
 *
 * - 담보·보증·한도는 값을 덮어쓰지 않고 새 버전을 '승인대기'로 등록 → 관리자 승인 시 유효.
 *   승인 시 직전 승인 버전의 종료일을 새 버전 시작 전날로 닫는다. 과거 기준일 조회가 가능하다.
 * - 한도 유형(기본/마감/추가)은 내부 규정 확인 전까지 합산하지 않는다.
 */

var VERSIONED = {
  M_COLLATERAL: { id: 'collateral_id', prefix: 'C', label: '담보',
    required: ['collateral_type', 'set_amount', 'valid_from'],
    nums: ['set_amount', 'appraised_amount', 'recognized_amount'],
    dates: ['appraisal_date', 'confirmed_date', 'expiry_date'],
    fields: ['collateral_type', 'set_amount', 'appraised_amount', 'appraisal_date', 'recognized_amount',
      'confirmed_date', 'review_status', 'expiry_date', 'evidence_ids'] },
  M_GUARANTEE: { id: 'guarantee_id', prefix: 'G', label: '연대보증',
    required: ['has_guarantee', 'valid_from'],
    nums: ['guarantee_limit'],
    dates: ['period_from', 'period_to', 'confirmed_date'],
    fields: ['has_guarantee', 'guarantor_ref', 'scope', 'guarantee_limit', 'period_from', 'period_to',
      'confirmed_date', 'doc_ids'] },
  M_LIMIT: { id: 'limit_id', prefix: 'L', label: '한도',
    required: ['limit_type', 'amount', 'valid_from', 'approval_basis'],
    nums: ['amount'],
    dates: [],
    fields: ['limit_type', 'amount', 'approval_basis', 'approver'] }
};

var LIMIT_TYPES = ['기본한도', '마감한도', '추가한도'];
var WS_STATUSES = ['정상', '휴업', '폐업'];

function requireText_(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') throw new Error(label + '은(는) 필수입니다.');
  return String(v).trim();
}
function optDate_(v, label) {
  if (v === undefined || v === null || v === '') return '';
  if (!isYmd_(v)) throw new Error(label + ' 날짜 형식 오류(yyyy-MM-dd): ' + v);
  return v;
}
function optNum_(v, label) {
  if (v === undefined || v === null || v === '') return '';
  var n = Number(String(v).replace(/,/g, ''));
  if (!isFinite(n)) throw new Error(label + ' 숫자 형식 오류: ' + v);
  return n;
}

function findWs_(wsId) {
  return readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return w.wholesaler_id === wsId && !w.is_deleted; })[0];
}

/* ───────────── 중도매인 ───────────── */

function createWholesaler_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.wholesaler_id, '중도매인코드').toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(id)) throw new Error('중도매인코드는 영문 대문자·숫자 2~20자입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_WHOLESALER');
    if (findWs_(id)) throw new Error('이미 있는 중도매인코드입니다: ' + id);
    var start = optDate_(requireText_(o.trade_start_date, '거래 시작일'), '거래 시작일');
    var row = {
      wholesaler_id: id, name: requireText_(o.name, '상호'), representative: requireText_(o.representative, '대표자'),
      biz_status: '정상', trade_start_date: start, categories: o.categories || APP.CATEGORIES.join(','),
      settle_group: o.settle_group || '', note: o.note || ''
    };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_WHOLESALER', [row]);
    var hist = { status_hist_id: uid_('ST'), wholesaler_id: id, status: '정상', valid_from: start,
      valid_to: APP.OPEN_END, change_reason: '신규 등록', created_at: nowStr_(), created_by: user.user_id };
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [hist]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_WHOLESALER', id, null, row, reason);
    return stripInternal_(row);
  });
}

function updateWholesaler_(user, wsId, changes, expectedVersion, reason) {
  requireText_(reason, '변경 사유');
  var allowed = ['name', 'representative', 'categories', 'settle_group', 'note'], c = {};
  allowed.forEach(function (k) { if (changes[k] !== undefined) c[k] = String(changes[k]).trim(); });
  if (c.name === '') throw new Error('상호는 비울 수 없습니다.');
  return stripInternal_(updateWithVersion_('DB_MASTER', 'M_WHOLESALER', 'wholesaler_id', wsId, expectedVersion, c, user, reason));
}

/** 영업 상태 변경: 이력에 기간으로 기록, 시작일이 오늘 이전이면 현재 상태에도 반영 */
function changeWsStatus_(user, wsId, status, validFrom, reason) {
  requireText_(reason, '변경 사유');
  if (WS_STATUSES.indexOf(status) < 0) throw new Error('영업 상태는 ' + WS_STATUSES.join('/') + ' 중 하나입니다.');
  optDate_(requireText_(validFrom, '적용 시작일'), '적용 시작일');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_WS_STATUS_HIST');
    invalidate_('DB_MASTER', 'M_WHOLESALER');
    var ws = findWs_(wsId);
    if (!ws) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
    readTable_('DB_MASTER', 'M_WS_STATUS_HIST').forEach(function (h) {
      if (h.wholesaler_id !== wsId) return;
      if (h.valid_from >= validFrom) throw new Error('적용 시작일 이후에 이미 상태 이력이 있습니다(' + h.valid_from + ').');
      if ((h.valid_to || APP.OPEN_END) >= validFrom) {
        var before = JSON.parse(JSON.stringify(h));
        h.valid_to = addDays_(validFrom, -1);
        writeObject_('DB_MASTER', 'M_WS_STATUS_HIST', h);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_WS_STATUS_HIST', h.status_hist_id, before, h, reason);
      }
    });
    var hist = { status_hist_id: uid_('ST'), wholesaler_id: wsId, status: status, valid_from: validFrom,
      valid_to: APP.OPEN_END, change_reason: reason, created_at: nowStr_(), created_by: user.user_id };
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [hist]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_WS_STATUS_HIST', hist.status_hist_id, null, hist, reason);
    if (validFrom <= todayStr_()) {
      var before2 = JSON.parse(JSON.stringify(ws));
      ws.biz_status = status; ws.updated_at = nowStr_(); ws.updated_by = user.user_id;
      ws.row_version = Number(ws.row_version) + 1;
      writeObject_('DB_MASTER', 'M_WHOLESALER', ws);
      audit_(user, 'UPDATE', 'DB_MASTER', 'M_WHOLESALER', wsId, before2, ws, reason);
    }
    return hist;
  });
}

/* ───────────── 담당 지정 ───────────── */

function setAssignment_(user, wsId, userId, validFrom, reason) {
  requireText_(reason, '변경 사유');
  optDate_(requireText_(validFrom, '적용 시작일'), '적용 시작일');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_ASSIGNMENT');
    if (!findWs_(wsId)) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
    var target = readTable_('DB_MASTER', 'M_USER').filter(function (u) { return u.user_id === userId && u.status === '사용'; })[0];
    if (!target || target.role !== 'AUCTIONEER') throw new Error('담당자는 사용 중인 경매사 계정이어야 합니다.');
    readTable_('DB_MASTER', 'M_ASSIGNMENT').forEach(function (a) {
      if (a.wholesaler_id !== wsId || a.is_deleted) return;
      if (a.valid_from >= validFrom) throw new Error('적용 시작일 이후의 담당 지정이 이미 있습니다(' + a.valid_from + ').');
      if ((a.valid_to || APP.OPEN_END) >= validFrom) {
        var before = JSON.parse(JSON.stringify(a));
        a.valid_to = addDays_(validFrom, -1);
        a.updated_at = nowStr_(); a.updated_by = user.user_id; a.row_version = Number(a.row_version) + 1;
        writeObject_('DB_MASTER', 'M_ASSIGNMENT', a);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_ASSIGNMENT', a.assign_id, before, a, reason);
      }
    });
    var row = { assign_id: uid_('AS'), wholesaler_id: wsId, user_id: userId, valid_from: validFrom,
      valid_to: APP.OPEN_END, change_reason: reason };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_ASSIGNMENT', [row]);
    audit_(user, 'CREATE', 'DB_MASTER', 'M_ASSIGNMENT', row.assign_id, null, row, reason);
    return stripInternal_(row);
  });
}

/* ───────────── 담보·보증·한도 버전 ───────────── */

function submitVersion_(user, table, o, reason) {
  var def = VERSIONED[table];
  if (!def) throw new Error('버전 관리 대상이 아닙니다: ' + table);
  requireText_(reason, '변경 사유');
  def.required.forEach(function (k) { requireText_(o[k], k); });
  if (table === 'M_LIMIT' && LIMIT_TYPES.indexOf(o.limit_type) < 0) throw new Error('한도 유형은 ' + LIMIT_TYPES.join('/') + ' 중 하나입니다.');
  var validFrom = optDate_(o.valid_from, '적용 시작일');
  var validTo = optDate_(o.valid_to, '적용 종료일') || APP.OPEN_END;
  if (validTo < validFrom) throw new Error('적용 종료일이 시작일보다 빠릅니다.');

  return withLock_(function () {
    invalidate_('DB_MASTER', table);
    if (!findWs_(o.wholesaler_id)) throw new Error('중도매인을 찾을 수 없습니다: ' + o.wholesaler_id);
    var rows = readTable_('DB_MASTER', table);
    var id = o[def.id] ? String(o[def.id]) : '';
    var version = 1;
    if (id) {
      var same = rows.filter(function (r) { return r[def.id] === id; });
      if (!same.length) throw new Error(def.label + ' ID를 찾을 수 없습니다: ' + id);
      if (same[0].wholesaler_id !== o.wholesaler_id) throw new Error('다른 중도매인의 ' + def.label + '입니다.');
      if (same.some(function (r) { return r.approval_status === '승인대기'; })) throw new Error('승인 대기 중인 버전이 있습니다. 먼저 처리하세요.');
      version = same.reduce(function (mx, r) { return Math.max(mx, Number(r.version_no)); }, 0) + 1;
    } else {
      id = def.prefix + o.wholesaler_id + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 4).toUpperCase();
    }
    var row = { wholesaler_id: o.wholesaler_id, version_no: version, valid_from: validFrom, valid_to: validTo,
      approval_status: '승인대기', change_reason: reason, requested_by: user.user_id, requested_at: nowStr_(),
      approved_by: '', approved_at: '', reject_reason: '' };
    row[def.id] = id;
    def.fields.forEach(function (k) {
      if (def.nums.indexOf(k) >= 0) row[k] = optNum_(o[k], k);
      else if (def.dates.indexOf(k) >= 0) row[k] = optDate_(o[k], k);
      else row[k] = o[k] === undefined ? '' : String(o[k]).trim();
    });
    appendObjects_('DB_MASTER', table, [row]);
    audit_(user, 'SUBMIT_VERSION', 'DB_MASTER', table, id + '#v' + version, null, row, reason);
    return row;
  });
}

function decideVersion_(user, table, id, versionNo, decision, reason) {
  var def = VERSIONED[table];
  if (!def) throw new Error('버전 관리 대상이 아닙니다: ' + table);
  if (['승인', '반려'].indexOf(decision) < 0) throw new Error('결정은 승인/반려 중 하나입니다.');
  if (decision === '반려') requireText_(reason, '반려 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', table);
    var rows = readTable_('DB_MASTER', table);
    var row = rows.filter(function (r) { return r[def.id] === id && Number(r.version_no) === Number(versionNo); })[0];
    if (!row) throw new Error('대상 버전을 찾을 수 없습니다.');
    if (row.approval_status !== '승인대기') throw new Error('이미 처리된 버전입니다(' + row.approval_status + ').');
    if (!APP.ALLOW_SELF_APPROVAL && row.requested_by === user.user_id) throw new Error('요청자 본인은 승인·반려할 수 없습니다.');
    var before = JSON.parse(JSON.stringify(row));
    var now = nowStr_();
    if (decision === '승인') {
      closePreviousVersions_(rows, def.id, row).forEach(function (x) {
        var b = JSON.parse(JSON.stringify(x.row));
        x.row.valid_to = x.newValidTo;
        writeObject_('DB_MASTER', table, x.row);
        audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', table, id + '#v' + x.row.version_no, b, x.row, '새 버전 v' + row.version_no + ' 승인');
      });
      row.approval_status = '승인';
    } else {
      row.approval_status = '반려';
      row.reject_reason = reason;
    }
    row.approved_by = user.user_id;
    row.approved_at = now;
    writeObject_('DB_MASTER', table, row);
    audit_(user, decision === '승인' ? 'APPROVE' : 'REJECT', 'DB_MASTER', table, id + '#v' + versionNo, before, row, reason || '');
    return stripInternal_(row);
  });
}

function pendingVersions_() {
  var out = [];
  Object.keys(VERSIONED).forEach(function (t) {
    readTable_('DB_MASTER', t).forEach(function (r) {
      if (r.approval_status === '승인대기') {
        var c = stripInternal_(r);
        c.table = t; c.tableLabel = VERSIONED[t].label; c.id = r[VERSIONED[t].id];
        out.push(c);
      }
    });
  });
  return out;
}

/* ───────────── 보증인(민감정보) ───────────── */

function createGuarantor_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var row = { guarantor_ref: uid_('GR'), name: requireText_(o.name, '보증인 성명'), relation: o.relation || '', note: o.note || '' };
  Object.assign(row, newAuditFields_(user));
  appendObjects_('DB_PII', 'P_GUARANTOR', [row]);
  audit_(user, 'CREATE', 'DB_PII', 'P_GUARANTOR', row.guarantor_ref, null, { guarantor_ref: row.guarantor_ref }, reason); // 이력에 개인정보 미기록
  return { guarantor_ref: row.guarantor_ref };
}

/* ───────────── 사용자 ───────────── */

function saveUser_(admin, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.user_id, '사용자 이메일').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(id)) throw new Error('이메일 형식이 아닙니다.');
  if (!ROLES[o.role]) throw new Error('역할 오류: ' + o.role);
  var status = o.status || '사용';
  if (['사용', '중지'].indexOf(status) < 0) throw new Error('상태는 사용/중지 중 하나입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_USER');
    var users = readTable_('DB_MASTER', 'M_USER');
    var cur = users.filter(function (u) { return u.user_id === id && !u.is_deleted; })[0];
    var admins = users.filter(function (u) { return u.role === 'ADMIN' && u.status === '사용' && !u.is_deleted; });
    if (cur && cur.role === 'ADMIN' && (o.role !== 'ADMIN' || status !== '사용') && admins.length <= 1) {
      throw new Error('마지막 관리자의 역할·상태는 바꿀 수 없습니다.');
    }
    if (!cur) {
      var row = { user_id: id, name: requireText_(o.name, '이름'), role: o.role, status: status, code_hash: '', code_salt: '', code_issued_at: '',
        token_hash: '', token_expires: '', fail_count: 0, lock_until: '', last_login: '' };
      Object.assign(row, newAuditFields_(admin));
      appendObjects_('DB_MASTER', 'M_USER', [row]);
      audit_(admin, 'CREATE', 'DB_MASTER', 'M_USER', id, null, row, reason);
      return stripInternal_(row);
    }
    var before = JSON.parse(JSON.stringify(cur));
    cur.name = o.name || cur.name; cur.role = o.role; cur.status = status;
    if (status !== '사용') { cur.token_hash = ''; cur.token_expires = ''; }
    cur.updated_at = nowStr_(); cur.updated_by = admin.user_id; cur.row_version = Number(cur.row_version) + 1;
    writeObject_('DB_MASTER', 'M_USER', cur);
    audit_(admin, 'UPDATE', 'DB_MASTER', 'M_USER', id, before, cur, reason);
    return stripInternal_(cur);
  });
}

/* ───────────── 증빙 ───────────── */

function uploadEvidence_(user, o) {
  if (!findWs_(o.wholesaler_id)) throw new Error('중도매인을 찾을 수 없습니다: ' + o.wholesaler_id);
  requireText_(o.file_name, '파일명');
  requireText_(o.doc_type, '문서 유형');
  var bytes = Utilities.base64Decode(requireText_(o.base64, '파일 내용'));
  var parent = folder_('EVIDENCE');
  var it = parent.getFoldersByName(o.wholesaler_id);
  var wsFolder = it.hasNext() ? it.next() : parent.createFolder(o.wholesaler_id);
  var safeName = String(o.file_name).replace(/[\\/:*?"<>|]/g, '_');
  var file = wsFolder.createFile(Utilities.newBlob(bytes, o.mime_type || 'application/octet-stream',
    Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss') + '_' + safeName));
  var row = { evidence_id: uid_('EV'), wholesaler_id: o.wholesaler_id, target_table: o.target_table || '',
    target_id: o.target_id || '', file_id: file.getId(), file_name: safeName, file_hash: sha256Hex_(bytes),
    doc_type: o.doc_type, created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_MASTER', 'M_EVIDENCE', [row]);
  audit_(user, 'UPLOAD', 'DB_MASTER', 'M_EVIDENCE', row.evidence_id, null, row, '증빙 업로드');
  logAccess_(user.user_id, 'evidence.upload', row.evidence_id, '허용', safeName);
  return stripInternal_(row);
}

/* ───────────── 운영 기준값 ───────────── */

var SETTING_CHOICES = {
  LIMIT_COMBINE: ['미확인', '기본한도만', '기본+추가', '전체합산'],
  CATEGORY_AR_SPLIT: ['불가', '가능'],
  OVERDUE_DEFINITION: ['원천값'],
  MATRIX_X_MODE: ['전년동월증감', '당기중앙값'],
  SNAPSHOT_FREQ: ['주간', '일간'],
  MATRIX_Y_MODE: ['당기중앙값', '전년고정', '목표값'],
  NOTIFY_EMAIL: ['예', '아니오'],
  AI_ENABLED: ['예', '아니오'],
  AI_ORG_APPROVED: ['미확인', '예', '아니오'],
  AI_DATA_SCOPE: ['매뉴얼본문만', '매뉴얼+익명수치'],
  AUTH_MODE: ['google', 'code'],
  NH_AUTO_REGISTER_WS: ['예', '아니오'],
  SNAPSHOT_ENABLED: ['예', '아니오'],
  SNAPSHOT_EMAIL: ['예', '아니오']
};
var SETTING_FREE_TEXT = ['LIMIT_BASE_AMOUNT', 'APPROVER_ROLE', 'MATRIX_Y_FIXED_SOURCE', 'AI_PROVIDER_NOTE'];

/** 기준값 변경: 값·가정 여부·비고. 변경 전후는 L_AUDIT 에 남고, 신호에는 판정 시점 값(params_json)이 저장된다. */
function updateSetting_(user, key, value, isAssumed, note, reason) {
  requireText_(reason, '변경 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_SETTING');
    var row = readTable_('DB_MASTER', 'M_SETTING').filter(function (r) { return r.key === key && !r.is_deleted; })[0];
    if (!row) throw new Error('없는 설정 키입니다: ' + key);
    var v = String(value === undefined || value === null ? '' : value).trim();
    if (SETTING_CHOICES[key]) {
      if (key === 'CATEGORY_AR_SPLIT' ? !(v === '불가' || v.indexOf('가능') === 0) : SETTING_CHOICES[key].indexOf(v) < 0)
        throw new Error(key + ' 값은 ' + SETTING_CHOICES[key].join(' | ') + ' 중 하나입니다.');
    } else if (SETTING_FREE_TEXT.indexOf(key) < 0 && v !== '' && !isFinite(Number(v))) throw new Error(key + ' 값은 숫자여야 합니다: ' + v);
    // AI 는 조직 승인이 확인된 뒤에만 켤 수 있다. 승인을 '아니오'로 바꾸면 AI 도 함께 끈다
    if (key === 'AI_ENABLED' && v === '예') {
      var approved = readTable_('DB_MASTER', 'M_SETTING').filter(function (r) { return r.key === 'AI_ORG_APPROVED'; })[0];
      if (!approved || approved.value !== '예') throw new Error('조직의 외부 AI 사용 승인(AI_ORG_APPROVED=예)이 확인되기 전에는 AI를 켤 수 없습니다.');
    }
    var before = JSON.parse(JSON.stringify(row));
    row.value = v; row.is_assumed = !!isAssumed; row.note = note === undefined ? row.note : String(note);
    row.updated_at = nowStr_(); row.updated_by = user.user_id; row.row_version = Number(row.row_version) + 1;
    writeObject_('DB_MASTER', 'M_SETTING', row);
    audit_(user, 'UPDATE', 'DB_MASTER', 'M_SETTING', key, before, row, reason);
    if (key === 'AI_ORG_APPROVED' && v !== '예') {
      var ai = readTable_('DB_MASTER', 'M_SETTING').filter(function (r) { return r.key === 'AI_ENABLED'; })[0];
      if (ai && ai.value === '예') {
        var b2 = JSON.parse(JSON.stringify(ai)); ai.value = '아니오'; ai.updated_at = nowStr_(); ai.updated_by = user.user_id; ai.row_version = Number(ai.row_version) + 1;
        writeObject_('DB_MASTER', 'M_SETTING', ai); audit_(user, 'UPDATE', 'DB_MASTER', 'M_SETTING', 'AI_ENABLED', b2, ai, '조직 승인 철회에 따라 자동 해제');
      }
    }
    return stripInternal_(row);
  });
}

/* ───────────── 백테스트 정답 표본 ───────────── */

function saveTruth_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var ws = requireText_(o.wholesaler_id, '중도매인코드').toUpperCase();
  if (!findWs_(ws)) throw new Error('중도매인을 찾을 수 없습니다: ' + ws);
  var d = optDate_(requireText_(o.event_date, '사안 발생일'), '사안 발생일');
  var row = { truth_id: uid_('BT'), wholesaler_id: ws, event_date: d, event_type: requireText_(o.event_type, '사안 유형'), note: o.note || '' };
  Object.assign(row, newAuditFields_(user));
  appendObjects_('DB_MASTER', 'M_BACKTEST_TRUTH', [row]);
  audit_(user, 'CREATE', 'DB_MASTER', 'M_BACKTEST_TRUTH', row.truth_id, null, row, reason);
  return stripInternal_(row);
}

function deleteTruth_(user, truthId, reason) {
  requireText_(reason, '변경 사유');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_BACKTEST_TRUTH');
    var row = readTable_('DB_MASTER', 'M_BACKTEST_TRUTH').filter(function (r) { return r.truth_id === truthId && !r.is_deleted; })[0];
    if (!row) throw new Error('표본을 찾을 수 없습니다.');
    var before = JSON.parse(JSON.stringify(row));
    row.is_deleted = true; row.updated_at = nowStr_(); row.updated_by = user.user_id; row.row_version = Number(row.row_version) + 1;
    writeObject_('DB_MASTER', 'M_BACKTEST_TRUTH', row);
    audit_(user, 'DELETE', 'DB_MASTER', 'M_BACKTEST_TRUTH', truthId, before, row, reason);
    return true;
  });
}

/* ══════════════ Metrics.gs ══════════════ */
/**
 * Metrics.gs — 공통 지표 계산 (순수 함수)
 * 산식(설계 6.1, 내부 기준과 대조 필요):
 *   미수금 회전율 = 기간 외상매출액 ÷ 기간 평균 미수금(일별 잔액 평균, 휴장일은 직전 잔액 유지)
 *   회수일수     = 기간 일수 ÷ 회전율
 *   구매 증감률  = 당기 ÷ 비교기간 − 1
 *   한도 사용률  = 한도 산정 대상 채권액 ÷ 적용 한도  (적용 한도 결합 방식이 '미확인'이면 산출불가)
 * 부류별 채권 배분 근거(CATEGORY_AR_SPLIT)가 없으면 회전율·회수일수·한도 사용률은 '전체'만 산출한다.
 */

function settingNum_(settings, key, fallback) {
  var v = settings[key];
  var n = Number(v);
  return v === undefined || v === '' || !isFinite(n) ? fallback : n;
}

/** 중도매인별 일자 → 잔액 조회표(전체 부류, 경매일 값) */
function balanceIndex_(daily) {
  var idx = {};
  daily.forEach(function (r) {
    if (r.category !== APP.ALL || r.ar_balance === '') return;
    (idx[r.wholesaler_id] = idx[r.wholesaler_id] || {})[r.date] = Number(r.ar_balance);
  });
  return idx;
}

/** 기간 평균 미수금(달력일 기준, 직전 잔액 유지). 기간 시작 전 마지막 잔액을 초기값으로 쓴다. */
function avgBalance_(balByDate, from, to) {
  var dates = Object.keys(balByDate).sort();
  var carry = null, firstKnown = '';
  for (var i = 0; i < dates.length; i++) {
    if (dates[i] < from) carry = balByDate[dates[i]];
    else { firstKnown = dates[i]; break; }
  }
  if (carry === null && !firstKnown) return { avg: null, days: 0, gaps: 0, method: '' };
  var sum = 0, n = 0, known = 0;
  for (var d = from; d <= to; d = addDays_(d, 1)) {
    if (balByDate[d] !== undefined) { carry = balByDate[d]; known++; }
    if (carry !== null) { sum += carry; n++; }
  }
  if (!n) return { avg: null, days: 0, gaps: 0, method: '' };
  return { avg: sum / n, days: n, known: known, method: carry === null ? '' : 'DAILY' };
}

function sumCredit_(daily, ws, category, from, to) {
  var s = 0;
  daily.forEach(function (r) {
    if (r.wholesaler_id === ws && r.category === category && r.date >= from && r.date <= to) s += Number(r.credit_sales) || 0;
  });
  return s;
}

/**
 * 한 중도매인의 기준일 지표 묶음
 * @param p { ws, baseDate, daily, monthly, calendar, limits(유효 승인 버전), statusOn, tradeStart, settings, marketGrowth }
 * @return 지표 배열(A_METRIC 행 형태) + byName 조회
 */
function computeMetrics_(p) {
  var s = p.settings, ws = p.ws, base = p.baseDate, out = [];
  var win = settingNum_(s, 'TURNOVER_WINDOW_DAYS', 91);
  var catSplit = s.CATEGORY_AR_SPLIT && s.CATEGORY_AR_SPLIT !== '불가';
  function push(m) { m.wholesaler_id = ws; m.base_date = base; m.metric_key = ws + '|' + base + '|' + m.metric + '|' + m.category; out.push(m); return m; }
  function ok(metric, cat, value, num, den, from, to, method) {
    return push({ metric: metric, category: cat, value: value, numerator: num, denominator: den, period_from: from, period_to: to, status: '정상', reason: '', method: method || '' });
  }
  function na(metric, cat, status, reason, from, to) {
    return push({ metric: metric, category: cat, value: '', numerator: '', denominator: '', period_from: from || '', period_to: to || '', status: status, reason: reason, method: '' });
  }

  var bal = p.balByDate || {};
  var dates = Object.keys(bal).sort();
  var latestDate = '';
  for (var i = dates.length - 1; i >= 0; i--) if (dates[i] <= base) { latestDate = dates[i]; break; }
  var balance = latestDate ? bal[latestDate] : null;
  if (balance === null) na('잔액', APP.ALL, '산출불가', '잔액 자료 없음');
  else ok('잔액', APP.ALL, balance, balance, 1, latestDate, latestDate);

  // 최근/직전 기간
  var curFrom = addDays_(base, -(win - 1)), prevTo = addDays_(curFrom, -1), prevFrom = addDays_(prevTo, -(win - 1));
  var isNew = p.tradeStart && addMonths_(ymOf_(p.tradeStart), settingNum_(s, 'NEW_WS_MONTHS', 12)) + '-01' > base;

  // 회전율·회수일수 (전체만, 또는 배분 가능 시 부류별)
  var cats = catSplit ? APP.CATEGORIES.concat([APP.ALL]) : [APP.ALL];
  cats.forEach(function (c) {
    [['최근', curFrom, base], ['직전', prevFrom, prevTo]].forEach(function (w) {
      var tag = w[0] === '최근' ? '' : '_직전';
      var credit = sumCredit_(p.daily, ws, c, w[1], w[2]);
      var ab = avgBalance_(bal, w[1], w[2]);
      if (ab.avg === null) { na('회전율' + tag, c, '산출불가', '기간 잔액 자료 없음', w[1], w[2]); na('회수일수' + tag, c, '산출불가', '기간 잔액 자료 없음', w[1], w[2]); return; }
      if (ab.avg <= 0) {
        na('회전율' + tag, c, '산출불가', credit > 0 ? '평균 미수금 0' : '외상거래·미수 없음', w[1], w[2]);
        na('회수일수' + tag, c, '산출불가', '평균 미수금 0', w[1], w[2]);
        return;
      }
      var t = credit / ab.avg;
      var m = ok('회전율' + tag, c, t, credit, Math.round(ab.avg), w[1], w[2], ab.method);
      if (isNew) { m.status = '참고'; m.reason = '신규(거래 ' + settingNum_(s, 'NEW_WS_MONTHS', 12) + '개월 미만)'; }
      if (t > 0) ok('회수일수' + tag, c, ab.days / t, ab.days, t, w[1], w[2], ab.method);
      else na('회수일수' + tag, c, '산출불가', '외상매출 0', w[1], w[2]);
    });
  });
  if (!catSplit) na('회전율', '부류별', '미산출', '부류별 채권 배분 근거 없음(CATEGORY_AR_SPLIT=불가)');

  // 최근 3개월 평균 잔액 (S02)
  var ab3 = avgBalance_(bal, curFrom, base);
  if (ab3.avg !== null) ok('평균잔액', APP.ALL, Math.round(ab3.avg), Math.round(ab3.avg), 1, curFrom, base, ab3.method);

  // 연체 (원천 제공값)
  var latestDaily = null;
  p.daily.forEach(function (r) { if (r.wholesaler_id === ws && r.category === APP.ALL && r.ar_balance !== '' && r.date <= base && (!latestDaily || r.date > latestDaily.date)) latestDaily = r; });
  if (latestDaily) {
    ok('연체금액', APP.ALL, Number(latestDaily.overdue_amount) || 0, Number(latestDaily.overdue_amount) || 0, 1, latestDaily.date, latestDaily.date, s.OVERDUE_DEFINITION || '원천값');
    ok('연체일수', APP.ALL, Number(latestDaily.max_overdue_days) || 0, Number(latestDaily.max_overdue_days) || 0, 1, latestDaily.date, latestDaily.date, s.OVERDUE_DEFINITION || '원천값');
  }

  // 한도 사용률: 결합 방식이 확정되지 않으면 산출하지 않는다
  var applicable = applicableLimit_(p.limits || [], s.LIMIT_COMBINE);
  if (applicable.status !== '정상') na('한도사용률', APP.ALL, '산출불가', applicable.reason);
  else if (balance === null) na('한도사용률', APP.ALL, '산출불가', '잔액 자료 없음');
  else if (applicable.amount <= 0) na('한도사용률', APP.ALL, '산출불가', '적용 한도 0');
  else ok('한도사용률', APP.ALL, balance / applicable.amount, balance, applicable.amount, latestDate, latestDate, applicable.method);

  // 구매 증감 (S04): 당월 동일 경과 경매일, 직전 3개월 평균, 부류 전체 대비
  // 일별 자료가 없고 월별 사업실적만 있는 운영에서는 월 합계끼리 비교한다(기준일 = 최신 월 말일)
  var mtd = mtdCompare_(p.daily, p.calendar, ws, base);
  var monthlyOnly = !(p.daily || []).length && monthlyOnlyCompare_(p.monthly, ws, base);
  if (monthlyOnly) mtd = monthlyOnly;
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) {
    var g = mtd.byCategory[c];
    if (isNew) { na('구매증감_전년', c, '비교불가', '신규'); return; }
    if (g.growth.status !== '정상') na('구매증감_전년', c, '비교불가', g.growth.reason, mtd.prevPeriod);
    else ok('구매증감_전년', c, g.growth.value, g.amount, g.prevAmount, mtd.prevPeriod, base, mtd.basis);
    var ym = ymOf_(base), sum = 0, days = 0, months = 0;
    for (var k = 1; k <= 3; k++) {
      var m = p.monthly.filter(function (r) { return r.wholesaler_id === ws && r.ym === addMonths_(ym, -k) && r.category === c; })[0];
      if (m) { sum += Number(m.purchase_amount) || 0; days += Number(m.auction_days) || 0; months++; }
    }
    if (monthlyOnly) {
      // 월별 자료만: 당월 합계 ÷ 직전 3개월 월평균
      if (!months) na('구매증감_3개월', c, '비교불가', '비교기간 자료 없음');
      else if (sum <= 0) na('구매증감_3개월', c, '비교불가', '직전 3개월 실적 0');
      else ok('구매증감_3개월', c, g.amount / (sum / months) - 1, g.amount, Math.round(sum / months), addMonths_(ym, -3) + '-01', monthEnd_(addMonths_(ym, -1)), '직전 ' + months + '개월 월평균(월별 자료)');
    } else if (!days || !mtd.elapsedAuctionDays) na('구매증감_3개월', c, '비교불가', '비교기간 자료 없음');
    else {
      // 직전 3개월 평균 대비: 당월 경과 경매일 수 × (직전 3개월 일평균)
      var expected = sum / days * mtd.elapsedAuctionDays;
      if (expected <= 0) na('구매증감_3개월', c, '비교불가', '직전 3개월 실적 0');
      else ok('구매증감_3개월', c, g.amount / expected - 1, g.amount, Math.round(expected), addMonths_(ym, -3) + '-01', monthEnd_(addMonths_(ym, -1)), '동일 경과 경매일 환산');
    }
    var mk = p.marketGrowth && p.marketGrowth[c];
    if (mk && mk.status === '정상' && g.growth.status === '정상') ok('구매증감_시장대비', c, g.growth.value - mk.value, g.growth.value, mk.value, mtd.prevPeriod, base, '중도매인 증감률 − 부류 전체 증감률');
    else na('구매증감_시장대비', c, '비교불가', mk ? mk.reason || '중도매인 증감률 없음' : '부류 전체 증감률 없음');
  });

  var byName = {};
  out.forEach(function (m) { byName[m.metric + '|' + m.category] = m; });
  return { rows: out, byName: byName, isNew: !!isNew };
}

/** 적용 한도 결정. 결합 방식은 내부 규정 확인 전까지 '미확인' → 산출불가 */
function applicableLimit_(limits, mode) {
  var by = {};
  limits.forEach(function (l) { by[l.limit_type] = (by[l.limit_type] || 0) + Number(l.amount || 0); });
  if (!mode || mode === '미확인') return { status: '산출불가', reason: '적용 한도 결합 방식 미확인(설정 LIMIT_COMBINE)' };
  if (mode === '기본한도만') return by['기본한도'] ? { status: '정상', amount: by['기본한도'], method: '기본한도만' } : { status: '산출불가', reason: '기본한도 없음' };
  if (mode === '기본+추가') return { status: '정상', amount: (by['기본한도'] || 0) + (by['추가한도'] || 0), method: '기본+추가' };
  if (mode === '전체합산') return { status: '정상', amount: Object.keys(by).reduce(function (s, k) { return s + by[k]; }, 0), method: '전체합산' };
  return { status: '산출불가', reason: '알 수 없는 결합 방식: ' + mode };
}

/** 부류 전체(시장) 증감률: 모든 영업 중 중도매인의 당월 동일 경과일 합계 vs 전년 */
function marketGrowth_(daily, calendar, wsIds, baseDate, monthly) {
  var tot = {}, byWs = indexDailyByWs_(daily), monthlyOnly = !(daily || []).length && (monthly || []).length > 0;
  APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) { tot[c] = { cur: 0, prev: 0 }; });
  wsIds.forEach(function (ws) {
    var m = (monthlyOnly && monthlyOnlyCompare_(monthly, ws, baseDate)) || mtdCompare_(byWs[ws] || [], calendar, ws, baseDate);
    APP.CATEGORIES.concat([APP.ALL]).forEach(function (c) { tot[c].cur += m.byCategory[c].amount; tot[c].prev += m.byCategory[c].prevAmount; });
  });
  var out = {};
  Object.keys(tot).forEach(function (c) { var g = growthRate_(tot[c].cur, tot[c].prev); out[c] = g; out[c].cur = tot[c].cur; out[c].prev = tot[c].prev; });
  return out;
}

/* ───────────── 신호 판정 ───────────── */

/**
 * 규칙별 판정. 데이터 상태가 정상이 아니면 호출하지 않는다(판정 보류).
 * @return [{ rule_id, severity, evidence:{...} }]
 */
function evaluateSignals_(p) {
  var s = p.settings, m = p.metrics.byName, hits = [], bizStatus = p.bizStatus;
  var ALL = APP.ALL;
  function g(name, cat) { return m[name + '|' + (cat || ALL)]; }
  function ev(rule, evidence, severity) { hits.push({ rule_id: rule, severity: severity || SIGNAL_RULES[rule].severity, evidence: evidence }); }

  var inactive = bizStatus === '휴업' || bizStatus === '폐업';
  // S01 회전율 저하
  var t = g('회전율'), tp = g('회전율_직전'), cd = g('회수일수');
  if (t && tp && t.status === '정상' && tp.status === '정상' && cd && cd.status === '정상') {
    var drop = tp.value > 0 ? (1 - t.value / tp.value) * 100 : 0;
    if (drop >= settingNum_(s, 'S01_DROP_PCT', 30) && cd.value >= settingNum_(s, 'S01_MIN_DAYS', 20)) {
      ev('S01', { turnover: round2_(t.value), prevTurnover: round2_(tp.value), dropPct: round2_(drop), collectionDays: round2_(cd.value), period: t.period_from + '~' + t.period_to, prevPeriod: tp.period_from + '~' + tp.period_to, method: t.method });
    }
  }
  // S02 미수금 증가
  var b = g('잔액'), ab = g('평균잔액');
  if (b && ab && b.status === '정상' && ab.status === '정상' && ab.value > 0) {
    var inc = b.value - ab.value;
    if (b.value >= ab.value * settingNum_(s, 'S02_RATIO', 1.3) && inc >= settingNum_(s, 'S02_MIN_AMOUNT', 0)) {
      ev('S02', { balance: b.value, avgBalance: ab.value, ratio: round2_(b.value / ab.value), increase: inc, period: ab.period_from + '~' + ab.period_to });
    }
  }
  // S03 연체
  var od = g('연체금액'), odd = g('연체일수');
  if (od && odd && od.status === '정상' && od.value > 0) {
    var longD = settingNum_(s, 'S03_LONG_DAYS', 30);
    ev('S03', { overdueAmount: od.value, overdueDays: odd.value, stage: odd.value >= longD ? '장기화' : '발생', definition: od.method }, odd.value >= longD ? '위험' : '경고');
  }
  // S04 구매 급감 (신규·휴업·폐업 제외, 이중 조건 + 시장 대비)
  if (!p.metrics.isNew && !inactive) {
    var y = g('구매증감_전년'), m3 = g('구매증감_3개월'), mk = g('구매증감_시장대비');
    if (y && m3 && mk && y.status === '정상' && m3.status === '정상' && mk.status === '정상') {
      if (y.value * 100 <= settingNum_(s, 'S04_YOY_PCT', -40) && m3.value * 100 <= settingNum_(s, 'S04_MA3_PCT', -30) && mk.value * 100 <= settingNum_(s, 'S04_MARKET_GAP_PP', -20)) {
        ev('S04', { yoyPct: round2_(y.value * 100), ma3Pct: round2_(m3.value * 100), vsMarketPp: round2_(mk.value * 100), marketPct: round2_(mk.denominator * 100), basis: y.method, amount: y.numerator, prevAmount: y.denominator });
      }
    }
  }
  // S05 한도 사용률 (결합 방식 미확인이면 참고 신호로만: 산출불가 상태이므로 자동 생성하지 않음)
  var lu = g('한도사용률');
  if (lu && lu.status === '정상') {
    var pct = lu.value * 100, warn = settingNum_(s, 'S05_WARN_PCT', 80), alert = settingNum_(s, 'S05_ALERT_PCT', 95);
    if (pct >= warn) ev('S05', { usagePct: round2_(pct), balance: lu.numerator, limit: lu.denominator, method: lu.method }, pct >= alert ? '경고' : '주의');
  }
  // S06 기한 도래
  (p.expiring || []).forEach(function (x) {
    if (x.dday <= settingNum_(s, 'S06_DAYS', 60)) ev('S06', { kind: x.kind, id: x.id, label: x.label, date: x.date, dday: x.dday }, '정보');
  });
  // S07 복수 징후 (S01~S05 중 2개 이상)
  var risk = hits.filter(function (h) { return ['S01', 'S02', 'S03', 'S04', 'S05'].indexOf(h.rule_id) >= 0; });
  if (risk.length >= settingNum_(s, 'S07_MIN_SIGNALS', 2)) {
    ev('S07', { rules: risk.map(function (h) { return h.rule_id; }) }, '경고');
    risk.forEach(function (h) { h.severity = escalate_(h.severity); });
  }
  return hits;
}

function escalate_(sev) { return { '정보': '주의', '주의': '경고', '경고': '위험', '위험': '위험' }[sev] || sev; }
function round2_(v) { return Math.round(v * 100) / 100; }

/**
 * 신호 구간 갱신(순수): 기존 열린 신호와 이번 판정 결과를 맞춰 변경 목록을 낸다.
 * @param existing 해당 중도매인의 status in (연결, 보류) 신호
 * @param hits 이번 판정
 * @param dataOk 이번 기준일 데이터 정상 여부
 * @return { create:[], update:[] }  (update 는 기존 행 객체를 수정해 반환)
 */
function diffSignals_(existing, hits, baseDate, dataOk, settings, paramsJson) {
  var create = [], update = [], seen = {};
  var missN = settingNum_(settings, 'RESOLVE_MISS_N', 5);
  existing.forEach(function (sg) {
    seen[sg.rule_id] = sg;
    if (!dataOk) { if (sg.status !== '보류') { sg.status = '보류'; update.push(sg); } return; }
    var hit = hits.filter(function (h) { return h.rule_id === sg.rule_id; })[0];
    if (hit) {
      sg.status = '연결'; sg.last_date = baseDate; sg.miss_count = 0; sg.severity = hit.severity;
      sg.evidence_json = JSON.stringify(hit.evidence); sg.params_json = paramsJson;
      update.push(sg);
    } else {
      sg.miss_count = Number(sg.miss_count || 0) + 1;
      if (sg.status === '보류') sg.status = '연결';
      if (sg.miss_count >= missN) { sg.status = '해소'; sg.resolved_date = baseDate; }
      update.push(sg);
    }
  });
  if (dataOk) hits.forEach(function (h) {
    if (seen[h.rule_id]) return;
    create.push({ rule_id: h.rule_id, severity: h.severity, status: '발생', first_date: baseDate, last_date: baseDate,
      miss_count: 0, evidence_json: JSON.stringify(h.evidence), params_json: paramsJson, resolved_date: '', false_alarm_reason: '' });
  });
  return { create: create, update: update };
}

/**
 * 관리 건 연결 규칙(설계 5.5): 열린 관리 건이 있으면 연결, 종결 후 재발 기간 내 같은 계열이면 재발, 아니면 신규.
 * S06(기한 도래)만 있으면 관리 건을 만들지 않는다.
 * @return { action: 'link' | 'recur' | 'new' | 'none', caseId?, parentId? }
 */
function decideCase_(cases, newSignals, baseDate, settings) {
  var risky = newSignals.filter(function (s) { return s.rule_id !== 'S06'; });
  if (!risky.length) return { action: 'none' };
  var open = cases.filter(function (c) { return c.status !== '종결' && !c.is_deleted; })[0];
  if (open) return { action: 'link', caseId: open.case_id };
  var recurDays = settingNum_(settings, 'RECURRENCE_DAYS', 90);
  var recent = cases.filter(function (c) { return c.status === '종결' && c.closed_date && daysBetween_(c.closed_date, baseDate) <= recurDays; })
    .sort(function (a, b) { return a.closed_date < b.closed_date ? 1 : -1; })[0];
  if (recent) return { action: 'recur', parentId: recent.case_id };
  return { action: 'new' };
}

/** 경매일 기준 n일 뒤 */
function addAuctionDays_(calendar, from, n) {
  var days = calendar.filter(function (c) { return c.is_auction_day && c.date > from; }).map(function (c) { return c.date; }).sort();
  return days[n - 1] || addDays_(from, n);
}

/* ══════════════ Signals.gs ══════════════ */
/**
 * Signals.gs — 정기 처리의 지표·신호 단계 (저장소 접근 포함)
 * 순서: 설정 읽기 → 중도매인별 지표 계산 → A_METRIC 저장 → 신호 판정 → 신호 구간 갱신 → 관리 건 연결/생성 → 기한 갱신
 * 데이터 상태가 정상이 아닌 기준일에는 신호를 판정하지 않고 기존 신호를 '보류'로 둔다.
 */

function readSettings_() {
  var m = {};
  readTable_('DB_MASTER', 'M_SETTING').forEach(function (r) { if (!r.is_deleted) m[r.key] = r.value; });
  return m;
}

function settingsSnapshotJson_(settings) {
  var keys = Object.keys(settings).filter(function (k) { return /^S0\d_|^RESOLVE|^TURNOVER|^NEW_WS|^LIMIT|^OVERDUE|^CATEGORY/.test(k); }).sort();
  var o = {};
  keys.forEach(function (k) { o[k] = settings[k]; });
  return JSON.stringify(o);
}

function expiringFor_(wsId, asOf, settings) {
  var warnTo = addDays_(asOf, settingNum_(settings, 'S06_DAYS', 60)), out = [];
  asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', wsId, asOf).forEach(function (c) {
    if (c.expiry_date && c.expiry_date >= asOf && c.expiry_date <= warnTo)
      out.push({ kind: '담보', id: c.collateral_id, label: c.collateral_type, date: c.expiry_date, dday: daysBetween_(asOf, c.expiry_date) });
  });
  asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', wsId, asOf).forEach(function (g) {
    if (g.period_to && g.period_to >= asOf && g.period_to <= warnTo)
      out.push({ kind: '보증', id: g.guarantee_id, label: g.scope || '연대보증', date: g.period_to, dday: daysBetween_(asOf, g.period_to) });
  });
  return out;
}

/**
 * 지표·신호 단계. aggregateAll_ 뒤에 실행한다.
 * @return { metrics, signalsCreated, signalsUpdated, casesCreated, held }
 */
function evaluateAll_(runId, trigger) {
  var started = nowStr_();
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) { logJob_(runId, 'SIGNALS', '건너뜀', started, 0, 0, '기준일 없음', trigger); return { held: true }; }
  var settings = readSettings_(), paramsJson = settingsSnapshotJson_(settings);
  var dataOk = st.data_status === '정상';
  var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var dq = readTable_('DB_AGG', 'A_DQ');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');
  var limitsAll = readTable_('DB_MASTER', 'M_LIMIT');
  var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
  var activeIds = wholesalers.filter(function (w) { return statusOn_(statusHist, w.wholesaler_id, base) === '정상'; }).map(function (w) { return w.wholesaler_id; });
  var market = marketGrowth_(daily, calendar, activeIds, base, monthly);

  var metricRows = [], hitsByWs = {}, wsDataOk = {};
  wholesalers.forEach(function (w) {
    var ws = w.wholesaler_id;
    var limits = asOfVersions_(limitsAll, 'limit_id', ws, base);
    var m = computeMetrics_({ ws: ws, baseDate: base, daily: dailyByWs[ws] || [], monthly: monthly, calendar: calendar, limits: limits,
      balByDate: balIdx[ws] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: market });
    m.rows.forEach(function (r) { r.calc_run_id = runId; metricRows.push(r); });
    // 중도매인 단위 데이터 상태: 전체 정상 + 최근 30일 누락·불일치 없음
    var from = addDays_(base, -APP.DQ_LOOKBACK_DAYS);
    var bad = dq.some(function (d) { return d.wholesaler_id === ws && d.date > from && d.date <= base && d.status !== '경고'; });
    wsDataOk[ws] = dataOk && !bad;
    hitsByWs[ws] = wsDataOk[ws] ? evaluateSignals_({ settings: settings, metrics: m, bizStatus: statusOn_(statusHist, ws, base),
      expiring: expiringFor_(ws, base, settings) }) : [];
  });
  // 기준일별 스냅샷: 같은 기준일 행은 교체, 다른 기준일은 보존
  // 보존 규칙: 최근 METRIC_KEEP_DAYS 는 매 기준일, 그 이전은 월말 경매일 스냅샷만 남긴다(판단 근거는 T_BASIS 에 따로 고정돼 있음)
  var keepFrom = addDays_(base, -settingNum_(settings, 'METRIC_KEEP_DAYS', 45)), monthEnds = {};
  calendar.forEach(function (c) { if (c.is_auction_day) { var ym = ymOf_(c.date); if (!monthEnds[ym] || c.date > monthEnds[ym]) monthEnds[ym] = c.date; } });
  var monthEndSet = {}; Object.keys(monthEnds).forEach(function (ym) { monthEndSet[monthEnds[ym]] = true; });
  var kept = readTable_('DB_AGG', 'A_METRIC').filter(function (r) { return r.base_date !== base && (r.base_date >= keepFrom || monthEndSet[r.base_date]); }).map(stripInternal_);
  rewriteTable_('DB_AGG', 'A_METRIC', kept.concat(metricRows));

  // 신호 구간 갱신 + 관리 건
  var signals = readTable_('DB_WORK', 'T_SIGNAL'), cases = readTable_('DB_WORK', 'T_CASE');
  var created = 0, updated = 0, casesCreated = 0, newRows = [], now = nowStr_();
  var sys = ownerAsUser_();
  wholesalers.forEach(function (w) {
    var ws = w.wholesaler_id;
    var open = signals.filter(function (s) { return s.wholesaler_id === ws && (s.status === '연결' || s.status === '보류' || s.status === '발생'); });
    var d = diffSignals_(open, hitsByWs[ws], base, wsDataOk[ws], settings, paramsJson);
    d.update.forEach(function (s) { s.updated_at = now; writeObject_('DB_WORK', 'T_SIGNAL', s); updated++; });
    if (!d.create.length) return;
    var wsCases = cases.filter(function (c) { return c.wholesaler_id === ws; });
    var decision = decideCase_(wsCases, d.create, base, settings);
    var caseId = '';
    if (decision.action === 'link') caseId = decision.caseId;
    else if (decision.action === 'new' || decision.action === 'recur') {
      var c = createCase_(sys, ws, base, decision.action === 'recur' ? decision.parentId : '', '자동(신호)', settings, calendar);
      cases.push(c); caseId = c.case_id; casesCreated++;
    }
    d.create.forEach(function (s) {
      s.signal_id = uid_('SG'); s.wholesaler_id = ws; s.case_id = caseId; s.status = caseId ? '연결' : '발생'; s.updated_at = now;
      newRows.push(s); created++;
    });
  });
  appendObjects_('DB_WORK', 'T_SIGNAL', newRows);
  invalidate_('DB_WORK', 'T_SIGNAL');
  mergeStatus_({ signal_base_date: base, signal_params: paramsJson, signals_open: String(readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.status === '연결' || s.status === '보류'; }).length) });
  logJob_(runId, 'SIGNALS', '완료', started, metricRows.length, 0,
    '지표 ' + metricRows.length + ' / 신호 생성 ' + created + ' 갱신 ' + updated + ' / 관리 건 생성 ' + casesCreated + (dataOk ? '' : ' / 데이터 상태 ' + st.data_status + ' → 신호 판정 보류'), trigger);
  return { metrics: metricRows.length, signalsCreated: created, signalsUpdated: updated, casesCreated: casesCreated, held: !dataOk };
}

/** 관리 건 생성(잠금 밖에서 호출하지 않는다: evaluateAll_ 은 파이프라인 잠금 안, 수동 생성은 withLock_ 안) */
function createCase_(user, wsId, openedDate, parentId, origin, settings, calendar) {
  var assignees = readTable_('DB_MASTER', 'M_ASSIGNMENT').filter(function (a) {
    return a.wholesaler_id === wsId && !a.is_deleted && a.valid_from <= openedDate && openedDate <= (a.valid_to || APP.OPEN_END);
  });
  var seq = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return c.case_id.indexOf('C-' + openedDate.substring(0, 4)) === 0; }).length + 1;
  var row = {
    case_id: 'C-' + openedDate.substring(0, 4) + '-' + ('0000' + seq).slice(-4), wholesaler_id: wsId,
    status: assignees.length ? '동향확인중' : '접수', owner_id: '', auctioneer_id: assignees.length ? assignees[0].user_id : '',
    opened_date: openedDate, origin: origin, parent_case_id: parentId || '', is_recurrence: !!parentId,
    trend_due: assignees.length ? addAuctionDays_(calendar, openedDate, settingNum_(settings, 'SLA_TREND_DAYS', 3)) : '',
    action_due: '', result_class: '', close_reason: '', closed_date: '', recheck_date: '', basis_snapshot_id: '', summary: ''
  };
  Object.assign(row, newAuditFields_(user));
  appendObjects_('DB_WORK', 'T_CASE', [row]);
  appendObjects_('DB_WORK', 'T_CASE_HIST', [{ hist_id: uid_('CH'), case_id: row.case_id, from_status: '', to_status: row.status,
    reason: origin + (parentId ? ' / 재발(이전 ' + parentId + ')' : ''), at: nowStr_(), user_id: user.user_id }]);
  audit_(user, 'CREATE', 'DB_WORK', 'T_CASE', row.case_id, null, row, origin);
  return row;
}

/* ══════════════ Work.gs ══════════════ */
/**
 * Work.gs — 관리 건·동향보고·조치·승인·종결·재점검 업무 로직
 * 상태 전환(설계 7.2)은 transitionCase_ 한 곳에서만 수행하고 T_CASE_HIST 에 남긴다.
 */

function findCase_(caseId) {
  var c = readTable_('DB_WORK', 'T_CASE').filter(function (r) { return r.case_id === caseId && !r.is_deleted; })[0];
  if (!c) throw new Error('관리 건을 찾을 수 없습니다: ' + caseId);
  return c;
}

function transitionCase_(user, c, to, reason, extra) {
  var before = JSON.parse(JSON.stringify(c)), from = c.status;
  if (CASE_STATUS.indexOf(to) < 0) throw new Error('알 수 없는 상태: ' + to);
  c.status = to;
  Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
  c.updated_at = nowStr_(); c.updated_by = user.user_id; c.row_version = Number(c.row_version) + 1;
  writeObject_('DB_WORK', 'T_CASE', c);
  appendObjects_('DB_WORK', 'T_CASE_HIST', [{ hist_id: uid_('CH'), case_id: c.case_id, from_status: from, to_status: to, reason: reason || '', at: nowStr_(), user_id: user.user_id }]);
  audit_(user, 'TRANSITION', 'DB_WORK', 'T_CASE', c.case_id, before, c, reason);
  return c;
}

/** 수동 관리 건 생성(채권담당·관리자). 열린 관리 건이 있으면 그 건을 돌려준다. */
function openCaseManually_(user, wsId, reason) {
  requireText_(reason, '개시 사유');
  if (!findWs_(wsId)) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_CASE');
    var open = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return c.wholesaler_id === wsId && c.status !== '종결' && !c.is_deleted; })[0];
    if (open) return { existing: true, caseRow: stripInternal_(open) };
    var settings = readSettings_(), today = todayStr_();
    var decision = decideCase_(readTable_('DB_WORK', 'T_CASE').filter(function (c) { return c.wholesaler_id === wsId; }), [{ rule_id: 'MANUAL' }], today, settings);
    var created = createCase_(user, wsId, today, decision.action === 'recur' ? decision.parentId : '', '수동: ' + reason, settings, readTable_('DB_MASTER', 'M_CALENDAR'));
    invalidate_('DB_WORK', 'T_CASE');
    var c = findCase_(created.case_id);   // 저장된 행(행 번호 포함)을 다시 읽어 책임자 지정
    c.owner_id = user.user_id; c.row_version = Number(c.row_version) + 1; c.updated_at = nowStr_(); c.updated_by = user.user_id;
    writeObject_('DB_WORK', 'T_CASE', c);
    return { existing: false, caseRow: stripInternal_(c) };
  });
}

/* ───────────── 동향보고 ───────────── */

function saveTrendReport_(user, o, submit) {
  var c = findCase_(requireText_(o.case_id, '관리건ID'));
  if (user.role === 'AUCTIONEER' && c.auctioneer_id && c.auctioneer_id !== user.user_id) deny_('이 관리 건의 담당 경매사가 아닙니다.');
  if (c.status === '종결') throw new Error('종결된 관리 건에는 동향보고를 쓸 수 없습니다.');
  var facts = Array.isArray(o.facts) ? o.facts.filter(function (f) { return f && String(f.text || f).trim(); }) : [];
  if (submit) {
    requireText_(o.checked_date, '확인일'); optDate_(o.checked_date, '확인일');
    requireText_(o.check_method, '확인 방법');
    if (!facts.length) throw new Error('확인된 사실을 1건 이상 입력하세요(의견은 별도 칸).');
    if (RESULT_CLASSES.indexOf(o.result_class) < 0) throw new Error('확인 결과 분류를 선택하세요.');
    requireText_(o.recheck_date, '재점검일'); optDate_(o.recheck_date, '재점검일');
  }
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_TREND');
    var reports = readTable_('DB_WORK', 'T_TREND').filter(function (r) { return r.case_id === c.case_id; });
    var reportId = o.report_id || '', version = 1, draft = null;
    if (reportId) {
      var same = reports.filter(function (r) { return r.report_id === reportId; });
      if (!same.length) throw new Error('보고서를 찾을 수 없습니다.');
      draft = same.filter(function (r) { return r.status === '임시' ; })[0];
      version = same.reduce(function (mx, r) { return Math.max(mx, Number(r.version)); }, 0) + (draft ? 0 : 1);
    } else reportId = uid_('TR');
    var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === c.case_id; })
      .map(function (s) { return { rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id, first_date: s.first_date, last_date: s.last_date, evidence: JSON.parse(s.evidence_json || '{}') }; });
    var row = draft || {};
    Object.assign(row, {
      report_id: reportId, version: draft ? draft.version : version, case_id: c.case_id, wholesaler_id: c.wholesaler_id,
      status: submit ? '제출' : '임시', written_date: todayStr_(), writer_id: draft ? draft.writer_id : user.user_id,
      signals_json: JSON.stringify(signals), checked_date: o.checked_date || '', check_method: o.check_method || '',
      counterpart: o.counterpart || '', facts_json: JSON.stringify(facts.map(function (f) { return typeof f === 'string' ? { text: f } : f; })),
      business_status: o.business_status || '', payment_plan: o.payment_plan || '', evidence_ids: o.evidence_ids || '',
      opinion: o.opinion || '', further_checks: o.further_checks || '', result_class: o.result_class || '',
      followup: o.followup || '', followup_owner: o.followup_owner || '', followup_due: optDate_(o.followup_due, '후속 기한'),
      recheck_date: optDate_(o.recheck_date, '재점검일'), official_source: o.official_source || '시스템 입력',
      submitted_at: submit ? nowStr_() : ''
    });
    if (draft) { row.updated_at = nowStr_(); row.updated_by = user.user_id; row.row_version = Number(row.row_version) + 1; writeObject_('DB_WORK', 'T_TREND', row); }
    else { Object.assign(row, newAuditFields_(user)); appendObjects_('DB_WORK', 'T_TREND', [row]); }
    audit_(user, submit ? 'SUBMIT' : 'SAVE_DRAFT', 'DB_WORK', 'T_TREND', reportId + '#v' + row.version, null, row, '동향보고');
    if (submit) {
      var extra = { result_class: o.result_class, recheck_date: o.recheck_date };
      if (o.result_class === '채권 검토 필요') {
        var settings = readSettings_();
        extra.action_due = addAuctionDays_(readTable_('DB_MASTER', 'M_CALENDAR'), todayStr_(), settingNum_(settings, 'SLA_ACTION_DAYS', 5));
        transitionCase_(user, c, '조치진행', '동향보고 결과: 채권 검토 필요', extra);
      } else if (o.result_class === '판정 보류(자료 부족)') {
        transitionCase_(user, c, '동향확인중', '동향보고 결과: 판정 보류(자료 부족)', extra);
      } else {
        transitionCase_(user, c, '확인완료', '동향보고 결과: ' + o.result_class, extra);
      }
    }
    return stripInternal_(row);
  });
}

/** 경매사의 오탐 의견 → 채권담당·관리자 확정 */
function flagFalseAlarm_(user, signalId, reason, confirm) {
  requireText_(reason, '사유');
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_SIGNAL');
    var s = readTable_('DB_WORK', 'T_SIGNAL').filter(function (r) { return r.signal_id === signalId; })[0];
    if (!s) throw new Error('신호를 찾을 수 없습니다.');
    var before = JSON.parse(JSON.stringify(s));
    if (confirm) {
      if (!can_(user.role, 'case.manage')) deny_('오탐 확정 권한이 없습니다.');
      s.status = '오탐확정'; s.resolved_date = todayStr_();
      s.false_alarm_reason = (s.false_alarm_reason ? s.false_alarm_reason + ' / ' : '') + '확정: ' + reason;
    } else {
      s.false_alarm_reason = '의견(' + user.user_id + '): ' + reason;
    }
    s.updated_at = nowStr_();
    writeObject_('DB_WORK', 'T_SIGNAL', s);
    audit_(user, confirm ? 'FALSE_ALARM_CONFIRM' : 'FALSE_ALARM_OPINION', 'DB_WORK', 'T_SIGNAL', signalId, before, s, reason);
    return stripInternal_(s);
  });
}

/* ───────────── 조치·승인 ───────────── */

function actionTypeDef_(type) {
  var d = ACTION_TYPES.filter(function (a) { return a.type === type; })[0];
  if (!d) throw new Error('조치 유형 오류: ' + type);
  return d;
}

function createAction_(user, o) {
  var c = findCase_(requireText_(o.case_id, '관리건ID'));
  if (c.status === '종결') throw new Error('종결된 관리 건입니다.');
  var def = actionTypeDef_(requireText_(o.action_type, '조치 유형'));
  requireText_(o.content, '조치 내용'); requireText_(o.due_date, '처리 기한'); optDate_(o.due_date, '처리 기한');
  return withLock_(function () {
    var row = { action_id: uid_('AC'), case_id: c.case_id, wholesaler_id: c.wholesaler_id, action_type: def.type,
      owner_id: o.owner_id || user.user_id, due_date: o.due_date, content: o.content, needs_approval: def.needsApproval || !!o.needs_approval,
      approval_status: '미요청', status: '진행', result: '', done_date: '', attach_ids: '', situation_code: o.situation_code || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_WORK', 'T_ACTION', [row]);
    audit_(user, 'CREATE', 'DB_WORK', 'T_ACTION', row.action_id, null, row, '조치 등록');
    if (c.status === '확인완료' || c.status === '동향확인중' || c.status === '접수') transitionCase_(user, c, '조치진행', '조치 등록');
    if (!c.owner_id) { c.owner_id = user.user_id; c.row_version = Number(c.row_version) + 1; writeObject_('DB_WORK', 'T_CASE', c); }
    return stripInternal_(row);
  });
}

function findAction_(actionId) {
  var a = readTable_('DB_WORK', 'T_ACTION').filter(function (r) { return r.action_id === actionId && !r.is_deleted; })[0];
  if (!a) throw new Error('조치를 찾을 수 없습니다: ' + actionId);
  return a;
}

function requestApproval_(user, actionId) {
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_ACTION');
    var a = findAction_(actionId);
    if (!a.needs_approval) throw new Error('승인이 필요하지 않은 조치입니다.');
    if (a.approval_status === '승인대기' || a.approval_status === '승인') throw new Error('이미 ' + a.approval_status + ' 상태입니다.');
    var c = findCase_(a.case_id);
    var basis = createBasisSnapshot_(user, c, '승인 요청: ' + a.action_type);
    var ap = { approval_id: uid_('AP'), action_id: actionId, case_id: c.case_id, basis_snapshot_id: basis.basis_snapshot_id,
      requested_by: user.user_id, requested_at: nowStr_(), decided_by: '', decided_at: '', decision: '대기', reason: '' };
    appendObjects_('DB_WORK', 'T_APPROVAL', [ap]);
    var before = JSON.parse(JSON.stringify(a));
    a.approval_status = '승인대기'; a.updated_at = nowStr_(); a.updated_by = user.user_id; a.row_version = Number(a.row_version) + 1;
    writeObject_('DB_WORK', 'T_ACTION', a);
    audit_(user, 'REQUEST_APPROVAL', 'DB_WORK', 'T_ACTION', actionId, before, a, '승인 요청');
    if (c.status === '조치진행') transitionCase_(user, c, '승인대기', '조치 승인 요청: ' + a.action_type);
    return { action: stripInternal_(a), approval: ap, basis: basis };
  });
}

function decideApproval_(user, approvalId, decision, reason) {
  if (['승인', '반려'].indexOf(decision) < 0) throw new Error('결정은 승인/반려 중 하나입니다.');
  if (decision === '반려') requireText_(reason, '반려 사유');
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_APPROVAL'); invalidate_('DB_WORK', 'T_ACTION');
    var ap = readTable_('DB_WORK', 'T_APPROVAL').filter(function (r) { return r.approval_id === approvalId; })[0];
    if (!ap) throw new Error('승인 요청을 찾을 수 없습니다.');
    if (ap.decision !== '대기') throw new Error('이미 처리된 요청입니다(' + ap.decision + ').');
    if (!APP.ALLOW_SELF_APPROVAL && ap.requested_by === user.user_id) throw new Error('요청자 본인은 승인·반려할 수 없습니다.');
    var a = findAction_(ap.action_id), c = findCase_(ap.case_id);
    var before = JSON.parse(JSON.stringify(ap));
    ap.decision = decision; ap.decided_by = user.user_id; ap.decided_at = nowStr_(); ap.reason = reason || '';
    writeObject_('DB_WORK', 'T_APPROVAL', ap);
    a.approval_status = decision; a.updated_at = nowStr_(); a.updated_by = user.user_id; a.row_version = Number(a.row_version) + 1;
    writeObject_('DB_WORK', 'T_ACTION', a);
    audit_(user, decision === '승인' ? 'APPROVE' : 'REJECT', 'DB_WORK', 'T_APPROVAL', approvalId, before, ap, reason || '');
    var pending = readTable_('DB_WORK', 'T_ACTION').some(function (x) { return x.case_id === c.case_id && x.approval_status === '승인대기' && !x.is_deleted; });
    if (c.status === '승인대기' && !pending) transitionCase_(user, c, '조치진행', '승인 처리 완료: ' + decision);
    return { approval: ap, action: stripInternal_(a) };
  });
}

function completeAction_(user, actionId, result, doneDate) {
  requireText_(result, '결과 내용');
  doneDate = optDate_(doneDate, '완료일') || todayStr_();
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_ACTION');
    var a = findAction_(actionId);
    if (a.needs_approval && a.approval_status !== '승인') throw new Error('승인이 완료되지 않은 조치는 결과를 등록할 수 없습니다(' + a.approval_status + ').');
    var before = JSON.parse(JSON.stringify(a));
    a.status = '완료'; a.result = result; a.done_date = doneDate;
    a.updated_at = nowStr_(); a.updated_by = user.user_id; a.row_version = Number(a.row_version) + 1;
    writeObject_('DB_WORK', 'T_ACTION', a);
    audit_(user, 'COMPLETE', 'DB_WORK', 'T_ACTION', actionId, before, a, '조치 결과 등록');
    return stripInternal_(a);
  });
}

/* ───────────── 판단 근거 스냅샷·종결·재점검 ───────────── */

function createBasisSnapshot_(user, c, note) {
  var st = readStatus_(), base = st.latest_base_date || todayStr_(), ws = c.wholesaler_id, today = todayStr_();
  var pick = function (t, idf) { return asOfVersions_(readTable_('DB_MASTER', t), idf, ws, today).map(stripInternal_); };
  var metrics = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.wholesaler_id === ws && m.base_date === base; })
    .map(function (m) { return { metric: m.metric, category: m.category, value: m.value, status: m.status, reason: m.reason, period: m.period_from + '~' + m.period_to, method: m.method }; });
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === c.case_id; })
    .map(function (s) { return { signal_id: s.signal_id, rule_id: s.rule_id, status: s.status, first_date: s.first_date, last_date: s.last_date, evidence: s.evidence_json, params: s.params_json }; });
  var docs = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); })
    .map(function (v) { return { doc_id: v.doc_id, version: v.version, effective_from: v.effective_from, file_hash: v.file_hash }; });
  var row = { basis_snapshot_id: uid_('BS'), case_id: c.case_id, created_at: nowStr_(), created_by: user.user_id, base_date: base,
    limits_json: JSON.stringify(pick('M_LIMIT', 'limit_id')), collaterals_json: JSON.stringify(pick('M_COLLATERAL', 'collateral_id')),
    guarantees_json: JSON.stringify(pick('M_GUARANTEE', 'guarantee_id').map(function (g) { delete g.guarantor_ref; return g; })),
    metrics_json: JSON.stringify(metrics), signals_json: JSON.stringify(signals), docs_json: JSON.stringify(docs),
    settings_json: JSON.stringify({ note: note, data_status: st.data_status, settings: JSON.parse(settingsSnapshotJson_(readSettings_())) }) };
  appendObjects_('DB_WORK', 'T_BASIS', [row]);
  return row;
}

function closeCase_(user, caseId, closeReason, recheckDate, summary) {
  requireText_(closeReason, '종결 사유');
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_CASE'); invalidate_('DB_WORK', 'T_ACTION');
    var c = findCase_(caseId);
    if (c.status === '종결' || c.status === '재점검대기') throw new Error('이미 ' + c.status + ' 상태입니다.');
    if (c.status === '접수' || c.status === '동향확인중') throw new Error('동향 확인이 끝나지 않은 관리 건은 종결할 수 없습니다.');
    var actions = readTable_('DB_WORK', 'T_ACTION').filter(function (a) { return a.case_id === caseId && !a.is_deleted; });
    var open = actions.filter(function (a) { return a.status !== '완료'; });
    if (open.length) throw new Error('완료되지 않은 조치가 ' + open.length + '건 있습니다.');
    var settings = readSettings_();
    recheckDate = optDate_(recheckDate, '재점검일') || addDays_(todayStr_(), settingNum_(settings, 'RECHECK_DAYS', 30));
    if (recheckDate <= todayStr_()) throw new Error('재점검일은 오늘 이후여야 합니다.');
    var basis = createBasisSnapshot_(user, c, '종결: ' + closeReason);
    transitionCase_(user, c, '재점검대기', '종결 처리: ' + closeReason, { close_reason: closeReason, closed_date: todayStr_(), recheck_date: recheckDate,
      basis_snapshot_id: basis.basis_snapshot_id, summary: summary || '', owner_id: c.owner_id || user.user_id });
    return stripInternal_(c);
  });
}

/** 재점검: 활성 신호가 없으면 종결, 있으면 동향확인중으로 재개 */
function recheckCase_(user, caseId, note) {
  return withLock_(function () {
    invalidate_('DB_WORK', 'T_CASE'); invalidate_('DB_WORK', 'T_SIGNAL');
    var c = findCase_(caseId);
    if (c.status !== '재점검대기') throw new Error('재점검 대기 상태가 아닙니다(' + c.status + ').');
    var active = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.wholesaler_id === c.wholesaler_id && (s.status === '연결' || s.status === '발생' || s.status === '보류'); });
    var held = active.some(function (s) { return s.status === '보류'; });
    if (held) throw new Error('데이터 상태가 보류 중이라 재점검을 확정할 수 없습니다. 자료 정상화 후 다시 시도하세요.');
    if (active.length) {
      active.forEach(function (s) { if (!s.case_id || s.case_id !== caseId) { s.case_id = caseId; s.updated_at = nowStr_(); writeObject_('DB_WORK', 'T_SIGNAL', s); } });
      var settings = readSettings_();
      transitionCase_(user, c, '동향확인중', '재점검: 활성 신호 ' + active.length + '건 → 재개' + (note ? ' / ' + note : ''),
        { trend_due: addAuctionDays_(readTable_('DB_MASTER', 'M_CALENDAR'), todayStr_(), settingNum_(settings, 'SLA_TREND_DAYS', 3)), close_reason: '', closed_date: '', recheck_date: '' });
      return { reopened: true, caseRow: stripInternal_(c) };
    }
    transitionCase_(user, c, '종결', '재점검: 활성 신호 없음' + (note ? ' / ' + note : ''));
    return { reopened: false, caseRow: stripInternal_(c) };
  });
}

/* ───────────── 조회 ───────────── */

function caseDetail_(user, caseId) {
  var c = findCase_(caseId);
  requireWsAccess_(user, c.wholesaler_id);
  var names = userNameMap_();
  var nm = function (id) { return id ? (names[id] || id) : ''; };
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === caseId; }).map(function (s) {
    var o = stripInternal_(s); o.label = SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id;
    o.evidence = JSON.parse(s.evidence_json || '{}'); o.params = JSON.parse(s.params_json || '{}'); delete o.evidence_json; delete o.params_json; return o;
  });
  var trends = readTable_('DB_WORK', 'T_TREND').filter(function (t) { return t.case_id === caseId; }).map(function (t) {
    var o = stripInternal_(t); o.facts = JSON.parse(t.facts_json || '[]'); o.signals = JSON.parse(t.signals_json || '[]'); o.writer_name = nm(t.writer_id);
    delete o.facts_json; delete o.signals_json; return o;
  });
  var actions = readTable_('DB_WORK', 'T_ACTION').filter(function (a) { return a.case_id === caseId && !a.is_deleted; }).map(function (a) { var o = stripInternal_(a); o.owner_name = nm(a.owner_id); return o; });
  var approvals = readTable_('DB_WORK', 'T_APPROVAL').filter(function (a) { return a.case_id === caseId; }).map(function (a) { var o = stripInternal_(a); o.requested_name = nm(a.requested_by); o.decided_name = nm(a.decided_by); return o; });
  var hist = readTable_('DB_WORK', 'T_CASE_HIST').filter(function (h) { return h.case_id === caseId; }).map(function (h) { var o = stripInternal_(h); o.user_name = nm(h.user_id); return o; });
  var attach = readTable_('DB_WORK', 'T_ATTACH').filter(function (a) { return a.case_id === caseId; }).map(stripInternal_);
  var basis = c.basis_snapshot_id ? readTable_('DB_WORK', 'T_BASIS').filter(function (b) { return b.basis_snapshot_id === c.basis_snapshot_id; }).map(basisView_)[0] : null;
  var allBasis = readTable_('DB_WORK', 'T_BASIS').filter(function (b) { return b.case_id === caseId; }).map(basisView_);
  var ws = findWs_(c.wholesaler_id);
  var out = stripInternal_(c);
  out.owner_name = nm(c.owner_id); out.auctioneer_name = nm(c.auctioneer_id);
  out.ws = { wholesaler_id: ws.wholesaler_id, name: ws.name, biz_status: ws.biz_status };
  out.canWriteTrend = can_(user.role, 'trend.write') && (user.role !== 'AUCTIONEER' || !c.auctioneer_id || c.auctioneer_id === user.user_id);
  var guide = procedureGuide_(c, signals, trends, actions);
  return { caseRow: out, signals: signals, trends: trends, actions: actions, approvals: approvals, history: hist, attachments: attach,
    basis: basis, basisList: allBasis, guide: guide, resultClasses: RESULT_CLASSES, actionTypes: ACTION_TYPES, today: todayStr_() };
}

function basisView_(b) {
  var o = stripInternal_(b);
  ['limits_json', 'collaterals_json', 'guarantees_json', 'metrics_json', 'signals_json', 'docs_json', 'settings_json'].forEach(function (k) {
    try { o[k.replace('_json', '')] = JSON.parse(b[k] || 'null'); } catch (e) { o[k.replace('_json', '')] = null; }
    delete o[k];
  });
  return o;
}

/** 업무 대기열(홈·대시보드 공용). user 에 따라 담당 범위 필터 */
function workQueues_(user) {
  var today = todayStr_(), names = userNameMap_();
  var mine = {}; accessibleWs_(user).forEach(function (w) { mine[w.wholesaler_id] = w; });
  var cases = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return mine[c.wholesaler_id] && !c.is_deleted; });
  var signals = readTable_('DB_WORK', 'T_SIGNAL');
  var actions = readTable_('DB_WORK', 'T_ACTION').filter(function (a) { return mine[a.wholesaler_id] && !a.is_deleted; });
  var st = readStatus_(), base = st.signal_base_date || st.latest_base_date || '';
  var view = function (c) {
    var o = { case_id: c.case_id, wholesaler_id: c.wholesaler_id, name: mine[c.wholesaler_id].name, status: c.status, opened_date: c.opened_date,
      is_recurrence: c.is_recurrence, auctioneer: names[c.auctioneer_id] || c.auctioneer_id || '', owner: names[c.owner_id] || c.owner_id || '',
      trend_due: c.trend_due, action_due: c.action_due, recheck_date: c.recheck_date, result_class: c.result_class };
    o.signals = signals.filter(function (s) { return s.case_id === c.case_id && s.status !== '해소' && s.status !== '오탐확정'; })
      .map(function (s) { return { rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id, severity: s.severity, status: s.status, first_date: s.first_date, evidence: JSON.parse(s.evidence_json || '{}') }; });
    return o;
  };
  var newSignals = cases.filter(function (c) { return signals.some(function (s) { return s.case_id === c.case_id && s.first_date === base && s.status !== '해소'; }); }).map(view);
  var trendWait = cases.filter(function (c) { return c.status === '접수' || c.status === '동향확인중'; }).map(view)
    .map(function (o) { o.overdue = o.trend_due && o.trend_due < today; return o; });
  var actionWait = cases.filter(function (c) { return c.status === '조치진행' || c.status === '승인대기' || c.status === '확인완료'; }).map(view)
    .map(function (o) {
      var acts = actions.filter(function (a) { return a.case_id === o.case_id && a.status !== '완료'; });
      o.openActions = acts.length; o.pendingApproval = acts.filter(function (a) { return a.approval_status === '승인대기'; }).length;
      o.overdue = (o.action_due && o.action_due < today && !acts.length) || acts.some(function (a) { return a.due_date < today; });
      return o;
    });
  var recheck = cases.filter(function (c) { return c.status === '재점검대기'; }).map(view).map(function (o) { o.due = o.recheck_date && o.recheck_date <= today; return o; });
  var byOwner = {};
  trendWait.forEach(function (o) { var k = o.auctioneer || '(미지정)'; byOwner[k] = byOwner[k] || { name: k, waiting: 0, overdue: 0 }; byOwner[k].waiting++; if (o.overdue) byOwner[k].overdue++; });
  actionWait.forEach(function (o) { var k = o.owner || '(미지정)'; byOwner[k] = byOwner[k] || { name: k, waiting: 0, overdue: 0 }; byOwner[k].waiting++; if (o.overdue) byOwner[k].overdue++; });
  var held = signals.filter(function (s) { return s.status === '보류' && mine[s.wholesaler_id]; }).length;
  return { base: base, newSignals: newSignals, trendWait: trendWait, actionWait: actionWait, recheck: recheck,
    byOwner: Object.keys(byOwner).map(function (k) { return byOwner[k]; }).sort(function (a, b) { return b.overdue - a.overdue; }), heldSignals: held };
}

/* ══════════════ Docs.gs ══════════════ */
/**
 * Docs.gs — 매뉴얼·서식 연결과 상황별 절차 안내, 서식 작성본 생성
 * 원칙: 등록된 문서에 근거가 없으면 절차를 만들지 않고 '확인 필요'로 표시한다.
 *       같은 상황에 서로 다른 문서의 절차가 있으면 '충돌'로 표시하고 둘 다 보여 준다.
 *       원본 서식은 복사만 하고(makeCopy) 절대 쓰지 않는다. 작성본은 관리 건 폴더에 만든다.
 */

/** 관리 건의 사실로 상황 코드를 정한다. 조건은 M_SITUATION.condition_json (예: {"signals":["S03"],"result_class":"채권 검토 필요"}) */
function matchSituations_(c, signals, latestTrend) {
  var activeRules = {};
  signals.forEach(function (s) { if (s.status === '연결' || s.status === '발생' || s.status === '보류') activeRules[s.rule_id] = s; });
  var out = [];
  readTable_('DB_MASTER', 'M_SITUATION').forEach(function (sit) {
    if (sit.is_deleted) return;
    var cond = {};
    try { cond = JSON.parse(sit.condition_json || '{}'); } catch (e) { return; }
    var ok = true;
    (cond.signals || []).forEach(function (r) { if (!activeRules[r]) ok = false; });
    if (cond.result_class && (!latestTrend || latestTrend.result_class !== cond.result_class)) ok = false;
    if (cond.min_overdue_days !== undefined) {
      var s3 = activeRules.S03 ? JSON.parse(activeRules.S03.evidence_json || '{}') : null;
      if (!s3 || Number(s3.overdueDays) < Number(cond.min_overdue_days)) ok = false;
    }
    if (cond.case_status && cond.case_status.indexOf(c.status) < 0) ok = false;
    if (ok) out.push({ situation_code: sit.situation_code, label: sit.label, condition: cond });
  });
  return out;
}

/** 상황 코드별 절차·근거·서식. 기준일에 유효한 문서 버전만 쓴다. */
function proceduresFor_(situationCode, asOf) {
  var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= asOf && asOf <= (v.effective_to || APP.OPEN_END); });
  var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { docs[d.doc_id] = d; });
  var validVer = {}; vers.forEach(function (v) { validVer[v.doc_id + '|' + v.version] = v; });
  var forms = readTable_('DB_MASTER', 'M_PROC_FORM');
  var steps = readTable_('DB_MASTER', 'M_PROCEDURE').filter(function (p) { return p.situation_code === situationCode && !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version]; })
    .sort(function (a, b) { return a.doc_id === b.doc_id ? a.step_no - b.step_no : (a.doc_id < b.doc_id ? -1 : 1); })
    .map(function (p) {
      var v = validVer[p.doc_id + '|' + p.doc_version], d = docs[p.doc_id] || {};
      return { step_no: p.step_no, content: p.content, checks: p.checks, doc_id: p.doc_id, doc_name: d.doc_name || p.doc_id, version: p.doc_version,
        article: p.article, page: p.page, effective_from: v.effective_from,
        forms: forms.filter(function (f) { return f.proc_step_id === p.proc_step_id && !f.is_deleted; }).map(function (f) {
          var fv = vers.filter(function (x) { return x.doc_id === f.form_doc_id; }).sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
          return { form_doc_id: f.form_doc_id, form_name: (docs[f.form_doc_id] || {}).doc_name || f.form_doc_id, version: fv ? fv.version : '', file_id: fv ? fv.file_id : '', required: f.required, available: !!fv };
        }) };
    });
  var docIds = {}; steps.forEach(function (s) { docIds[s.doc_id] = true; });
  var conflict = Object.keys(docIds).length > 1;
  // 절차가 아직 없을 때: 상황에 연결된 "근거 후보 문서"(M_SITUATION.note 의 doc:ID 목록)를 보여 준다. 절차 내용은 만들지 않는다
  var candidates = [];
  if (!steps.length) {
    var sit = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return x.situation_code === situationCode; })[0];
    ((sit && sit.note) || '').split(/[;,\s]+/).forEach(function (tok) {
      var m = tok.match(/^doc:(.+)$/); if (!m) return;
      var d = docs[m[1]]; var v = vers.filter(function (x) { return x.doc_id === m[1]; }).sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
      if (d) candidates.push({ doc_id: d.doc_id, doc_name: d.doc_name, version: v ? v.version : '', file_id: v ? v.file_id : '' });
    });
  }
  return { situation_code: situationCode, steps: steps, candidates: candidates, status: steps.length ? (conflict ? '충돌' : '정상') : '확인 필요',
    message: steps.length ? (conflict ? '같은 상황에 서로 다른 문서의 절차가 등록되어 있습니다. 문서 담당자 확인 전까지 우선순위를 정하지 않습니다.' : '')
      : (candidates.length ? '절차(조항·쪽수)가 아직 등록되지 않았습니다. 아래 근거 후보 문서를 열어 해당 조항을 확인한 뒤 "절차 단계 등록"으로 입력하세요. 절차를 임의로 만들지 않습니다.'
        : '등록된 근거 문서·절차가 없습니다. 절차를 임의로 만들지 않습니다. 문서 담당자에게 등록을 요청하세요.') };
}

/* ───────────── 매뉴얼 폴더 자동 등록 ───────────── */

/** 파일명 → 문서명·버전·시행일. "(2023.12.29 개정)" 이 있으면 그 날짜가 시행일, 없으면 시행일 미확인 */
function parseManualName_(fileName) {
  var base = String(fileName).replace(/\.(hwpx?|pdf|docx?|txt)$/i, '').replace(/의 사본$/, '').trim();
  var m = base.match(/\((\d{4})[.\-](\d{1,2})[.\-](\d{1,2})\s*개정\)/);
  var name = base.replace(/\s*\(\d{4}[.\-]\d{1,2}[.\-]\d{1,2}\s*개정\)/, '').trim();
  var eff = m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  return { doc_name: name, version: eff ? 'v' + eff.replace(/-/g, '.') : 'v1', effective_from: eff, doc_id: 'DOC-' + fnv1a_(name).toUpperCase(),
    doc_type: /서식|양식|신청서|확인서|요청서/.test(name) ? '서식' : '매뉴얼', family: name.split(/[_\s]/)[0] };
}

/**
 * 폴더의 문서 파일을 모두 문서·버전으로 등록한다(이미 등록된 파일 ID·버전은 건너뜀).
 * HWP 는 본문을 읽을 수 없으므로 링크·버전만 등록된다. 조항·쪽수는 담당자가 "절차 단계 등록"에서 입력한다.
 */
function registerManualFolder_(user, folderIdOrName) {
  var folder = null;
  try { folder = DriveApp.getFolderById(folderIdOrName); } catch (e) { folder = null; }
  if (!folder) { var it0 = DriveApp.getFoldersByName(folderIdOrName); if (!it0.hasNext()) throw new Error('폴더를 찾을 수 없습니다: ' + folderIdOrName); folder = it0.next(); }
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC'); invalidate_('DB_MASTER', 'M_DOC_VER');
    var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { docs[d.doc_id] = d; });
    var vers = readTable_('DB_MASTER', 'M_DOC_VER');
    var stat = { docs: 0, versions: 0, skipped: 0, noDate: [] , files: [] };
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next(), name = f.getName();
      if (!/\.(hwpx?|pdf|docx?|txt)$/i.test(name) && String(f.getMimeType ? f.getMimeType() : '').indexOf('google-apps.document') < 0) continue;
      var p = parseManualName_(name);
      if (!docs[p.doc_id]) {
        var row = { doc_id: p.doc_id, doc_name: p.doc_name, doc_type: p.doc_type, owner_dept: '', note: '폴더 자동 등록(' + folder.getName() + ')' };
        Object.assign(row, newAuditFields_(user)); appendObjects_('DB_MASTER', 'M_DOC', [row]); docs[p.doc_id] = row; stat.docs++;
      }
      if (vers.some(function (v) { return v.doc_id === p.doc_id && (v.file_id === f.getId() || v.version === p.version); })) { stat.skipped++; continue; }
      var eff = p.effective_from || todayStr_();
      var prev = vers.filter(function (v) { return v.doc_id === p.doc_id && !v.is_deleted; });
      prev.forEach(function (v) { if ((v.effective_to || APP.OPEN_END) >= eff && v.effective_from < eff) { v.effective_to = addDays_(eff, -1); writeObject_('DB_MASTER', 'M_DOC_VER', v); } });
      var vrow = { doc_id: p.doc_id, version: p.version, effective_from: eff, effective_to: APP.OPEN_END, file_id: f.getId(),
        file_hash: sha256Hex_(f.getBlob().getBytes()), note: p.effective_from ? '파일명의 개정일을 시행일로 등록' : '시행일 미확인(파일명에 개정일 없음) — 등록일로 임시 설정, 확인 후 수정' };
      Object.assign(vrow, newAuditFields_(user)); appendObjects_('DB_MASTER', 'M_DOC_VER', [vrow]); vers.push(vrow); stat.versions++;
      if (!p.effective_from) stat.noDate.push(p.doc_name);
      stat.files.push({ file: name, doc_id: p.doc_id, doc_name: p.doc_name, version: p.version, effective_from: eff });
    }
    audit_(user, 'REGISTER_MANUALS', 'DB_MASTER', 'M_DOC', folder.getName(), null, { docs: stat.docs, versions: stat.versions, skipped: stat.skipped }, '매뉴얼 폴더 자동 등록');
    return stat;
  });
}

/**
 * 상황 코드 기본 세트와 "근거 후보 문서" 연결. 절차 내용은 만들지 않는다.
 * 후보 문서는 등록된 문서명에서 키워드로 찾는다(편·장 제목 기준). 조항·쪽수는 담당자가 입력.
 */
var SITUATION_SEED = [
  { code: 'SIT-OVD-NEW', label: '연체 발생(채권 검토 필요)', cond: { signals: ['S03'], result_class: '채권 검토 필요' }, keywords: ['임의회수', '여신관리', '총칙'] },
  { code: 'SIT-OVD-30', label: '연체 30일 이상 장기화', cond: { signals: ['S03'], min_overdue_days: 30 }, keywords: ['임의회수', '집행보전조치', '지급명령', '부실위험조사'] },
  { code: 'SIT-OVD-90', label: '연체 90일 이상·부실 우려', cond: { signals: ['S03'], min_overdue_days: 90 }, keywords: ['강제집행', '담보권 실행', '부실채권정리', '부실위험조사'] },
  { code: 'SIT-TURN-DROP', label: '회전율 저하 확인', cond: { signals: ['S01'] }, keywords: ['여신관리', '부실위험조사'] },
  { code: 'SIT-AR-UP', label: '미수금 증가', cond: { signals: ['S02'] }, keywords: ['여신관리'] },
  { code: 'SIT-BUY-DROP', label: '구매실적 급감', cond: { signals: ['S04'] }, keywords: ['여신관리', '부실위험조사'] },
  { code: 'SIT-LIMIT-HIGH', label: '한도 사용률 상승', cond: { signals: ['S05'] }, keywords: ['여신관리', '신용조사', '총칙'] },
  { code: 'SIT-COLL-EXPIRY', label: '담보·보증 기한 도래', cond: { signals: ['S06'] }, keywords: ['담보취득', '담보물', '감정평가'] },
  { code: 'SIT-MULTI', label: '복수 징후 동시 발생', cond: { signals: ['S07'] }, keywords: ['부실위험조사', '여신관리'] }
];

function seedSituations_(user) {
  invalidate_('DB_MASTER', 'M_SITUATION');
  var have = {}; readTable_('DB_MASTER', 'M_SITUATION').forEach(function (s) { have[s.situation_code] = s; });
  var docs = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return !d.is_deleted && d.doc_type === '매뉴얼'; });
  var out = { created: 0, updated: 0 };
  SITUATION_SEED.forEach(function (s) {
    var cands = docs.filter(function (d) { return s.keywords.some(function (k) { return d.doc_name.indexOf(k) >= 0; }); }).map(function (d) { return 'doc:' + d.doc_id; });
    var note = (cands.length ? '근거 후보 ' + cands.join(' ') : '근거 후보 없음') + ' — 조항·쪽수는 담당자 확인 후 절차 단계로 등록';
    var cur = have[s.code];
    if (!cur) { registerSituation_(user, { situation_code: s.code, label: s.label, condition_json: s.cond, note: note }, '상황 코드 기본 세트'); out.created++; }
    else if (cur.note !== note && !/^(가상)/.test(cur.note || '')) { registerSituation_(user, { situation_code: s.code, label: cur.label, condition_json: cur.condition_json, note: note }, '근거 후보 갱신'); out.updated++; }
  });
  return out;
}

/**
 * 절차 안내(설계 4.5.2 형식): 확인된 상황 → 추가 확인사항 → 적용 가능한 절차 → 근거 → 필요 서식 → 다음 할 일
 */
function procedureGuide_(c, signals, trends, actions) {
  var st = readStatus_(), today = todayStr_();
  var latestTrend = trends.filter(function (t) { return t.status === '제출'; }).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; })[0] || null;
  var rawSignals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === c.case_id; });
  var situations = matchSituations_(c, rawSignals, latestTrend);
  var facts = signals.filter(function (s) { return s.status !== '해소' && s.status !== '오탐확정'; }).map(function (s) {
    var e = s.evidence || {};
    var txt = s.label;
    if (s.rule_id === 'S01') txt += ' (회전율 ' + e.prevTurnover + '→' + e.turnover + ', ' + e.dropPct + '% 하락, 회수일수 ' + e.collectionDays + '일)';
    if (s.rule_id === 'S02') txt += ' (잔액 ' + Number(e.balance).toLocaleString() + '원, 평균 대비 ' + e.ratio + '배)';
    if (s.rule_id === 'S03') txt += ' (' + e.stage + ', 연체 ' + Number(e.overdueAmount).toLocaleString() + '원, ' + e.overdueDays + '일)';
    if (s.rule_id === 'S04') txt += ' (전년 ' + e.yoyPct + '%, 3개월 ' + e.ma3Pct + '%, 시장 대비 ' + e.vsMarketPp + '%p)';
    if (s.rule_id === 'S05') txt += ' (사용률 ' + e.usagePct + '%)';
    return txt;
  });
  if (latestTrend) facts.push('동향보고 결과: ' + latestTrend.result_class + ' (' + latestTrend.checked_date + ', ' + latestTrend.check_method + ')');
  var procs = situations.map(function (s) { var p = proceduresFor_(s.situation_code, today); p.label = s.label; return p; });
  var further = [];
  if (latestTrend && latestTrend.further_checks) further.push(latestTrend.further_checks);
  if (latestTrend && latestTrend.payment_plan) further.push('결제계획 이행 여부 확인: ' + latestTrend.payment_plan);
  var docVers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); });
  var next = [];
  if (c.status === '접수' || c.status === '동향확인중') next.push('동향보고 작성·제출 (기한 ' + (c.trend_due || '미정') + ')');
  else if (c.status === '확인완료') next.push('채권담당 확인 후 종결(재점검일 지정) 또는 조치 등록');
  else if (c.status === '조치진행') next.push(actions.some(function (a) { return a.status !== '완료'; }) ? '진행 중 조치 결과 등록' : '조치 등록 또는 종결');
  else if (c.status === '승인대기') next.push('승인권자 승인 대기');
  else if (c.status === '재점검대기') next.push('재점검일 ' + c.recheck_date + ' 도래 시 재점검');
  return {
    basis: { data_base_date: st.latest_base_date || '', data_status: st.data_status || '', manual_versions: docVers.map(function (v) { return v.doc_id + ' ' + v.version + '(시행 ' + v.effective_from + ')'; }) },
    situations: situations, facts: facts, furtherChecks: further, procedures: procs, nextSteps: next,
    noBasis: !situations.length || procs.every(function (p) { return p.status === '확인 필요'; })
  };
}

/* ───────────── 서식 ───────────── */

function caseFolder_(caseId) {
  var parent = folder_('CASES');
  var it = parent.getFoldersByName(caseId);
  return it.hasNext() ? it.next() : parent.createFolder(caseId);
}

/** 자리표시자 값: 중도매인 기본정보 + 기준일 */
function placeholderValues_(c) {
  var ws = findWs_(c.wholesaler_id), st = readStatus_(), base = st.latest_base_date || '';
  var m = {};
  readTable_('DB_AGG', 'A_METRIC').forEach(function (r) { if (r.wholesaler_id === ws.wholesaler_id && r.base_date === base && r.category === APP.ALL) m[r.metric] = r; });
  var names = userNameMap_();
  return {
    '중도매인코드': ws.wholesaler_id, '상호': ws.name, '대표자': ws.representative, '관리건ID': c.case_id,
    '기준일': base, '미수금': m['잔액'] && m['잔액'].status === '정상' ? Number(m['잔액'].value).toLocaleString() : '(자료 없음)',
    '연체금액': m['연체금액'] && m['연체금액'].status === '정상' ? Number(m['연체금액'].value).toLocaleString() : '(자료 없음)',
    '연체일수': m['연체일수'] && m['연체일수'].status === '정상' ? String(m['연체일수'].value) : '(자료 없음)',
    '담당경매사': names[c.auctioneer_id] || '', '작성일': todayStr_(), '작성자': ''
  };
}

/**
 * 서식 작성본 생성: 원본 복사 → 자리표시자 치환 → 관리 건 폴더 저장 → T_ATTACH(작성본) 기록
 * Google 문서면 DocumentApp 으로, 일반 텍스트면 문자열 치환으로 채운다. 그 밖의 형식은 복사만 한다.
 */
function createDraftForm_(user, caseId, formDocId) {
  var c = findCase_(caseId);
  requireWsAccess_(user, c.wholesaler_id);
  var today = todayStr_();
  var ver = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === formDocId && !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); })
    .sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
  if (!ver) throw new Error('유효한 서식 버전이 없습니다: ' + formDocId);
  var doc = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return d.doc_id === formDocId; })[0] || { doc_name: formDocId };
  var src = DriveApp.getFileById(ver.file_id);
  var vals = placeholderValues_(c); vals['작성자'] = user.name || user.user_id;
  var name = caseId + '_' + doc.doc_name + '_' + ver.version + '_작성본_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm');
  var copy = src.makeCopy(name, caseFolder_(caseId));   // 원본에는 쓰기 호출 없음
  var filled = 'copy_only';
  var mime = '';
  try { mime = String(copy.getMimeType ? copy.getMimeType() : ''); } catch (e) { mime = ''; }
  if (mime === 'application/vnd.google-apps.document' && typeof DocumentApp !== 'undefined') {
    var body = DocumentApp.openById(copy.getId()).getBody();
    Object.keys(vals).forEach(function (k) { body.replaceText('\\{\\{' + k + '\\}\\}', String(vals[k])); });
    filled = 'google_doc';
  } else if (mime.indexOf('text/') === 0 || /\.(txt|md|csv)$/i.test(src.getName())) {
    var text = copy.getBlob().getDataAsString('UTF-8');
    Object.keys(vals).forEach(function (k) { text = text.split('{{' + k + '}}').join(String(vals[k])); });
    copy.setContent(text);
    filled = 'text';
  }
  var row = { attach_id: uid_('AT'), case_id: caseId, ref_type: 'CASE', ref_id: caseId, kind: '작성본', form_doc_id: formDocId, form_version: ver.version,
    file_id: copy.getId(), file_name: name, file_hash: sha256Hex_(copy.getBlob().getBytes()), locked: false, created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_WORK', 'T_ATTACH', [row]);
  logAccess_(user.user_id, 'form.draft', formDocId, '허용', name + ' (' + filled + ')');
  audit_(user, 'CREATE_DRAFT', 'DB_WORK', 'T_ATTACH', row.attach_id, null, row, '서식 작성본 생성');
  return { attach: row, filled: filled, url: 'https://drive.google.com/file/d/' + copy.getId() + '/view' };
}

/** 제출본 등록: 업로드 파일을 관리 건 폴더에 저장하고 잠근다 */
function uploadFinalForm_(user, caseId, o) {
  var c = findCase_(caseId);
  requireWsAccess_(user, c.wholesaler_id);
  requireText_(o.file_name, '파일명');
  var bytes = Utilities.base64Decode(requireText_(o.base64, '파일 내용'));
  var kind = ['제출본', '증빙'].indexOf(o.kind) >= 0 ? o.kind : '제출본';
  var safe = String(o.file_name).replace(/[\\/:*?"<>|]/g, '_');
  var file = caseFolder_(caseId).createFile(Utilities.newBlob(bytes, o.mime_type || 'application/octet-stream', caseId + '_' + kind + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss') + '_' + safe));
  var row = { attach_id: uid_('AT'), case_id: caseId, ref_type: o.ref_type || 'CASE', ref_id: o.ref_id || caseId, kind: kind, form_doc_id: o.form_doc_id || '',
    form_version: o.form_version || '', file_id: file.getId(), file_name: file.getName(), file_hash: sha256Hex_(bytes), locked: kind === '제출본', created_at: nowStr_(), created_by: user.user_id };
  appendObjects_('DB_WORK', 'T_ATTACH', [row]);
  if (o.ref_type === 'ACTION' && o.ref_id) {
    var a = findAction_(o.ref_id);
    a.attach_ids = (a.attach_ids ? a.attach_ids + ',' : '') + row.attach_id; a.row_version = Number(a.row_version) + 1; a.updated_at = nowStr_(); a.updated_by = user.user_id;
    writeObject_('DB_WORK', 'T_ACTION', a);
  }
  logAccess_(user.user_id, 'form.final', caseId, '허용', row.file_name);
  audit_(user, 'UPLOAD', 'DB_WORK', 'T_ATTACH', row.attach_id, null, row, kind + ' 등록');
  return row;
}

/** 빈 서식 다운로드 링크(원본은 읽기 전용; 다운로드 기록) */
function blankFormLink_(user, formDocId) {
  var today = todayStr_();
  var ver = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === formDocId && !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); })
    .sort(function (a, b) { return a.effective_from < b.effective_from ? 1 : -1; })[0];
  if (!ver) throw new Error('유효한 서식 버전이 없습니다: ' + formDocId);
  logAccess_(user.user_id, 'form.blank', formDocId, '허용', ver.version);
  return { doc_id: formDocId, version: ver.version, url: 'https://drive.google.com/file/d/' + ver.file_id + '/view' };
}

/* ───────────── 문서·절차 등록(관리자) ───────────── */

function registerDoc_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.doc_id, '문서 ID');
  if (['매뉴얼', '서식'].indexOf(o.doc_type) < 0) throw new Error('문서 유형은 매뉴얼/서식 중 하나입니다.');
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC');
    var cur = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return d.doc_id === id; })[0];
    if (cur) {
      var before = JSON.parse(JSON.stringify(cur));
      cur.doc_name = o.doc_name || cur.doc_name; cur.owner_dept = o.owner_dept || cur.owner_dept; cur.note = o.note || cur.note;
      cur.updated_at = nowStr_(); cur.updated_by = user.user_id; cur.row_version = Number(cur.row_version) + 1;
      writeObject_('DB_MASTER', 'M_DOC', cur); audit_(user, 'UPDATE', 'DB_MASTER', 'M_DOC', id, before, cur, reason);
      return stripInternal_(cur);
    }
    var row = { doc_id: id, doc_name: requireText_(o.doc_name, '문서명'), doc_type: o.doc_type, owner_dept: o.owner_dept || '', note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_DOC', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_DOC', id, null, row, reason);
    return row;
  });
}

function registerDocVersion_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var id = requireText_(o.doc_id, '문서 ID'), version = requireText_(o.version, '버전');
  var from = optDate_(requireText_(o.effective_from, '시행일'), '시행일');
  var fileId = requireText_(o.file_id, 'Drive 파일 ID');
  var file = DriveApp.getFileById(fileId);
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_DOC_VER');
    if (!readTable_('DB_MASTER', 'M_DOC').some(function (d) { return d.doc_id === id; })) throw new Error('문서를 먼저 등록하세요: ' + id);
    var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return v.doc_id === id && !v.is_deleted; });
    if (vers.some(function (v) { return v.version === version; })) throw new Error('이미 있는 버전입니다: ' + version);
    vers.forEach(function (v) {
      if ((v.effective_to || APP.OPEN_END) >= from && v.effective_from < from) {
        var b = JSON.parse(JSON.stringify(v)); v.effective_to = addDays_(from, -1); v.updated_at = nowStr_(); v.updated_by = user.user_id; v.row_version = Number(v.row_version) + 1;
        writeObject_('DB_MASTER', 'M_DOC_VER', v); audit_(user, 'CLOSE_PERIOD', 'DB_MASTER', 'M_DOC_VER', id + '|' + v.version, b, v, '새 버전 ' + version);
      }
    });
    var row = { doc_id: id, version: version, effective_from: from, effective_to: optDate_(o.effective_to, '폐지일') || APP.OPEN_END, file_id: fileId,
      file_hash: sha256Hex_(file.getBlob().getBytes()), note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_DOC_VER', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_DOC_VER', id + '|' + version, null, row, reason);
    return row;
  });
}

function registerProcedure_(user, o, reason) {
  requireText_(reason, '변경 사유');
  requireText_(o.situation_code, '상황 코드'); requireText_(o.content, '절차 내용'); requireText_(o.doc_id, '근거 문서'); requireText_(o.doc_version, '문서 버전');
  return withLock_(function () {
    if (!readTable_('DB_MASTER', 'M_SITUATION').some(function (s) { return s.situation_code === o.situation_code && !s.is_deleted; })) throw new Error('상황 코드를 먼저 등록하세요.');
    if (!readTable_('DB_MASTER', 'M_DOC_VER').some(function (v) { return v.doc_id === o.doc_id && v.version === o.doc_version; })) throw new Error('문서 버전이 없습니다.');
    var row = { proc_step_id: uid_('PS'), situation_code: o.situation_code, step_no: Number(o.step_no) || 1, content: o.content, checks: o.checks || '',
      doc_id: o.doc_id, doc_version: o.doc_version, article: o.article || '', page: o.page || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_PROCEDURE', [row]);
    (o.form_doc_ids || []).forEach(function (f) {
      var fr = { proc_step_id: row.proc_step_id, form_doc_id: f, required: true }; Object.assign(fr, newAuditFields_(user));
      appendObjects_('DB_MASTER', 'M_PROC_FORM', [fr]);
    });
    audit_(user, 'CREATE', 'DB_MASTER', 'M_PROCEDURE', row.proc_step_id, null, row, reason);
    return row;
  });
}

function registerSituation_(user, o, reason) {
  requireText_(reason, '변경 사유');
  var code = requireText_(o.situation_code, '상황 코드');
  var cond = typeof o.condition_json === 'string' ? o.condition_json : JSON.stringify(o.condition_json || {});
  JSON.parse(cond);
  return withLock_(function () {
    invalidate_('DB_MASTER', 'M_SITUATION');
    var cur = readTable_('DB_MASTER', 'M_SITUATION').filter(function (s) { return s.situation_code === code; })[0];
    if (cur) {
      var b = JSON.parse(JSON.stringify(cur)); cur.label = o.label || cur.label; cur.condition_json = cond; cur.note = o.note || cur.note;
      cur.updated_at = nowStr_(); cur.updated_by = user.user_id; cur.row_version = Number(cur.row_version) + 1;
      writeObject_('DB_MASTER', 'M_SITUATION', cur); audit_(user, 'UPDATE', 'DB_MASTER', 'M_SITUATION', code, b, cur, reason); return stripInternal_(cur);
    }
    var row = { situation_code: code, label: requireText_(o.label, '상황명'), condition_json: cond, note: o.note || '' };
    Object.assign(row, newAuditFields_(user));
    appendObjects_('DB_MASTER', 'M_SITUATION', [row]); audit_(user, 'CREATE', 'DB_MASTER', 'M_SITUATION', code, null, row, reason);
    return row;
  });
}

/**
 * 상황별 "조치 1줄 + 조항·호·목 근거" 목록 (질의응답 대신 쓰는 안내). 절차가 없으면 확인 필요 + 근거 후보.
 */
function actionGuides_() {
  var today = todayStr_();
  return readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; }).map(function (x) {
    var p = proceduresFor_(x.situation_code, today);
    var cond = {}; try { cond = JSON.parse(x.condition_json || '{}'); } catch (e) { /* 조건 없음 */ }
    return { situation_code: x.situation_code, label: x.label, signals: cond.signals || [], result_class: cond.result_class || '', min_overdue_days: cond.min_overdue_days || '',
      status: p.status, message: p.message,
      steps: p.steps.map(function (st) { return { step_no: st.step_no, action: st.content, basis: st.doc_name + ' ' + st.version + ' ' + st.article + (st.page ? ' p.' + st.page : ''), effective_from: st.effective_from, forms: st.forms.map(function (f) { return f.form_name + ' ' + f.version; }) }; }),
      candidates: (p.candidates || []).map(function (c) { return { doc_name: c.doc_name, version: c.version, file_id: c.file_id }; }) };
  });
}

/* ══════════════ Performance.gs ══════════════ */
/**
 * Performance.gs — 실적관리(조회·분석 전용)와 거래·회수 매트릭스
 * - 구매 실적은 부류별(과일·채소·전체), 회전율·회수일수·한도 사용률은 전체 기준만 (배분 근거 없음)
 * - 진행 중인 월은 전년 전체 월과 직접 비교하지 않고 "동일 경과 경매일" 기준으로만 비교한다
 * - 매트릭스는 관리 우선순위 참고용이며 신호·조치에 연결되지 않는다 (MATRIX_DISCLAIMER)
 */

function indexDailyByWs_(daily) {
  var m = {};
  daily.forEach(function (r) { (m[r.wholesaler_id] = m[r.wholesaler_id] || []).push(r); });
  return m;
}

function median_(arr) {
  var a = arr.filter(function (v) { return v !== null && v !== undefined && isFinite(v); }).sort(function (x, y) { return x - y; });
  if (!a.length) return null;
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** 월 집계 조회표: ws|ym|cat → row */
function monthlyIndex_(monthly) {
  var idx = {};
  monthly.forEach(function (r) { idx[r.wholesaler_id + '|' + r.ym + '|' + r.category] = r; });
  return idx;
}

function sumMonths_(idx, ws, cat, fromYm, toYm) {
  var amt = 0, days = 0, months = 0;
  for (var ym = fromYm; ym <= toYm; ym = addMonths_(ym, 1)) {
    var r = idx[ws + '|' + ym + '|' + cat];
    if (r) { amt += Number(r.purchase_amount) || 0; days += Number(r.purchase_days) || 0; months++; }
  }
  return { amount: amt, days: days, months: months };
}

/**
 * 중도매인별 실적·회수 요약 (기준일 = 최신 자료일)
 * @return { meta, rows:[{wholesaler_id, name, biz_status, flags, byCategory:{cat:{...}}, turnover, collectionDays, balance, overdue, overdueDays, limitUsage, dataState}] }
 */
function performanceSummary_(user) {
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var settings = readSettings_();
  var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var metrics = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.base_date === (st.signal_base_date || base); });
  var dq = readTable_('DB_AGG', 'A_DQ'), statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST');
  var idx = monthlyIndex_(monthly), dailyByWs = indexDailyByWs_(daily);
  var curYm = ymOf_(base), monthComplete = base >= lastAuctionDayOfMonth_(calendar, curYm);
  var lastCompleteYm = monthComplete ? curYm : addMonths_(curYm, -1);
  var from12 = addMonths_(curYm, -11), yearStart = curYm.substring(0, 4) + '-01';
  var mt = {};
  metrics.forEach(function (m) { (mt[m.wholesaler_id] = mt[m.wholesaler_id] || {})[m.metric + '|' + m.category] = m; });
  var dqFrom = addDays_(base, -APP.DQ_LOOKBACK_DAYS), dqBad = {};
  dq.forEach(function (d) { if (d.date > dqFrom && d.date <= base && d.status !== '경고') dqBad[d.wholesaler_id] = true; });
  var newMonths = settingNum_(settings, 'NEW_WS_MONTHS', 12);
  var cats = APP.CATEGORIES.concat([APP.ALL]);
  var market = {};
  cats.forEach(function (c) { market[c] = { amount12: 0, ytd: 0, ytdPrev: 0 }; });

  var rows = accessibleWs_(user).map(function (w) {
    var ws = w.wholesaler_id, m = mt[ws] || {};
    var bizStatus = statusOn_(statusHist, ws, base) || w.biz_status;
    var isNew = w.trade_start_date && addMonths_(ymOf_(w.trade_start_date), newMonths) + '-01' > base;
    var mtd = mtdCompare_(dailyByWs[ws] || [], calendar, ws, base);
    var byCat = {};
    cats.forEach(function (c) {
      var p12 = sumMonths_(idx, ws, c, from12, curYm), ytd = sumMonths_(idx, ws, c, yearStart, lastCompleteYm);
      var ytdPrev = sumMonths_(idx, ws, c, addMonths_(yearStart, -12), addMonths_(lastCompleteYm, -12));
      var lastM = idx[ws + '|' + lastCompleteYm + '|' + c], lastPrev = idx[ws + '|' + addMonths_(lastCompleteYm, -12) + '|' + c];
      byCat[c] = {
        amount12: p12.amount, days12: p12.days, months12: p12.months,
        lastMonth: { ym: lastCompleteYm, amount: lastM ? lastM.purchase_amount : 0, days: lastM ? lastM.purchase_days : 0, prevAmount: lastPrev ? lastPrev.purchase_amount : null, yoy: isNew ? { status: '비교불가', reason: '신규' } : growthRate_(lastM ? lastM.purchase_amount : 0, lastPrev ? lastPrev.purchase_amount : null) },
        ytd: { from: yearStart, to: lastCompleteYm, amount: ytd.amount, prevAmount: ytdPrev.amount, growth: isNew ? { status: '비교불가', reason: '신규' } : growthRate_(ytd.amount, ytdPrev.months ? ytdPrev.amount : null) },
        mtd: monthComplete ? null : { ym: curYm, amount: mtd.byCategory[c].amount, prevAmount: mtd.byCategory[c].prevAmount, growth: mtd.byCategory[c].growth, basis: mtd.basis, elapsed: mtd.elapsedAuctionDays }
      };
      market[c].amount12 += p12.amount; market[c].ytd += ytd.amount; market[c].ytdPrev += ytdPrev.amount;
    });
    var total12 = byCat[APP.ALL].amount12;
    APP.CATEGORIES.forEach(function (c) { byCat[c].shareInWs = total12 > 0 ? byCat[c].amount12 / total12 : null; });
    var g = function (k) { var x = m[k + '|' + APP.ALL]; return x && (x.status === '정상' || x.status === '참고') ? Number(x.value) : null; };
    var gs = function (k) { var x = m[k + '|' + APP.ALL]; return x ? { status: x.status, reason: x.reason, method: x.method, period: x.period_from + '~' + x.period_to } : { status: '산출불가', reason: '지표 없음' }; };
    return { wholesaler_id: ws, name: w.name, biz_status: bizStatus, isNew: !!isNew, categories: w.categories,
      dataState: dqBad[ws] || st.data_status !== '정상' ? '판정보류' : '정상',
      byCategory: byCat, turnover: g('회전율'), turnoverInfo: gs('회전율'), collectionDays: g('회수일수'), balance: g('잔액'),
      overdue: g('연체금액'), overdueDays: g('연체일수'), limitUsage: g('한도사용률'), limitUsageInfo: gs('한도사용률'), avgBalance: g('평균잔액') };
  });
  rows.forEach(function (r) { cats.forEach(function (c) { r.byCategory[c].shareOfMarket = market[c].amount12 > 0 ? r.byCategory[c].amount12 / market[c].amount12 : null; }); });
  var marketGrowth = {};
  cats.forEach(function (c) { marketGrowth[c] = growthRate_(market[c].ytd, market[c].ytdPrev); });
  return {
    meta: { baseDate: base, metricBaseDate: st.signal_base_date || base, lastUpdated: st.last_updated_at || '', dataStatus: st.data_status || '', period12: from12 + ' ~ ' + curYm,
      monthComplete: monthComplete, lastCompleteYm: lastCompleteYm, currentYm: curYm, ytdPeriod: yearStart + ' ~ ' + lastCompleteYm,
      turnoverNote: '회전율·회수일수·한도 사용률은 부류 구분 없이 전체 기준입니다. 부류별 채권 배분 근거가 없어 부류별 회전율을 산출하지 않습니다.',
      partialNote: monthComplete ? '' : curYm + '은 진행 중인 월입니다. 전년 비교는 ' + (rows[0] && rows[0].byCategory[APP.ALL].mtd ? rows[0].byCategory[APP.ALL].mtd.basis : '동일 경과 경매일') + ' 기준으로만 표시하며, 월 전체 증감률은 월 마감 후 표시합니다.',
      monthsAvailable: Object.keys(monthly.reduce(function (o, r) { o[r.ym] = 1; return o; }, {})).length },
    market: market, marketGrowth: marketGrowth, rows: rows
  };
}

/** 상세: 한 중도매인의 24개월 월별 표 + 전년 대응 */
function performanceDetail_(user, wsId) {
  requireWsAccess_(user, wsId);
  var st = readStatus_(), base = st.latest_base_date;
  var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var trend = monthlyTrend_(monthly, indexDailyByWs_(daily)[wsId] || [], calendar, wsId, base, 24);
  var mt = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.wholesaler_id === wsId; });
  var dates = {}; mt.forEach(function (m) { dates[m.base_date] = true; });
  // 회전율 추이: 저장된 기준일별 스냅샷(월말 또는 최신)
  var turnoverHist = mt.filter(function (m) { return m.metric === '회전율' && m.category === APP.ALL && (m.status === '정상' || m.status === '참고'); })
    .map(function (m) { return { base_date: m.base_date, value: Number(m.value), period: m.period_from + '~' + m.period_to }; }).sort(cmpBy_(['base_date']));
  return { wholesaler: stripInternal_(findWs_(wsId)), trend: trend, turnoverHistory: turnoverHist, baseDate: base };
}

/* ───────────── 거래·회수 매트릭스 ───────────── */

function quadrantOf_(x, y, bx, by) {
  var hi = x >= bx, hy = y >= by;
  return hi ? (hy ? 'HH' : 'HL') : (hy ? 'LH' : 'LL');
}

/**
 * @param category 과일|채소|전체 (가로축·색상에만 적용. 세로축 회전율은 전체 기준)
 */
function matrix_(user, category) {
  category = APP.CATEGORIES.indexOf(category) >= 0 ? category : APP.ALL;
  var sum = performanceSummary_(user), settings = readSettings_();
  var included = [], excluded = [];
  var xMode = settings.MATRIX_X_MODE || '전년동월증감';   // 전년동월증감: 가로 = 마감 월 실적의 전년 동월 대비 증감률(%), 경계 0
  sum.rows.forEach(function (r) {
    var c = r.byCategory[category];
    var reason = '';
    if (r.isNew) reason = '신규(거래 ' + settingNum_(settings, 'NEW_WS_MONTHS', 12) + '개월 미만)';
    else if (r.biz_status !== '정상') reason = r.biz_status;
    else if (r.dataState !== '정상') reason = '판정보류(자료 불완전)';
    else if (r.turnover === null) reason = '회전율 ' + (r.turnoverInfo.reason || '산출불가');
    else if (!c.amount12) reason = '해당 부류 구매 없음';
    else if (xMode === '전년동월증감' && c.lastMonth.yoy.status !== '정상') reason = '전년 동월 비교불가(' + c.lastMonth.yoy.reason + ')';
    var x = xMode === '전년동월증감' ? c.lastMonth.yoy.value * 100 : c.amount12;
    var pt = { wholesaler_id: r.wholesaler_id, name: r.name, x: x, y: r.turnover, size: xMode === '전년동월증감' ? c.lastMonth.amount : (r.balance || 0), amount12: c.amount12,
      lastMonth: c.lastMonth.amount, prevYearMonth: c.lastMonth.prevAmount, growth: c.lastMonth.yoy, balance: r.balance, collectionDays: r.collectionDays, overdue: r.overdue };
    if (reason) { pt.reason = reason; excluded.push(pt); } else included.push(pt);
  });
  // 전년 동월 위치(점선 원): 가로 = 전년 동월의 전전년 대비 증감률, 세로 = 전년 동월 말 기준 회전율, 크기 = 전년 동월 실적
  if (xMode === '전년동월증감' && included.length) {
    var monthly = readTable_('DB_AGG', 'A_MONTHLY'), daily = readTable_('DB_AGG', 'A_DAILY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
    var idx = monthlyIndex_(monthly), balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
    var wsAll = {}; readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { wsAll[w.wholesaler_id] = w; });
    var prevYm = addMonths_(sum.meta.lastCompleteYm, -12), prev2Ym = addMonths_(sum.meta.lastCompleteYm, -24);
    var prevEnd = lastAuctionDayOfMonth_(calendar, prevYm);
    included.forEach(function (p) {
      var m1 = idx[p.wholesaler_id + '|' + prevYm + '|' + category], m2 = idx[p.wholesaler_id + '|' + prev2Ym + '|' + category];
      var g = growthRate_(m1 ? m1.purchase_amount : 0, m2 ? m2.purchase_amount : null);
      var w = wsAll[p.wholesaler_id] || {};
      var mt = computeMetrics_({ ws: p.wholesaler_id, baseDate: prevEnd, daily: dailyByWs[p.wholesaler_id] || [], monthly: monthly, calendar: calendar, limits: [], balByDate: balIdx[p.wholesaler_id] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: null });
      var t = mt.byName['회전율|' + APP.ALL];
      p.prev = { ym: prevYm, x: g.status === '정상' ? g.value * 100 : null, y: t && t.status === '정상' ? Number(t.value) : null, size: m1 ? m1.purchase_amount : 0,
        available: g.status === '정상' && !!(t && t.status === '정상'), reason: g.status !== '정상' ? '전전년 실적 없음' : (!t || t.status !== '정상' ? '전년 회전율 산출불가' : '') };
    });
  }
  var bx = xMode === '전년동월증감' ? 0 : median_(included.map(function (p) { return p.x; }));
  var yMode = settings.MATRIX_Y_MODE || '당기중앙값', yFixed = settingNum_(settings, 'MATRIX_Y_FIXED', NaN);
  var by, ySource;
  if ((yMode === '전년고정' || yMode === '목표값') && isFinite(yFixed) && yFixed > 0) { by = yFixed; ySource = yMode + ' (' + (settings.MATRIX_Y_FIXED_SOURCE || '출처 미기재') + ')'; }
  else { by = median_(included.map(function (p) { return p.y; })); ySource = '당기중앙값' + (yMode !== '당기중앙값' ? ' (고정값 미설정으로 대체)' : ''); }
  var counts = { HH: 0, HL: 0, LH: 0, LL: 0 };
  included.forEach(function (p) { p.quadrant = quadrantOf_(p.x, p.y, bx, by); p.quadrantLabel = MATRIX_QUADRANTS[p.quadrant].label; counts[p.quadrant]++; });
  // 미수 자료가 없어 회전율을 셀 수 없는 동안: 가로축(전년 동월 대비 증감)만으로 실적 변동 순위를 제공한다(4분면 대신 표시)
  var growthRank = null;
  if (!included.length && xMode === '전년동월증감') {
    var cmp = excluded.filter(function (p) { return /^회전율/.test(p.reason) && p.growth && p.growth.status === '정상'; });
    var idle = cmp.filter(function (p) { return !(p.lastMonth > 0); });   // 전년 동월엔 거래가 있었으나 마감 월 거래가 없는 중도매인(−100%)은 순위에서 빼고 따로 센다
    var gr = cmp.filter(function (p) { return p.lastMonth > 0; })
      .map(function (p) { return { wholesaler_id: p.wholesaler_id, name: p.name, x: p.x, lastMonth: p.lastMonth, prevYearMonth: p.prevYearMonth, size: p.size }; })
      .sort(function (a, b) { return a.x - b.x; });
    if (gr.length) growthRank = { ym: sum.meta.lastCompleteYm, points: gr, total: gr.length, decline: gr.filter(function (p) { return p.x < 0; }).length,
      idle: idle.map(function (p) { return { wholesaler_id: p.wholesaler_id, name: p.name, prevYearMonth: p.prevYearMonth }; }),
      note: '미수잔액·입금 자료가 없어 세로축(회전율)을 셀 수 없습니다. 자료가 들어오면 4분면으로 바뀝니다.' };
  }
  return {
    growthRank: growthRank,
    meta: sum.meta, category: category,
    xMode: xMode,
    axes: xMode === '전년동월증감'
      ? { x: sum.meta.lastCompleteYm + ' 사업실적의 전년 동월 대비 증감률(' + category + ')', y: '최근 3개월 미수금 회전율(전체 기준)', color: '4분면 분류', size: sum.meta.lastCompleteYm + ' 사업실적(구매금액)' }
      : { x: '최근 12개월 구매금액(' + category + ') ' + sum.meta.period12, y: '최근 3개월 미수금 회전율(전체 기준)', color: '전년 동기 누적 대비 구매 증감률', size: '현재 미수금(' + sum.meta.metricBaseDate + ')' },
    boundaries: { x: bx, xSource: xMode === '전년동월증감' ? '전년 동월과 같음(0%)' : '당기중앙값(' + included.length + '명)', y: by, ySource: ySource, computedAt: nowStr_() },
    quadrants: MATRIX_QUADRANTS, counts: counts, points: included, excluded: excluded, disclaimer: MATRIX_DISCLAIMER
  };
}

/**
 * 세로축 고정 기준선 산정: 전년도 각 월말 경매일 기준 회전율을 전 중도매인에 대해 계산하고 그 중앙값들의 중앙값을 쓴다.
 * 결과는 MATRIX_Y_FIXED 에 저장(출처 기록). 연 1회 갱신 권장.
 */
function computeMatrixBaseline_(user) {
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var prevYear = String(Number(base.substring(0, 4)) - 1);
  var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
  var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), settings = readSettings_();
  var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
  var monthMedians = [], detail = [];
  for (var m = 1; m <= 12; m++) {
    var ym = prevYear + '-' + (m < 10 ? '0' : '') + m;
    var d = lastAuctionDayOfMonth_(calendar, ym);
    if (d > base || !calendar.some(function (c) { return c.date === d; })) continue;
    var vals = [];
    wholesalers.forEach(function (w) {
      if (statusOn_(statusHist, w.wholesaler_id, d) !== '정상') return;
      var r = computeMetrics_({ ws: w.wholesaler_id, baseDate: d, daily: dailyByWs[w.wholesaler_id] || [], monthly: monthly, calendar: calendar, limits: [],
        balByDate: balIdx[w.wholesaler_id] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: null });
      var t = r.byName['회전율|' + APP.ALL];
      if (t && t.status === '정상') vals.push(Number(t.value));
    });
    var med = median_(vals);
    if (med !== null) { monthMedians.push(med); detail.push({ ym: ym, base_date: d, n: vals.length, median: round2_(med) }); }
  }
  var value = median_(monthMedians);
  if (value === null) throw new Error('전년도(' + prevYear + ') 회전율 자료가 부족합니다.');
  var src = prevYear + '년 월말 회전율 중앙값의 중앙값 (산정 ' + nowStr_() + ', ' + detail.length + '개월)';
  updateSetting_(user, 'MATRIX_Y_FIXED', String(round2_(value)), false, src, '기준선 자동 산정');
  updateSetting_(user, 'MATRIX_Y_FIXED_SOURCE', src, false, '', '기준선 자동 산정');
  return { value: round2_(value), source: src, months: detail };
}

/* ══════════════ Backtest.gs ══════════════ */
/**
 * Backtest.gs — 신호 기준값 백테스트와 그림자 운영 집계
 * 백테스트: 과거 기준일(표본 간격마다)에서 현재(또는 임시) 기준값으로 신호를 다시 판정하고,
 *           정답 표본(M_BACKTEST_TRUTH: 과거 실제 사안)과 대조해 포착률·적중률·선행기간·업무량을 낸다.
 * 실행시간 제한 때문에 기준일 단위로 나눠 처리하고 진행 상태를 A_BACKTEST_RUN 에 남긴다.
 * 정답 표본이 적으면(수십 건 이하) 통계적 최적화가 불가능하므로 결과에 표본 수를 함께 표시한다.
 */

var BT_STATE_KEY = 'BACKTEST_RUN_ID';

function startBacktest_(user, opts) {
  opts = opts || {};
  var st = readStatus_(), base = st.latest_base_date;
  if (!base) throw new Error('집계 자료가 없습니다.');
  var settings = readSettings_();
  var overrides = opts.overrides || {};
  Object.keys(overrides).forEach(function (k) { if (!(k in settings)) throw new Error('없는 설정 키: ' + k); });
  var sample = Math.max(1, Number(opts.sampleDays) || settingNum_(settings, 'BACKTEST_SAMPLE_DAYS', 5));
  var from = optDate_(opts.dateFrom, '시작일') || addMonths_(ymOf_(base), -12) + '-01';
  var to = optDate_(opts.dateTo, '종료일') || base;
  if (to > base) to = base;
  var dates = readTable_('DB_MASTER', 'M_CALENDAR').filter(function (c) { return c.is_auction_day && c.date >= from && c.date <= to; }).map(function (c) { return c.date; }).sort()
    .filter(function (d, i) { return i % sample === 0; });
  if (!dates.length) throw new Error('기간 내 경매일이 없습니다.');
  return withLock_(function () {
    if (prop_(BT_STATE_KEY)) throw new Error('진행 중인 백테스트가 있습니다(' + prop_(BT_STATE_KEY) + '). 완료 후 다시 시도하세요.');
    var run = { run_id: uid_('BT'), status: '진행', params_json: JSON.stringify({ overrides: overrides, user: user.user_id }), date_from: dates[0], date_to: dates[dates.length - 1],
      sample_days: sample, dates_total: dates.length, dates_done: 0, next_index: 0, started_at: nowStr_(), finished_at: '', summary_json: '', message: '' };
    appendObjects_('DB_AGG', 'A_BACKTEST_RUN', [run]);
    setProp_(BT_STATE_KEY, run.run_id);
    setProp_('BT_DATES_' + run.run_id, JSON.stringify(dates));
    audit_(user, 'START_BACKTEST', 'DB_AGG', 'A_BACKTEST_RUN', run.run_id, null, run, '백테스트 시작');
    return run;
  });
}

/** 진행: 시간 예산 안에서 기준일을 처리하고 남으면 이어서 실행 트리거를 건다 */
function continueBacktest_(timeBudgetMs, trigger) {
  var runId = prop_(BT_STATE_KEY);
  if (!runId) return { status: '없음' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: '건너뜀' };
  markLocked_(true);
  var t0 = Date.now(), started = nowStr_();
  try {
    invalidate_('DB_AGG', 'A_BACKTEST_RUN');
    var run = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
    var dates = JSON.parse(prop_('BT_DATES_' + runId) || '[]');
    var params = JSON.parse(run.params_json || '{}');
    var settings = readSettings_();
    Object.keys(params.overrides || {}).forEach(function (k) { settings[k] = String(params.overrides[k]); });
    var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
    var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
    var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), limitsAll = readTable_('DB_MASTER', 'M_LIMIT');
    var balIdx = balanceIndex_(daily), dailyByWs = indexDailyByWs_(daily);
    // 데이터 품질 보류: 기준일 직전 30일에 누락·불일치가 있는 중도매인은 그 기준일 판정을 건너뛴다(운영과 같은 규칙)
    var dqByWs = {};
    readTable_('DB_AGG', 'A_DQ').forEach(function (d) { if (d.status !== '경고') (dqByWs[d.wholesaler_id] = dqByWs[d.wholesaler_id] || []).push(d.date); });
    var heldCount = Number((JSON.parse(run.summary_json || '{}') || {}).held || 0);
    var hits = [], i = Number(run.next_index) || 0;
    for (; i < dates.length; i++) {
      if (Date.now() - t0 > timeBudgetMs) break;
      var d = dates[i];
      var active = wholesalers.filter(function (w) { return statusOn_(statusHist, w.wholesaler_id, d) === '정상'; }).map(function (w) { return w.wholesaler_id; });
      var market = marketGrowth_(daily, calendar, active, d, monthly);
      wholesalers.forEach(function (w) {
        var ws = w.wholesaler_id;
        if (w.trade_start_date && w.trade_start_date > d) return;
        var from = addDays_(d, -APP.DQ_LOOKBACK_DAYS);
        if ((dqByWs[ws] || []).some(function (x) { return x > from && x <= d; })) { heldCount++; return; }
        var m = computeMetrics_({ ws: ws, baseDate: d, daily: dailyByWs[ws] || [], monthly: monthly, calendar: calendar, limits: asOfVersions_(limitsAll, 'limit_id', ws, d),
          balByDate: balIdx[ws] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: market });
        evaluateSignals_({ settings: settings, metrics: m, bizStatus: statusOn_(statusHist, ws, d), expiring: [] }).forEach(function (h) {
          if (h.rule_id === 'S06') return;
          hits.push({ run_id: runId, base_date: d, wholesaler_id: ws, rule_id: h.rule_id, severity: h.severity, evidence_json: JSON.stringify(h.evidence) });
        });
      });
    }
    appendObjects_('DB_AGG', 'A_BACKTEST_HIT', hits);
    run.dates_done = i; run.next_index = i;
    if (i >= dates.length) {
      run.status = '완료'; run.finished_at = nowStr_();
      var summary = backtestSummary_(runId, settings); summary.held = heldCount;
      run.summary_json = JSON.stringify(summary);
      PropertiesService.getScriptProperties().deleteProperty(BT_STATE_KEY);
      PropertiesService.getScriptProperties().deleteProperty('BT_DATES_' + runId);
      clearBacktestTriggers_();
    } else {
      run.summary_json = JSON.stringify({ held: heldCount });
      run.message = dates.length + '개 기준일 중 ' + i + '개 처리';
      clearBacktestTriggers_();
      ScriptApp.newTrigger('triggerContinueBacktest').timeBased().after(APP.CONTINUE_AFTER_MS).create();
    }
    writeObject_('DB_AGG', 'A_BACKTEST_RUN', run);
    logJob_(runId, 'BACKTEST', run.status, started, i, 0, run.message || '완료', trigger || '');
    return { status: run.status, done: i, total: dates.length, run_id: runId };
  } catch (e) {
    try {
      var r2 = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
      if (r2) { r2.status = '실패'; r2.message = String(e && e.message ? e.message : e); r2.finished_at = nowStr_(); writeObject_('DB_AGG', 'A_BACKTEST_RUN', r2); }
      PropertiesService.getScriptProperties().deleteProperty(BT_STATE_KEY);
      logJob_(runId, 'BACKTEST', '실패', started, 0, 1, String(e && e.message ? e.message : e), trigger || '');
    } catch (ignore) { /* 기록 실패가 원래 오류를 가리지 않도록 */ }
    throw e;
  } finally {
    markLocked_(false);
    lock.releaseLock();
  }
}

function clearBacktestTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'triggerContinueBacktest') ScriptApp.deleteTrigger(t); });
}

/** [트리거] 백테스트 이어서 실행 */
function triggerContinueBacktest() {
  requireOwnerOrTrigger_();
  return continueBacktest_(APP.JOB_TIME_BUDGET_MS, '이어서');
}

/**
 * 요약: 포착률(사안 전 LEAD_MAX 일 이내 신호), 적중률(신호 후 HORIZON 일 이내 사안), 선행기간, 주당 경보량
 * 신호 구간: 같은 (ws, rule) 의 연속 표본 기준일을 한 "경보"로 센다(운영의 신호 구간과 같은 개념)
 */
function backtestSummary_(runId, settings) {
  var hits = readTable_('DB_AGG', 'A_BACKTEST_HIT').filter(function (h) { return h.run_id === runId; });
  var run = readTable_('DB_AGG', 'A_BACKTEST_RUN').filter(function (r) { return r.run_id === runId; })[0];
  var truth = readTable_('DB_MASTER', 'M_BACKTEST_TRUTH').filter(function (t) { return !t.is_deleted && t.event_date >= addDays_(run.date_from, -settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90)) && t.event_date <= addDays_(run.date_to, settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90)); });
  var leadMax = settingNum_(settings, 'BACKTEST_LEAD_MAX_DAYS', 90), horizon = settingNum_(settings, 'BACKTEST_HORIZON_DAYS', 90);
  var dates = JSON.parse(prop_('BT_DATES_' + runId) || 'null') || hits.map(function (h) { return h.base_date; }).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  var gap = Number(run.sample_days) || 1;
  // 경보(구간) 만들기
  var byKey = {};
  hits.forEach(function (h) { (byKey[h.wholesaler_id + '|' + h.rule_id] = byKey[h.wholesaler_id + '|' + h.rule_id] || []).push(h.base_date); });
  var alerts = [];
  Object.keys(byKey).forEach(function (k) {
    var ds = byKey[k].sort(), p = k.split('|'), cur = null;
    ds.forEach(function (d) {
      var idx = dates.indexOf(d), prevIdx = cur ? dates.indexOf(cur.last) : -1;
      if (cur && idx - prevIdx <= 1) cur.last = d;
      else { if (cur) alerts.push(cur); cur = { wholesaler_id: p[0], rule_id: p[1], first: d, last: d }; }
    });
    if (cur) alerts.push(cur);
  });
  var riskAlerts = alerts.filter(function (a) { return a.rule_id !== 'S07'; });
  // 포착률: 사안별로 [event-leadMax, event] 안에 시작/진행 중인 경보가 있는가
  var captured = 0, leads = [];
  var truthDetail = truth.map(function (t) {
    var hit = riskAlerts.filter(function (a) { return a.wholesaler_id === t.wholesaler_id && a.first <= t.event_date && a.last >= addDays_(t.event_date, -leadMax); })
      .sort(function (x, y) { return x.first < y.first ? -1 : 1; })[0];
    if (hit) { captured++; leads.push(daysBetween_(hit.first, t.event_date)); }
    return { wholesaler_id: t.wholesaler_id, event_date: t.event_date, event_type: t.event_type, captured: !!hit, first_signal: hit ? hit.first : '', rule: hit ? hit.rule_id : '', lead_days: hit ? daysBetween_(hit.first, t.event_date) : null };
  });
  // 적중률: 경보 중 horizon 안에 같은 ws 의 사안이 있는 비율
  var precise = riskAlerts.filter(function (a) { return truth.some(function (t) { return t.wholesaler_id === a.wholesaler_id && t.event_date >= a.first && t.event_date <= addDays_(a.last, horizon); }); }).length;
  // 업무량: 경매사별 주당 경보 시작 수 (표본 간격 보정 없음 — 표본일 기준 그대로)
  var asg = readTable_('DB_MASTER', 'M_ASSIGNMENT'), names = userNameMap_();
  var weeks = Math.max(1, daysBetween_(run.date_from, run.date_to) / 7);
  var byAuc = {};
  riskAlerts.forEach(function (a) {
    var who = asg.filter(function (x) { return x.wholesaler_id === a.wholesaler_id && !x.is_deleted && x.valid_from <= a.first && a.first <= (x.valid_to || APP.OPEN_END); })[0];
    var k = who ? (names[who.user_id] || who.user_id) : '(미지정)';
    byAuc[k] = (byAuc[k] || 0) + 1;
  });
  var byRule = {};
  alerts.forEach(function (a) { byRule[a.rule_id] = (byRule[a.rule_id] || 0) + 1; });
  return {
    dates: dates.length, sample_days: gap, period: run.date_from + ' ~ ' + run.date_to, truth_count: truth.length, alerts: riskAlerts.length,
    capture_rate: truth.length ? captured / truth.length : null, captured: captured,
    precision: riskAlerts.length ? precise / riskAlerts.length : null, precise: precise,
    lead_days_median: median_(leads), lead_days: leads,
    alerts_per_week: riskAlerts.length / weeks, alerts_per_auctioneer_week: Object.keys(byAuc).map(function (k) { return { auctioneer: k, per_week: round2_(byAuc[k] / weeks), total: byAuc[k] }; }),
    by_rule: byRule, truth_detail: truthDetail,
    caveat: truth.length < 30 ? '정답 표본이 ' + truth.length + '건으로 적어 통계적 최적화는 불가능합니다. 업무량 상한(경매사 1인당 주간 경보 수)을 기준으로 정하고 운영하며 조정하세요.' : ''
  };
}

/** 그림자 운영 집계: 운영 신호의 오탐·일시적 변화 비율, 경매사별 주간 경보량 (최근 N주) */
function shadowStats_(weeks) {
  weeks = Number(weeks) || 8;
  var today = todayStr_(), from = addDays_(today, -weeks * 7);
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.first_date >= from && s.rule_id !== 'S06'; });
  var cases = readTable_('DB_WORK', 'T_CASE');
  var names = userNameMap_(), asg = readTable_('DB_MASTER', 'M_ASSIGNMENT');
  var byRule = {}, byAuc = {}, falseAlarm = 0, temporary = 0, resolvedNoAction = 0;
  signals.forEach(function (s) {
    var r = byRule[s.rule_id] = byRule[s.rule_id] || { rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id].label, total: 0, false_alarm: 0, resolved: 0, active: 0 };
    r.total++;
    if (s.status === '오탐확정') { r.false_alarm++; falseAlarm++; }
    else if (s.status === '해소') r.resolved++;
    else r.active++;
    var who = asg.filter(function (x) { return x.wholesaler_id === s.wholesaler_id && !x.is_deleted && x.valid_from <= s.first_date && s.first_date <= (x.valid_to || APP.OPEN_END); })[0];
    var k = who ? (names[who.user_id] || who.user_id) : '(미지정)';
    byAuc[k] = (byAuc[k] || 0) + 1;
  });
  cases.forEach(function (c) {
    if (c.opened_date < from) return;
    if (c.result_class === '일시적 변화') temporary++;
    if (c.close_reason === '해소 확인' && !readTable_('DB_WORK', 'T_ACTION').some(function (a) { return a.case_id === c.case_id; })) resolvedNoAction++;
  });
  var total = signals.length;
  return { weeks: weeks, from: from, to: today, total_signals: total,
    false_alarm_rate: total ? (falseAlarm + temporary) / total : null, false_alarm: falseAlarm, temporary_change_cases: temporary, resolved_without_action: resolvedNoAction,
    by_rule: Object.keys(byRule).map(function (k) { return byRule[k]; }),
    per_auctioneer_week: Object.keys(byAuc).map(function (k) { return { auctioneer: k, per_week: round2_(byAuc[k] / weeks), total: byAuc[k] }; }),
    note: '불필요한 경보 비율 = (오탐 확정 + 일시적 변화 종결) ÷ 전체 신호. 그림자 운영 기간에는 업무 배정 없이 이 수치와 경매사별 주간 경보량만 관찰한다.' };
}

/* ══════════════ Qa.gs ══════════════ */
/**
 * Qa.gs — 매뉴얼 질의응답 (4단계)
 * 1) 검색 기반 답변(기본): 등록된 상황 코드·절차·근거 문서를 검색해 인용과 함께 답한다. 근거가 없으면 "확인 필요".
 * 2) AI 답변(선택): 설정 AI_ENABLED=예 이고 조직 승인(AI_ORG_APPROVED=예)이 있을 때만 호출한다.
 *    AI 호출부는 aiAdapter_ 하나로 모아 두었고, 구성되지 않았거나 실패하면 검색 기반 답변만 제공한다.
 *    중도매인 식별정보(코드·상호·대표자·연락처·보증인)는 어떤 범위 설정에서도 AI에 보내지 않는다.
 */

function tokenize_(q) {
  return String(q || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (t) { return t.length >= 2; })
    .filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 12);
}

/**
 * 검색 기반 답변. caseId 가 있으면 그 관리 건의 확인된 상황을 1번 항목에 넣고 상황 코드 매칭 결과를 우선한다.
 * 답변 순서: 확인된 상황 → 추가 확인사항 → 적용 가능한 절차 → 근거 → 필요 서식 → 다음 할 일
 */
function answerQuestion_(user, query, caseId) {
  var q = String(query || '').trim();
  if (!q) throw new Error('질문을 입력하세요.');
  var tokens = tokenize_(q), today = todayStr_(), st = readStatus_();
  var docs = {}; readTable_('DB_MASTER', 'M_DOC').forEach(function (d) { if (!d.is_deleted) docs[d.doc_id] = d; });
  var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted && v.effective_from <= today && today <= (v.effective_to || APP.OPEN_END); });
  var validVer = {}; vers.forEach(function (v) { validVer[v.doc_id + '|' + v.version] = v; });
  var situations = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; });
  var sitLabel = {}; situations.forEach(function (x) { sitLabel[x.situation_code] = x.label; });

  // 절차 단계 점수: 질의 토큰이 절차 내용·확인사항·조항·상황명·문서명에 몇 개 들어 있는가
  var scored = readTable_('DB_MASTER', 'M_PROCEDURE').filter(function (p) { return !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version]; }).map(function (p) {
    var hay = [p.content, p.checks, p.article, sitLabel[p.situation_code] || '', (docs[p.doc_id] || {}).doc_name || ''].join(' ').toLowerCase();
    var hit = tokens.filter(function (t) { return hay.indexOf(t) >= 0; });
    return { p: p, score: hit.length, hit: hit };
  }).filter(function (x) { return x.score > 0; });
  // 신호 이름으로도 상황을 찾는다 (예: "연체" → S03 연결 상황)
  Object.keys(SIGNAL_RULES).forEach(function (r) {
    var label = SIGNAL_RULES[r].label.toLowerCase();
    if (tokens.some(function (t) { return label.indexOf(t) >= 0; })) {
      situations.forEach(function (sit) {
        var cond = {}; try { cond = JSON.parse(sit.condition_json || '{}'); } catch (e) { return; }
        if ((cond.signals || []).indexOf(r) >= 0) readTable_('DB_MASTER', 'M_PROCEDURE').forEach(function (p) {
          if (p.situation_code === sit.situation_code && !p.is_deleted && validVer[p.doc_id + '|' + p.doc_version] && !scored.some(function (x) { return x.p.proc_step_id === p.proc_step_id; }))
            scored.push({ p: p, score: 1, hit: ['신호:' + r] });
        });
      });
    }
  });
  var bySit = {};
  scored.forEach(function (x) { (bySit[x.p.situation_code] = bySit[x.p.situation_code] || { situation_code: x.p.situation_code, label: sitLabel[x.p.situation_code] || x.p.situation_code, score: 0 }).score += x.score; });
  // 가장 잘 맞는 상황 대비 30% 미만 점수는 우연한 단어 일치로 보고 제외한다
  var ranked = Object.keys(bySit).map(function (k) { return bySit[k]; }).sort(function (a, b) { return b.score - a.score; });
  var top = ranked.length ? ranked[0].score : 0;
  var sitList = ranked.filter(function (x) { return x.score >= top * 0.3; }).slice(0, 3);
  var procedures = sitList.map(function (s) { var p = proceduresFor_(s.situation_code, today); p.label = s.label; p.matched = s.score; return p; });

  var facts = [], further = [], next = [];
  if (caseId) {
    var c = findCase_(caseId); requireWsAccess_(user, c.wholesaler_id);
    var det = caseDetail_(user, caseId);
    facts = det.guide.facts; further = det.guide.furtherChecks; next = det.guide.nextSteps;
    // 관리 건에 매칭된 상황을 앞에 둔다
    det.guide.procedures.forEach(function (p) { if (!procedures.some(function (x) { return x.situation_code === p.situation_code; })) procedures.unshift(p); });
  }
  var hasBasis = procedures.some(function (p) { return p.status === '정상' || p.status === '충돌' ; });
  var conflicts = procedures.filter(function (p) { return p.status === '충돌'; });
  var forms = [];
  procedures.forEach(function (p) { p.steps.forEach(function (s) { s.forms.forEach(function (f) { if (!forms.some(function (x) { return x.form_doc_id === f.form_doc_id; })) forms.push(f); }); }); });
  if (!next.length) next.push(hasBasis ? '해당 절차를 관리 건에서 조치로 등록하고 필요 서식 작성본을 만드세요.' : '문서 담당자에게 근거 문서·절차 등록을 요청하세요.');

  var answer = {
    query: q, tokens: tokens,
    basis: { data_base_date: st.latest_base_date || '', data_status: st.data_status || '', manual_versions: vers.map(function (v) { return (docs[v.doc_id] || {}).doc_name + ' ' + v.version + ' (시행 ' + v.effective_from + ')'; }) },
    facts: facts, furtherChecks: further, procedures: procedures, forms: forms, nextSteps: next,
    status: hasBasis ? (conflicts.length ? '충돌' : '정상') : '확인 필요',
    message: hasBasis ? (conflicts.length ? '문서 간 충돌이 있습니다. 두 근거를 모두 표시했으며 우선순위를 정하지 않았습니다.' : '') : '등록된 매뉴얼에서 이 질문에 해당하는 절차를 찾지 못했습니다. 절차를 임의로 만들지 않습니다. "확인 필요"로 기록하세요.',
    ai: aiAnswer_(user, q, procedures)
  };
  logAccess_(user.user_id, 'manual.query', caseId || '', '허용', q.substring(0, 80) + ' → ' + answer.status + (answer.ai.used ? ' +AI' : ''));
  return answer;
}

/**
 * AI 답변부. 사용 조건을 모두 통과해야 호출한다. 실패해도 검색 기반 답변에는 영향이 없다.
 * @return { used, status, reason, text, sources }
 */
function aiAnswer_(user, query, procedures) {
  var s = readSettings_();
  if (s.AI_ENABLED !== '예') return { used: false, status: '미사용', reason: 'AI 사용 설정 꺼짐(AI_ENABLED)' };
  if (s.AI_ORG_APPROVED !== '예') return { used: false, status: '미사용', reason: '조직 승인 미확인(AI_ORG_APPROVED)' };
  // 제공 범위: 매뉴얼 본문(등록된 절차 텍스트)만. 익명 수치 범위라도 중도매인 식별정보는 제외한다.
  var context = procedures.filter(function (p) { return p.steps.length; }).map(function (p) {
    return '[' + p.label + '] ' + p.steps.map(function (st) { return st.step_no + '. ' + st.content + ' (근거: ' + st.doc_name + ' ' + st.version + ' ' + st.article + ')'; }).join(' ');
  }).join('\n');
  if (!context) return { used: false, status: '미사용', reason: '인용할 등록 문서가 없어 AI에 질의하지 않음(근거 없는 답변 방지)' };
  try {
    var r = aiAdapter_({ query: query, context: context, scope: s.AI_DATA_SCOPE || '매뉴얼본문만' });
    logAccess_(user.user_id, 'ai.query', '', r.status === '정상' ? '허용' : '실패', (s.AI_PROVIDER_NOTE || '') + ' / ' + r.status);
    return { used: r.status === '정상', status: r.status, reason: r.reason || '', text: r.text || '', sources: r.sources || [],
      note: 'AI 답변은 등록 문서 범위에서 생성된 참고 설명입니다. 업무 판단 근거로 단독 사용하지 마세요.' };
  } catch (e) {
    return { used: false, status: '실패', reason: String(e && e.message ? e.message : e) };
  }
}

/**
 * AI 서비스 호출 자리. 서비스가 정해지면 이 함수만 구현한다(UrlFetchApp + 조직 승인 키).
 * 규칙: context 밖의 내용을 답하지 않도록 지시하고, 답변에 인용(문서·버전·조항)을 요구한다.
 * 현재는 구성되지 않았음을 돌려준다.
 */
function aiAdapter_(req) {
  var endpoint = prop_('AI_ENDPOINT'), key = prop_('AI_API_KEY');
  if (!endpoint || !key) return { status: '미구성', reason: 'AI 서비스 주소·키가 스크립트 속성(AI_ENDPOINT, AI_API_KEY)에 없음' };
  var payload = {
    instruction: '아래 [문서] 범위 안에서만 답하라. 문서에 없는 절차는 "확인 필요"라고 답하라. 각 문장 끝에 (문서명 버전 조항)을 인용하라. 중도매인 식별정보는 요청에 포함되지 않았다.',
    documents: req.context, question: req.query, scope: req.scope
  };
  var res = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { status: '실패', reason: 'HTTP ' + res.getResponseCode() };
  var body = JSON.parse(res.getContentText());
  return { status: '정상', text: body.text || body.answer || '', sources: body.sources || [] };
}

/* ══════════════ Notify.gs ══════════════ */
/**
 * Notify.gs — 일일 요약 이메일 (선택 기능)
 * - 설정 NOTIFY_EMAIL=예 일 때만 발송. 기본은 웹앱 홈 표시.
 * - 본문에는 건수와 관리건ID만 넣고 금액·상호·개인정보는 넣지 않는다.
 * - 하루 1회, 수신자는 '사용' 상태의 경매사·채권담당·관리자. 메일 할당량이 모자라면 발송하지 않고 기록만 남긴다.
 */

/** [트리거] 매일 요약 발송 */
function triggerDailyNotify() {
  requireOwnerOrTrigger_();
  return sendDailySummary_('정기');
}

function buildSummaryText_(user, w, st) {
  var lines = [APP.NAME + ' 일일 요약 (' + todayStr_() + ')', '기준일 ' + (st.latest_base_date || '-') + ' · 데이터 상태 ' + (st.data_status || '-'), ''];
  var overdueTrend = w.trendWait.filter(function (x) { return x.overdue; }), overdueAction = w.actionWait.filter(function (x) { return x.overdue; }), due = w.recheck.filter(function (x) { return x.due; });
  lines.push('신규 조기 신호 ' + w.newSignals.length + '건' + (w.newSignals.length ? ' (' + w.newSignals.map(function (x) { return x.case_id; }).join(', ') + ')' : ''));
  lines.push('동향 확인 대기 ' + w.trendWait.length + '건, 지연 ' + overdueTrend.length + '건' + (overdueTrend.length ? ' (' + overdueTrend.map(function (x) { return x.case_id; }).join(', ') + ')' : ''));
  lines.push('채권 조치 대기 ' + w.actionWait.length + '건, 지연 ' + overdueAction.length + '건' + (overdueAction.length ? ' (' + overdueAction.map(function (x) { return x.case_id; }).join(', ') + ')' : ''));
  lines.push('재점검 도래 ' + due.length + '건' + (due.length ? ' (' + due.map(function (x) { return x.case_id; }).join(', ') + ')' : ''));
  if (w.heldSignals) lines.push('판정 보류 신호 ' + w.heldSignals + '건 (자료 불완전)');
  lines.push('', '상세는 웹앱에서 확인하세요. 이 메일에는 금액·상호·개인정보가 포함되지 않습니다.');
  return lines.join('\n');
}

function sendDailySummary_(trigger) {
  var started = nowStr_(), settings = readSettings_();
  if (settings.NOTIFY_EMAIL !== '예') { logJob_('NOTIFY', 'NOTIFY', '건너뜀', started, 0, 0, 'NOTIFY_EMAIL=' + settings.NOTIFY_EMAIL, trigger); return { sent: 0, skipped: '설정 꺼짐' }; }
  var st = readStatus_();
  var users = readTable_('DB_MASTER', 'M_USER').filter(function (u) { return u.status === '사용' && !u.is_deleted && u.role !== 'VIEWER'; });
  var quota = MailApp.getRemainingDailyQuota();
  if (quota < users.length) { logJob_('NOTIFY', 'NOTIFY', '실패', started, 0, users.length, '메일 할당량 부족: 남은 ' + quota + ' < 수신자 ' + users.length, trigger); return { sent: 0, skipped: '할당량 부족' }; }
  var sent = 0;
  users.forEach(function (u) {
    var user = { user_id: u.user_id, name: u.name, role: u.role };
    var w = workQueues_(user);
    if (!w.newSignals.length && !w.trendWait.length && !w.actionWait.length && !w.recheck.length && !w.heldSignals) return;   // 할 일이 없으면 보내지 않음
    MailApp.sendEmail({ to: u.user_id, subject: '[' + APP.NAME + '] 오늘 처리할 일 ' + (w.newSignals.length + w.trendWait.length + w.actionWait.length + w.recheck.length) + '건', body: buildSummaryText_(user, w, st) });
    sent++;
  });
  logJob_('NOTIFY', 'NOTIFY', '완료', started, sent, 0, '발송 ' + sent + '명 / 대상 ' + users.length + '명', trigger);
  return { sent: sent, targets: users.length };
}

/* ══════════════ Api.gs ══════════════ */
/**
 * Api.gs — 웹앱 화면이 호출하는 공개 함수 (google.script.run)
 * 모든 함수는 apiCall_ 로 사용자·권한을 서버에서 확인한다. 반환: { ok, data | error }
 */

/* ───────────── 공통 ───────────── */

function api_bootstrap() {
  return apiCall_(null, function (user) {
    var perms = Object.keys(PERMS).filter(function (a) { return can_(user.role, a); });
    return { user: user, perms: perms, app: { name: APP.NAME, version: APP.VERSION }, status: readStatus_() };
  });
}

function api_home() {
  return apiCall_('home.view', function (user) { return buildHome_(user); });
}

function api_searchWholesalers(q) {
  return apiCall_('ws.view', function (user) { return searchWholesalers_(user, q); });
}

function api_get360(wsId, asOf) {
  return apiCall_('ws.view', function (user) { return build360_(user, String(wsId || ''), asOf); });
}

/** 보증인 상세(개인정보): 권한자만, 조회 기록을 남긴다 */
function api_getGuarantors(wsId) {
  return apiCall_('ws.viewGuarantorPII', function (user) {
    requireWsAccess_(user, wsId);
    var refs = {};
    readTable_('DB_MASTER', 'M_GUARANTEE').forEach(function (g) {
      if (g.wholesaler_id === wsId && g.guarantor_ref) refs[g.guarantor_ref] = true;
    });
    var out = readTable_('DB_PII', 'P_GUARANTOR').filter(function (p) { return refs[p.guarantor_ref] && !p.is_deleted; })
      .map(function (p) { return { guarantor_ref: p.guarantor_ref, name: p.name, relation: p.relation }; });
    logAccess_(user.user_id, 'ws.viewGuarantorPII', wsId, '허용', out.length + '명 조회');
    return out;
  });
}

/* ───────────── 기초자료 ───────────── */

function api_masterDetail(wsId) {
  return apiCall_('master.edit', function (user) {
    var ws = findWs_(wsId);
    if (!ws) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
    var pick = function (t) {
      return readTable_('DB_MASTER', t).filter(function (r) { return r.wholesaler_id === wsId; }).map(stripInternal_);
    };
    return {
      ws: stripInternal_(ws),
      statusHist: pick('M_WS_STATUS_HIST'),
      assignments: pick('M_ASSIGNMENT'),
      collaterals: pick('M_COLLATERAL'),
      guarantees: pick('M_GUARANTEE'),
      limits: pick('M_LIMIT'),
      evidence: pick('M_EVIDENCE'),
      auctioneers: readTable_('DB_MASTER', 'M_USER').filter(function (u) { return u.role === 'AUCTIONEER' && u.status === '사용'; })
        .map(function (u) { return { user_id: u.user_id, name: u.name }; }),
      limitTypes: LIMIT_TYPES, statuses: WS_STATUSES
    };
  });
}

function api_createWholesaler(o, reason) {
  return apiCall_('master.edit', function (user) { return createWholesaler_(user, o || {}, reason); });
}
function api_updateWholesaler(wsId, changes, expectedVersion, reason) {
  return apiCall_('master.edit', function (user) { return updateWholesaler_(user, wsId, changes || {}, expectedVersion, reason); });
}
function api_changeWsStatus(wsId, status, validFrom, reason) {
  return apiCall_('master.edit', function (user) { return changeWsStatus_(user, wsId, status, validFrom, reason); });
}
function api_setAssignment(wsId, userId, validFrom, reason) {
  return apiCall_('master.edit', function (user) { return setAssignment_(user, wsId, userId, validFrom, reason); });
}
function api_submitVersion(table, o, reason) {
  return apiCall_('master.edit', function (user) { return submitVersion_(user, table, o || {}, reason); });
}
function api_createGuarantor(o, reason) {
  return apiCall_('ws.viewGuarantorPII', function (user) {
    if (!can_(user.role, 'master.edit')) deny_('권한이 없습니다.');
    return createGuarantor_(user, o || {}, reason);
  });
}
function api_listPending() {
  return apiCall_('master.edit', function () { return pendingVersions_(); });
}
function api_decideVersion(table, id, versionNo, decision, reason) {
  return apiCall_('master.approve', function (user) { return decideVersion_(user, table, id, versionNo, decision, reason); });
}
function api_uploadEvidence(o) {
  return apiCall_('evidence.upload', function (user) { return uploadEvidence_(user, o || {}); });
}

/* ───────────── 사용자 ───────────── */

function api_listUsers() {
  return apiCall_('user.manage', function () {
    return readTable_('DB_MASTER', 'M_USER').filter(function (u) { return !u.is_deleted; }).map(function (u) {
      var o = stripInternal_(u); delete o.code_hash; delete o.code_salt; delete o.token_hash; o.has_code = !!u.code_hash; return o;
    });
  });
}
function api_saveUser(o, reason) {
  return apiCall_('user.manage', function (user) { return saveUser_(user, o || {}, reason); });
}

/* ───────────── 데이터 가져오기·오류 점검 ───────────── */

function api_importStatus() {
  return apiCall_('import.view', function () {
    var st = readStatus_();
    var batches = readTable_('DB_RAW', 'R_BATCH').slice(-100).reverse().map(stripInternal_);
    var recon = readTable_('DB_AGG', 'A_RECON').filter(function (r) { return r.calc_run_id === st.last_calc_run_id; }).map(stripInternal_);
    var dq = readTable_('DB_AGG', 'A_DQ');
    var byReason = {};
    dq.forEach(function (d) { byReason[d.reason_code] = (byReason[d.reason_code] || 0) + 1; });
    var inbox = 0, it = folder_('INBOX').getFiles();
    while (it.hasNext()) { it.next(); inbox++; }
    var jobs = readTable_('DB_LOG', 'L_JOB').slice(-30).reverse().map(stripInternal_);
    return {
      status: st, batches: batches, recon: recon, dqByReason: byReason,
      dqRecent: dq.slice().sort(cmpBy_(['date'])).reverse().slice(0, 100).map(stripInternal_),
      inboxCount: inbox, pipelineState: prop_(PIPE_STATE_KEY) ? JSON.parse(prop_(PIPE_STATE_KEY)) : null, jobs: jobs
    };
  });
}

function api_batchRejects(batchId) {
  return apiCall_('import.view', function () {
    return readTable_('DB_RAW', 'R_REJECT').filter(function (r) { return r.batch_id === batchId; }).map(stripInternal_);
  });
}

function api_runPipelineNow() {
  return apiCall_('import.run', function (user) {
    var r = runPipeline_('웹앱:' + user.user_id);
    audit_(user, 'RUN_PIPELINE', 'DB_RAW', '*', r.runId || '', null, r, '수동 실행');
    return r;
  });
}

/* ───────────── 이력 ───────────── */

function api_auditLog(f) {
  return apiCall_('audit.view', function () {
    f = f || {};
    var limit = Math.min(Number(f.limit) || 200, 1000);
    return readTable_('DB_LOG', 'L_AUDIT').filter(function (r) {
      if (f.table && r.table_name !== f.table) return false;
      if (f.key && String(r.record_key).indexOf(f.key) < 0) return false;
      if (f.user && String(r.user_id).indexOf(f.user) < 0) return false;
      if (f.from && r.at.substring(0, 10) < f.from) return false;
      if (f.to && r.at.substring(0, 10) > f.to) return false;
      return true;
    }).slice(-limit).reverse().map(stripInternal_);
  });
}

function api_accessLog(f) {
  return apiCall_('audit.view', function () {
    f = f || {};
    return readTable_('DB_LOG', 'L_ACCESS').filter(function (r) {
      return !f.result || r.result === f.result;
    }).slice(-300).reverse().map(stripInternal_);
  });
}

/* ───────────── 화면 데이터 조립 ───────────── */

function userNameMap_() {
  var m = {};
  readTable_('DB_MASTER', 'M_USER').forEach(function (u) { m[u.user_id] = u.name; });
  return m;
}

function currentAssignees_(wsId, onDate, names) {
  return readTable_('DB_MASTER', 'M_ASSIGNMENT').filter(function (a) {
    return a.wholesaler_id === wsId && !a.is_deleted && a.valid_from <= onDate && onDate <= (a.valid_to || APP.OPEN_END);
  }).map(function (a) { return { user_id: a.user_id, name: names[a.user_id] || a.user_id, valid_from: a.valid_from }; });
}

function accessibleWs_(user) {
  var today = todayStr_(), asg = readTable_('DB_MASTER', 'M_ASSIGNMENT');
  return readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) {
    return !w.is_deleted && canAccessWs_(user, w.wholesaler_id, asg, today);
  });
}

function searchWholesalers_(user, q) {
  q = String(q || '').trim().toLowerCase();
  var names = userNameMap_(), today = todayStr_();
  return accessibleWs_(user).filter(function (w) {
    return !q || w.wholesaler_id.toLowerCase().indexOf(q) >= 0 || String(w.name).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 100).map(function (w) {
    return { wholesaler_id: w.wholesaler_id, name: w.name, biz_status: w.biz_status, categories: w.categories,
      assignees: currentAssignees_(w.wholesaler_id, today, names).map(function (a) { return a.name; }).join(', ') };
  });
}

function latestArRow_(daily, wsId, onOrBefore) {
  var best = null;
  daily.forEach(function (r) {
    if (r.wholesaler_id === wsId && r.category === APP.ALL && r.ar_balance !== '' && r.date <= onOrBefore) {
      if (!best || r.date > best.date) best = r;
    }
  });
  return best;
}

function build360_(user, wsId, asOf) {
  requireWsAccess_(user, wsId);
  var ws = findWs_(wsId);
  if (!ws) throw new Error('중도매인을 찾을 수 없습니다: ' + wsId);
  var st = readStatus_(), today = todayStr_(), names = userNameMap_();
  asOf = asOf && isYmd_(asOf) && asOf <= today ? asOf : today;
  var latest = st.latest_base_date || '';
  var baseDate = latest && latest < asOf ? latest : asOf;   // 자료가 있는 마지막 기준일

  var collaterals = asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', wsId, asOf).map(stripInternal_);
  var guarantees = asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', wsId, asOf).map(stripInternal_);
  var limits = asOfVersions_(readTable_('DB_MASTER', 'M_LIMIT'), 'limit_id', wsId, asOf).map(stripInternal_)
    .sort(function (a, b) { return LIMIT_TYPES.indexOf(a.limit_type) - LIMIT_TYPES.indexOf(b.limit_type); });
  var pending = 0;
  Object.keys(VERSIONED).forEach(function (t) {
    readTable_('DB_MASTER', t).forEach(function (r) { if (r.wholesaler_id === wsId && r.approval_status === '승인대기') pending++; });
  });

  var daily = readTable_('DB_AGG', 'A_DAILY');
  var ar = latestArRow_(daily, wsId, baseDate);
  var receipts = readTable_('DB_RAW', 'R_RECEIPT').filter(function (r) { return r.wholesaler_id === wsId && r.posted_date <= baseDate; })
    .sort(cmpBy_(['posted_date'])).reverse().slice(0, 5)
    .map(function (r) { return { receipt_date: r.receipt_date, posted_date: r.posted_date, amount: r.amount, receipt_type: r.receipt_type }; });

  var calendar = readTable_('DB_MASTER', 'M_CALENDAR');
  var trend = latest ? monthlyTrend_(readTable_('DB_AGG', 'A_MONTHLY'), daily, calendar, wsId, baseDate, 12) : [];

  // 데이터 상태: 자료가 불완전하면 '정상'으로 표시하지 않는다
  var from = addDays_(baseDate, -APP.DQ_LOOKBACK_DAYS);
  var dq = readTable_('DB_AGG', 'A_DQ').filter(function (d) { return d.wholesaler_id === wsId && d.date > from && d.date <= baseDate; })
    .map(stripInternal_);
  var blocking = dq.filter(function (d) { return d.status === '누락' || d.status === '불일치'; });
  var reasons = blocking.slice(0, 5).map(function (d) { return d.date + ' ' + d.status + ': ' + d.detail; });
  if (!latest) reasons.push('적재된 잔액 자료 없음');
  else if (asOf >= latest && st.data_status !== '정상') reasons.push('전체 자료 상태 ' + st.data_status + ': ' + (st.status_reasons || ''));
  var dataState = reasons.length ? '판정보류' : '정상';

  var warnTo = addDays_(asOf, APP.EXPIRY_WARN_DAYS), expiring = [];
  collaterals.forEach(function (c) {
    if (c.expiry_date && c.expiry_date >= asOf && c.expiry_date <= warnTo)
      expiring.push({ kind: '담보', id: c.collateral_id, label: c.collateral_type, date: c.expiry_date, dday: daysBetween_(asOf, c.expiry_date) });
  });
  guarantees.forEach(function (g) {
    if (g.period_to && g.period_to >= asOf && g.period_to <= warnTo)
      expiring.push({ kind: '보증', id: g.guarantee_id, label: g.scope || '연대보증', date: g.period_to, dday: daysBetween_(asOf, g.period_to) });
  });

  var view = {
    meta: {
      asOf: asOf, baseDate: baseDate, latestBaseDate: latest,
      period: trend.length ? trend[0].ym + ' ~ ' + baseDate : '',
      lastUpdated: st.last_updated_at || '', globalStatus: st.data_status || '자료없음', calcRunId: st.last_calc_run_id || '',
      isPast: asOf < today
    },
    ws: {
      wholesaler_id: ws.wholesaler_id, name: ws.name, representative: ws.representative,
      biz_status_now: ws.biz_status, biz_status_asof: statusOn_(readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), wsId, asOf),
      trade_start_date: ws.trade_start_date, categories: ws.categories, settle_group: ws.settle_group,
      assignees: currentAssignees_(wsId, asOf, names)
    },
    credit: {
      ar_date: ar ? ar.date : '', ar_balance: ar ? ar.ar_balance : null,
      overdue_amount: ar ? ar.overdue_amount : null, max_overdue_days: ar ? ar.max_overdue_days : null,
      overdue_note: APP.OVERDUE_TERMS_NOTE,
      limit_note: '한도 유형별 금액을 따로 표시합니다. 기본·마감·추가한도의 적용 관계는 내부 규정 확인 전까지 합산하지 않으며, 한도 사용률은 2단계에서 규정 확인 후 산출합니다.',
      recentReceipts: receipts
    },
    limits: limits, collaterals: collaterals, guarantees: guarantees, pendingVersions: pending,
    expiring: expiring,
    trend: trend,
    turnoverNote: '미수금 회전율·회수일수는 2단계에서 제공합니다. 부류별 채권 배분 근거가 없으므로 부류별 회전율은 산출하지 않습니다.',
    dataState: { state: dataState, reasons: reasons, issues: dq.slice(0, 20) },
    contacts: readTable_('DB_MASTER', 'M_CONTACT').filter(function (c) { return c.wholesaler_id === wsId && !c.is_deleted; })
      .map(function (c) { return { contact_type: c.contact_type, value: c.value }; }),
    evidence: readTable_('DB_MASTER', 'M_EVIDENCE').filter(function (e) { return e.wholesaler_id === wsId; })
      .map(function (e) { return { evidence_id: e.evidence_id, file_name: e.file_name, doc_type: e.doc_type, target_id: e.target_id, created_at: e.created_at }; }),
    history: readTable_('DB_LOG', 'L_AUDIT').filter(function (a) { return String(a.record_key).indexOf(wsId) >= 0; })
      .slice(-30).reverse().map(function (a) { return { at: a.at, user_id: a.user_id, action: a.action, table_name: a.table_name, record_key: a.record_key, reason: a.reason }; })
  };
  if (!can_(user.role, 'ws.viewEvidence')) delete view.evidence;
  return filter360ByRole_(view, user.role);
}

function buildHome_(user) {
  var st = readStatus_(), today = todayStr_(), names = userNameMap_();
  var mine = accessibleWs_(user), mineSet = {};
  mine.forEach(function (w) { mineSet[w.wholesaler_id] = w; });

  var warnTo = addDays_(today, APP.EXPIRY_WARN_DAYS), expiring = [];
  asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', null, today).forEach(function (c) {
    if (mineSet[c.wholesaler_id] && c.expiry_date && c.expiry_date >= today && c.expiry_date <= warnTo)
      expiring.push({ wholesaler_id: c.wholesaler_id, name: mineSet[c.wholesaler_id].name, kind: '담보', label: c.collateral_type, date: c.expiry_date, dday: daysBetween_(today, c.expiry_date) });
  });
  asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', null, today).forEach(function (g) {
    if (mineSet[g.wholesaler_id] && g.period_to && g.period_to >= today && g.period_to <= warnTo)
      expiring.push({ wholesaler_id: g.wholesaler_id, name: mineSet[g.wholesaler_id].name, kind: '보증', label: g.scope || '연대보증', date: g.period_to, dday: daysBetween_(today, g.period_to) });
  });
  expiring.sort(cmpBy_(['date']));

  // 데이터 이상: 최신 기준일 기준 최근 7일, 중도매인별로 묶음
  var latest = st.latest_base_date || '';
  var dqFrom = latest ? addDays_(latest, -7) : '';
  var dqByWs = {};
  readTable_('DB_AGG', 'A_DQ').forEach(function (d) {
    if (!mineSet[d.wholesaler_id] || d.date <= dqFrom || d.status === '경고') return;
    var g = dqByWs[d.wholesaler_id] = dqByWs[d.wholesaler_id] || { wholesaler_id: d.wholesaler_id, name: mineSet[d.wholesaler_id].name, items: [] };
    g.items.push({ date: d.date, status: d.status, detail: d.detail });
  });

  var batchProblems = [];
  if (can_(user.role, 'import.view')) {
    batchProblems = readTable_('DB_RAW', 'R_BATCH').filter(function (b) { return ['형식오류', '실패', '부분적재'].indexOf(b.status) >= 0; })
      .slice(-20).reverse().map(function (b) { return { batch_id: b.batch_id, file_name: b.file_name, status: b.status, message: b.message, finished_at: b.finished_at }; });
  }
  var pending = [];
  if (can_(user.role, 'master.edit')) {
    pending = pendingVersions_().filter(function (p) { return can_(user.role, 'master.approve') || p.requested_by === user.user_id; })
      .map(function (p) { return { table: p.table, tableLabel: p.tableLabel, id: p.id, version_no: p.version_no, wholesaler_id: p.wholesaler_id, requested_by: names[p.requested_by] || p.requested_by, requested_at: p.requested_at, change_reason: p.change_reason }; });
  }

  return {
    status: st,
    counts: { myWholesalers: mine.length, expiring: expiring.length, dataIssues: Object.keys(dqByWs).length, batchProblems: batchProblems.length, pending: pending.length },
    expiring: expiring, dataIssues: Object.keys(dqByWs).map(function (k) { return dqByWs[k]; }),
    batchProblems: batchProblems, pending: pending,
    myList: user.role === 'AUCTIONEER' ? mine.map(function (w) { return { wholesaler_id: w.wholesaler_id, name: w.name, biz_status: w.biz_status }; }) : [],
    work: workQueues_(user)
  };
}

/* ───────────── 2단계: 신호·관리 건·동향·조치·승인·서식 ───────────── */

function api_workQueues() {
  return apiCall_('work.view', function (user) { return workQueues_(user); });
}

function api_caseDetail(caseId) {
  return apiCall_('work.view', function (user) { return caseDetail_(user, String(caseId || '')); });
}

function api_openCase(wsId, reason) {
  return apiCall_('case.manage', function (user) { return openCaseManually_(user, String(wsId || ''), reason); });
}

function api_saveTrend(o, submit) {
  return apiCall_('trend.write', function (user) {
    var c = findCase_(String((o || {}).case_id || ''));
    requireWsAccess_(user, c.wholesaler_id);
    return saveTrendReport_(user, o || {}, !!submit);
  });
}

function api_flagFalseAlarm(signalId, reason, confirm) {
  return apiCall_('signal.flag', function (user) {
    var s = readTable_('DB_WORK', 'T_SIGNAL').filter(function (r) { return r.signal_id === signalId; })[0];
    if (!s) throw new Error('신호를 찾을 수 없습니다.');
    requireWsAccess_(user, s.wholesaler_id);
    return flagFalseAlarm_(user, signalId, reason, !!confirm);
  });
}

function api_createAction(o) {
  return apiCall_('case.manage', function (user) { return createAction_(user, o || {}); });
}
function api_requestApproval(actionId) {
  return apiCall_('case.manage', function (user) { return requestApproval_(user, actionId); });
}
function api_decideApproval(approvalId, decision, reason) {
  return apiCall_('approval.decide', function (user) { return decideApproval_(user, approvalId, decision, reason); });
}
function api_completeAction(actionId, result, doneDate) {
  return apiCall_('case.manage', function (user) { return completeAction_(user, actionId, result, doneDate); });
}
function api_closeCase(caseId, reason, recheckDate, summary) {
  return apiCall_('case.manage', function (user) { return closeCase_(user, caseId, reason, recheckDate, summary); });
}
function api_recheckCase(caseId, note) {
  return apiCall_('case.manage', function (user) { return recheckCase_(user, caseId, note); });
}

function api_pendingApprovals() {
  return apiCall_('work.view', function (user) {
    var names = userNameMap_();
    var mine = {}; accessibleWs_(user).forEach(function (w) { mine[w.wholesaler_id] = w; });
    var actions = {}; readTable_('DB_WORK', 'T_ACTION').forEach(function (a) { actions[a.action_id] = a; });
    return readTable_('DB_WORK', 'T_APPROVAL').filter(function (a) { return a.decision === '대기'; }).map(function (a) {
      var act = actions[a.action_id] || {};
      if (!mine[act.wholesaler_id]) return null;
      return { approval_id: a.approval_id, case_id: a.case_id, action_id: a.action_id, wholesaler_id: act.wholesaler_id, name: mine[act.wholesaler_id].name,
        action_type: act.action_type, content: act.content, due_date: act.due_date, requested_by: names[a.requested_by] || a.requested_by, requested_at: a.requested_at,
        basis_snapshot_id: a.basis_snapshot_id, canDecide: can_(user.role, 'approval.decide') && a.requested_by !== user.user_id };
    }).filter(Boolean);
  });
}

function api_createDraftForm(caseId, formDocId) {
  return apiCall_('form.draft', function (user) { return createDraftForm_(user, caseId, formDocId); });
}
function api_blankForm(formDocId) {
  return apiCall_('form.blank', function (user) { return blankFormLink_(user, formDocId); });
}
function api_uploadFinal(caseId, o) {
  return apiCall_('form.draft', function (user) { return uploadFinalForm_(user, caseId, o || {}); });
}

/** 동향보고 작성용 빈 양식·기본정보 채운 양식(텍스트) */
function api_trendFormText(caseId, filled) {
  return apiCall_('trend.write', function (user) {
    var c = findCase_(caseId); requireWsAccess_(user, c.wholesaler_id);
    var v = filled ? placeholderValues_(c) : {};
    var get = function (k) { return filled ? (v[k] || '') : ''; };
    var lines = ['[동향보고] 관리건 ' + c.case_id, '중도매인코드: ' + get('중도매인코드') + '  상호: ' + get('상호'), '작성일: ' + get('작성일') + '  작성 경매사: ',
      '발생 신호·관련 수치: ' + (filled ? readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === c.case_id; }).map(function (s) { return s.rule_id + ' ' + s.evidence_json; }).join(' / ') : ''),
      '기준일: ' + get('기준일') + '  미수금: ' + get('미수금') + '  연체: ' + get('연체금액') + ' (' + get('연체일수') + '일)',
      '확인일:        확인 방법:        확인 상대방: ', '확인된 사실(사실만):', ' 1.', ' 2.', '영업 상황·결제계획:', '근거자료:', '작성자 의견(사실과 분리):', '추가 확인사항:',
      '확인 결과 분류: [ ] 일시적 변화  [ ] 지속 관찰  [ ] 채권 검토 필요  [ ] 판정 보류(자료 부족)', '후속 조치 / 담당자 / 기한 / 재점검일:',
      '※ 공식 원본은 시스템 입력입니다. 이 파일로 제출할 때는 화면에 확인일·결과 분류·재점검일을 입력하고 파일을 첨부하세요.'];
    logAccess_(user.user_id, filled ? 'trend.form.filled' : 'trend.form.blank', caseId, '허용', '');
    return { file_name: c.case_id + '_동향보고_' + (filled ? '기본정보' : '빈양식') + '.txt', text: lines.join('\n') };
  });
}

/* ───────────── 지표·신호 기준 / 매뉴얼·서식 관리 ───────────── */

function api_settings() {
  return apiCall_('work.view', function (user) {
    var rows = readTable_('DB_MASTER', 'M_SETTING').filter(function (r) { return !r.is_deleted; }).map(stripInternal_);
    return { settings: rows, choices: SETTING_CHOICES, rules: SIGNAL_RULES, canEdit: can_(user.role, 'settings.edit'), status: readStatus_() };
  });
}
function api_updateSetting(key, value, isAssumed, note, reason) {
  return apiCall_('settings.edit', function (user) { return updateSetting_(user, key, value, isAssumed, note, reason); });
}

/** 기준값 시뮬레이션: 저장하지 않고 임시 값으로 최신 기준일 신호 건수를 계산 */
function api_simulateSettings(overrides) {
  return apiCall_('settings.edit', function () {
    var settings = readSettings_();
    Object.keys(overrides || {}).forEach(function (k) { settings[k] = String(overrides[k]); });
    var st = readStatus_(), base = st.latest_base_date;
    if (!base) throw new Error('기준일 없음');
    var daily = readTable_('DB_AGG', 'A_DAILY'), monthly = readTable_('DB_AGG', 'A_MONTHLY'), calendar = readTable_('DB_MASTER', 'M_CALENDAR');
    var statusHist = readTable_('DB_MASTER', 'M_WS_STATUS_HIST'), limitsAll = readTable_('DB_MASTER', 'M_LIMIT'), balIdx = balanceIndex_(daily);
    var wholesalers = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) { return !w.is_deleted; });
    var active = wholesalers.filter(function (w) { return statusOn_(statusHist, w.wholesaler_id, base) === '정상'; }).map(function (w) { return w.wholesaler_id; });
    var market = marketGrowth_(daily, calendar, active, base, monthly), counts = {}, perWs = [];
    wholesalers.forEach(function (w) {
      var m = computeMetrics_({ ws: w.wholesaler_id, baseDate: base, daily: daily, monthly: monthly, calendar: calendar, limits: asOfVersions_(limitsAll, 'limit_id', w.wholesaler_id, base),
        balByDate: balIdx[w.wholesaler_id] || {}, tradeStart: w.trade_start_date, settings: settings, marketGrowth: market });
      var hits = evaluateSignals_({ settings: settings, metrics: m, bizStatus: statusOn_(statusHist, w.wholesaler_id, base), expiring: expiringFor_(w.wholesaler_id, base, settings) });
      hits.forEach(function (h) { counts[h.rule_id] = (counts[h.rule_id] || 0) + 1; });
      if (hits.length) perWs.push({ wholesaler_id: w.wholesaler_id, name: w.name, rules: hits.map(function (h) { return h.rule_id; }).join(',') });
    });
    return { base_date: base, counts: counts, wholesalersWithSignals: perWs, total: wholesalers.length, note: '저장되지 않은 시뮬레이션(최신 기준일만). 과거 기준일 전체는 백테스트 사용' };
  });
}

function api_docs() {
  return apiCall_('work.view', function (user) {
    var vers = readTable_('DB_MASTER', 'M_DOC_VER').filter(function (v) { return !v.is_deleted; }).map(stripInternal_);
    var docs = readTable_('DB_MASTER', 'M_DOC').filter(function (d) { return !d.is_deleted; }).map(function (d) {
      var o = stripInternal_(d); o.versions = vers.filter(function (v) { return v.doc_id === d.doc_id; }); return o;
    });
    var today = todayStr_();
    var situations = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; }).map(function (x) {
      var o = stripInternal_(x); o.procedures = proceduresFor_(x.situation_code, today); return o;
    });
    return { docs: docs, situations: situations, canManage: can_(user.role, 'docs.manage') };
  });
}
function api_registerDoc(o, reason) { return apiCall_('docs.manage', function (user) { return registerDoc_(user, o || {}, reason); }); }
function api_registerDocVersion(o, reason) { return apiCall_('docs.manage', function (user) { return registerDocVersion_(user, o || {}, reason); }); }
function api_registerSituation(o, reason) { return apiCall_('docs.manage', function (user) { return registerSituation_(user, o || {}, reason); }); }
function api_registerProcedure(o, reason) { return apiCall_('docs.manage', function (user) { return registerProcedure_(user, o || {}, reason); }); }

/** 중도매인 통합 상세에 붙일 최신 지표·신호·관리 건 */
function api_wsWork(wsId) {
  return apiCall_('work.view', function (user) {
    requireWsAccess_(user, wsId);
    var st = readStatus_(), base = st.signal_base_date || st.latest_base_date || '';
    var metrics = readTable_('DB_AGG', 'A_METRIC').filter(function (m) { return m.wholesaler_id === wsId && m.base_date === base; }).map(stripInternal_);
    var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.wholesaler_id === wsId; }).map(function (s) {
      var o = stripInternal_(s); o.label = SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id; o.evidence = JSON.parse(s.evidence_json || '{}'); delete o.evidence_json; delete o.params_json; return o;
    });
    var cases = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return c.wholesaler_id === wsId && !c.is_deleted; }).map(stripInternal_);
    return { base_date: base, metrics: metrics, signals: signals, cases: cases, params: st.signal_params ? JSON.parse(st.signal_params) : {} };
  });
}

/* ───────────── 3단계: 실적관리 · 매트릭스 · 백테스트 ───────────── */

function api_performance() {
  return apiCall_('ws.view', function (user) { return performanceSummary_(user); });
}
function api_performanceDetail(wsId) {
  return apiCall_('ws.view', function (user) { return performanceDetail_(user, String(wsId || '')); });
}
function api_matrix(category) {
  return apiCall_('ws.view', function (user) { return matrix_(user, category); });
}
function api_computeMatrixBaseline() {
  return apiCall_('settings.edit', function (user) { return computeMatrixBaseline_(user); });
}

function api_backtestStatus() {
  return apiCall_('work.view', function () {
    var runs = readTable_('DB_AGG', 'A_BACKTEST_RUN').map(function (r) {
      var o = stripInternal_(r);
      try { o.params = JSON.parse(r.params_json || '{}'); o.summary = r.summary_json ? JSON.parse(r.summary_json) : null; } catch (e) { o.summary = null; }
      delete o.params_json; delete o.summary_json; return o;
    }).reverse();
    return { runs: runs, current: prop_(BT_STATE_KEY) || '', truth: readTable_('DB_MASTER', 'M_BACKTEST_TRUTH').filter(function (t) { return !t.is_deleted; }).map(stripInternal_), shadow: shadowStats_(8) };
  });
}
function api_startBacktest(opts) {
  return apiCall_('settings.edit', function (user) {
    var run = startBacktest_(user, opts || {});
    var r = continueBacktest_(Math.min(APP.JOB_TIME_BUDGET_MS, 150000), '웹앱:' + user.user_id);   // 웹 요청은 짧게, 나머지는 트리거
    return { run: run, progress: r };
  });
}
function api_continueBacktest() {
  return apiCall_('settings.edit', function (user) { return continueBacktest_(Math.min(APP.JOB_TIME_BUDGET_MS, 150000), '웹앱:' + user.user_id); });
}
function api_saveTruth(o, reason) {
  return apiCall_('settings.edit', function (user) { return saveTruth_(user, o || {}, reason); });
}
function api_deleteTruth(truthId, reason) {
  return apiCall_('settings.edit', function (user) { return deleteTruth_(user, truthId, reason); });
}

/* ───────────── 4단계: 매뉴얼 질의 · 반출 기록 · 알림 ───────────── */

function api_askManual(query, caseId) {
  return apiCall_('work.view', function (user) { return answerQuestion_(user, query, caseId ? String(caseId) : ''); });
}

/** 비교표 CSV 를 서버에서 만들고 반출 기록을 남긴다 */
function api_exportCompare(category) {
  return apiCall_('ws.view', function (user) {
    var p = performanceSummary_(user), cat = APP.CATEGORIES.indexOf(category) >= 0 ? category : APP.ALL;
    var g = function (x) { return x.status === '정상' ? (x.value * 100).toFixed(1) : x.status; };
    var lines = [['코드', '상호', '12개월구매', '구매일수', '전년동월대비(%)', '전년동기누적대비(%)', '회전율', '회수일수', '미수잔액', '연체금액', '데이터상태'].join(',')];
    p.rows.slice().sort(function (a, b) { return b.byCategory[cat].amount12 - a.byCategory[cat].amount12; }).forEach(function (r) {
      var c = r.byCategory[cat];
      lines.push(toCsvLine_([r.wholesaler_id, r.name, c.amount12, c.days12, g(c.lastMonth.yoy), g(c.ytd.growth), r.turnover === null ? '' : r.turnover.toFixed(2),
        r.collectionDays === null ? '' : r.collectionDays.toFixed(1), r.balance === null ? '' : r.balance, r.overdue === null ? '' : r.overdue, r.dataState]));
    });
    var name = '실적비교_' + p.meta.baseDate + '_' + cat + '.csv';
    logAccess_(user.user_id, 'export.csv', name, '허용', p.rows.length + '행');
    return { file_name: name, text: lines.join('\n') };
  });
}

function api_sendDailySummaryNow() {
  return apiCall_('settings.edit', function (user) { return sendDailySummary_('웹앱:' + user.user_id); });
}

/* ───────────── 접속코드 방식 (AUTH_MODE=code) ───────────── */

/** 로그인 화면 표시 여부 등 — 사용자 확인 전 호출 가능 */
function api_authInfo() {
  var settings = readSettings_();
  var email = currentEmail_();
  var known = !!(email && readTable_('DB_MASTER', 'M_USER').some(function (r) { return String(r.user_id).toLowerCase() === email && r.status === '사용' && !r.is_deleted; }));
  return { ok: true, data: { mode: settings.AUTH_MODE || 'google', googleIdentified: known, app: { name: APP.NAME, version: APP.VERSION } } };
}

function api_login(email, code) {
  _requestId = uid_('RQ');
  try { return { ok: true, data: loginWithCode_(email, code) }; }
  catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
}

/**
 * 접속코드 방식 공용 호출부: 토큰을 확인한 뒤 api_* 함수를 호출한다.
 * fn 은 'api_' 로 시작하는 등록 함수 이름만 허용한다(임의 함수 호출 방지).
 */
function api_call(token, fn, args) {
  _requestId = uid_('RQ');
  if (typeof fn !== 'string' || fn.indexOf('api_') !== 0 || ['api_call', 'api_login', 'api_authInfo'].indexOf(fn) >= 0 || typeof this[fn] !== 'function') {
    return { ok: false, error: '허용되지 않은 호출입니다.' };
  }
  if (!authenticateToken_(token)) {
    logAccess_('', fn, '', '거부', '세션 없음·만료');
    return { ok: false, error: 'SESSION_EXPIRED: 다시 로그인하세요.' };
  }
  try { return this[fn].apply(null, Array.isArray(args) ? args : []); }
  finally { _tokenUser = null; }
}

function api_logout() {
  return apiCall_(null, function (user) { return logoutToken_(user); });
}

function api_issueAccessCode(userId, reason) {
  return apiCall_('user.manage', function (admin) { return issueAccessCode_(admin, userId, reason); });
}

function api_registerManualFolder(folderIdOrName) {
  return apiCall_('docs.manage', function (user) { var r = registerManualFolder_(user, folderIdOrName); var s = seedSituations_(user); return { registered: r, situations: s }; });
}

/* ───────────── 주간 요약(홈)·체크리스트 ───────────── */
function api_summary() { return apiCall_('work.view', function (user) { return weeklySummary_(user); }); }
function api_checklist(caseId) {
  return apiCall_('work.view', function (user) {
    var c = findCase_(caseId); requireWsAccess_(user, c.wholesaler_id);
    var sg = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return s.case_id === caseId && s.status !== '해소' && s.status !== '오탐확정'; });
    return { print: checklistPrintData_(c, sg, findWs_(c.wholesaler_id).name), resultClasses: RESULT_CLASSES, canWrite: can_(user.role, 'trend.write') };
  });
}
function api_saveChecklist(o) { return apiCall_('trend.write', function (user) { return saveChecklistResult_(user, o || {}); }); }
function api_actionGuides() { return apiCall_('work.view', function () { return actionGuides_(); }); }

/* ══════════════ VirtualData.gs ══════════════ */
/**
 * VirtualData.gs — 가상 테스트 데이터 생성 (순수 함수, 실제 중도매인과 무관)
 * 같은 seed 이면 항상 같은 자료가 만들어진다.
 *
 * 포함된 가상 사례
 *  W0123 (가상)한빛청과  : 최근 3개월 결제 지연(회전율 저하·연체 발생), 담보 재평가·한도 감액 이력
 *  W0207 (가상)사계과일  : 과일 전문, 여름철 계절적 구매 감소(매년 반복) — 부실 아님
 *  W0310 (가상)새싹채소  : 2026-05 신규 거래
 *  W0405 (가상)동녘상회  : 2026-08-01 휴업 (구매 중단, 잔액 정리)
 *  W0512 (가상)다온유통  : 반품·취소가 잦음
 *  그 외 W0101~W0115    : 일반
 */

var VD_HOLIDAYS = ['2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-10-05', '2025-10-06', '2025-10-07',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-09-24', '2026-09-25', '2026-09-26'];

var VD_SEASON = {
  '과일': [1.15, 1.25, 0.9, 0.85, 0.9, 1.0, 1.05, 1.2, 1.35, 1.15, 1.0, 1.1],
  '채소': [1.05, 1.0, 1.0, 1.05, 1.0, 0.95, 0.95, 1.0, 1.05, 1.0, 1.0, 1.05],
  '계절과일': [1.2, 1.3, 1.0, 0.9, 0.7, 0.45, 0.4, 0.6, 1.3, 1.3, 1.1, 1.2]
};

function vdRng_(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vdProfiles_(rng) {
  var names = ['새벽청과', '가람농산', '푸른들', '한마음상회', '대흥청과', '미래농산', '금강유통', '들녘상회',
    '참좋은청과', '성실농산', '해오름', '바른유통', '농원상회', '으뜸청과', '보람농산'];
  var list = [];
  names.forEach(function (n, i) {
    var cats = i % 5 === 0 ? ['과일'] : (i % 7 === 0 ? ['채소'] : ['과일', '채소']);
    var base = {};
    cats.forEach(function (c) { base[c] = Math.round((600000 + rng() * 2400000) / 10000) * 10000; });
    list.push({ id: 'W01' + (i + 1 < 10 ? '0' : '') + (i + 1), name: '(가상)' + n, cats: cats, base: base,
      creditRatio: 0.7 + rng() * 0.25, payLag: 7 + Math.floor(rng() * 9), payProb: 0.35, buyProb: 0.85,
      returnRate: 0.01, tradeStart: '20' + (15 + Math.floor(rng() * 8)) + '-0' + (1 + Math.floor(rng() * 9)) + '-01',
      auctioneer: 1 + (i % 3) });
  });
  list.push({ id: 'W0123', name: '(가상)한빛청과', cats: ['과일', '채소'], base: { '과일': 2600000, '채소': 1500000 },
    creditRatio: 0.9, payLag: 10, payProb: 0.35, buyProb: 0.88, returnRate: 0.01, tradeStart: '2016-03-01', auctioneer: 1,
    slowFrom: '2026-07-27', slowLag: 38, slowPart: 0.55 });
  list.push({ id: 'W0207', name: '(가상)사계과일', cats: ['과일'], base: { '과일': 2200000 }, season: '계절과일',
    creditRatio: 0.8, payLag: 9, payProb: 0.35, buyProb: 0.85, returnRate: 0.01, tradeStart: '2018-04-01', auctioneer: 2 });
  list.push({ id: 'W0310', name: '(가상)새싹채소', cats: ['채소'], base: { '채소': 900000 },
    creditRatio: 0.75, payLag: 8, payProb: 0.35, buyProb: 0.8, returnRate: 0.01, tradeStart: '2026-05-04', auctioneer: 3 });
  list.push({ id: 'W0405', name: '(가상)동녘상회', cats: ['과일', '채소'], base: { '과일': 1000000, '채소': 800000 },
    creditRatio: 0.8, payLag: 9, payProb: 0.35, buyProb: 0.85, returnRate: 0.01, tradeStart: '2017-06-01', auctioneer: 2,
    closedFrom: '2026-08-01' });
  list.push({ id: 'W0512', name: '(가상)다온유통', cats: ['과일', '채소'], base: { '과일': 1400000, '채소': 1100000 },
    creditRatio: 0.85, payLag: 11, payProb: 0.35, buyProb: 0.86, returnRate: 0.06, tradeStart: '2019-09-01', auctioneer: 3 });
  return list;
}

/**
 * @param opt { startDate, endDate, seed, ownerEmail }
 * @return { master: {...테이블별 행}, files: [{name, content}], summary }
 */
function genVirtualData_(opt) {
  var start = opt.startDate, end = opt.endDate, rng = vdRng_(opt.seed || 20261027);
  var holiday = {};
  VD_HOLIDAYS.forEach(function (d) { holiday[d] = true; });
  // 경매 일정은 당월 말일까지 미리 등록(실무에서도 연간 일정은 사전에 확정됨)
  var calendar = dateRange_(start, monthEnd_(ymOf_(end))).map(function (d) {
    var aud = dowOf_(d) !== 0 && !holiday[d];
    return { date: d, is_auction_day: aud, note: holiday[d] ? '휴장(가상 일정)' : (dowOf_(d) === 0 ? '일요일' : '') };
  });
  var auctionDays = calendar.filter(function (c) { return c.is_auction_day && c.date <= end; }).map(function (c) { return c.date; });
  var profiles = vdProfiles_(rng);

  var sales = [], receipts = [], arRows = [];
  profiles.forEach(function (p) {
    var from = p.tradeStart > start ? p.tradeStart : start;
    var queue = [];          // 미결제 외상 {date, amt, txn}
    var balance = 0;
    var pendingRet = {};     // 반품 예정 {date: [rows]}
    var postAdj = {};        // 반영일별 입금 {date: amount}
    var catCode = { '과일': 'F', '채소': 'V' };
    auctionDays.forEach(function (d) {
      if (d < from) return;
      var closed = p.closedFrom && d >= p.closedFrom;
      var m = +d.substring(5, 7) - 1;
      // 1) 구매
      if (!closed) {
        p.cats.forEach(function (c) {
          if (rng() > p.buyProb) return;
          var season = VD_SEASON[p.season || c][m];
          var growth = 1 + 0.04 * (daysBetween_(start, d) / 365);
          var amt = Math.round(p.base[c] * season * growth * (0.6 + 0.8 * rng()) / 1000) * 1000;
          if (amt <= 0) return;
          var credit = Math.round(amt * p.creditRatio / 1000) * 1000, cash = amt - credit;
          var ymd = d.replace(/-/g, '');
          if (credit > 0) {
            var no = 'S' + ymd + p.id + catCode[c] + 'C';
            sales.push({ source_txn_no: no, line_no: '1', txn_date: d, wholesaler_id: p.id, category: c, amount: credit,
              txn_type: '외상', correction_type: '정상', orig_txn_no: '' });
            queue.push({ date: d, amt: credit, txn: no });
            balance += credit;   // 외상은 전기일에 잔액 증가
            if (rng() < p.returnRate) {
              var rd = d, k = 1 + Math.floor(rng() * 4);
              for (var j = 0; j < k; j++) rd = addDays_(rd, 1);
              var ramt = -Math.round(credit * (0.05 + 0.25 * rng()) / 1000) * 1000;
              if (ramt < 0 && rd <= end) (pendingRet[rd] = pendingRet[rd] || []).push({ source_txn_no: 'R' + rd.replace(/-/g, '') + p.id + catCode[c] + ymd.substring(4),
                line_no: '1', txn_date: rd, wholesaler_id: p.id, category: c, amount: ramt, txn_type: '외상',
                correction_type: rng() < 0.7 ? '반품' : '취소', orig_txn_no: no, _orig: no });
            }
          }
          if (cash > 0) {
            sales.push({ source_txn_no: 'S' + ymd + p.id + catCode[c] + 'H', line_no: '1', txn_date: d, wholesaler_id: p.id,
              category: c, amount: cash, txn_type: '현금', correction_type: '정상', orig_txn_no: '' });
          }
        });
      }
      // 2) 이 날 처리되는 반품 (전기일 기준 잔액 감소)
      Object.keys(pendingRet).forEach(function (rd) {
        if (rd > d) return;
        pendingRet[rd].forEach(function (r) {
          var row = Object.assign({}, r); delete row._orig;
          row.txn_date = d < rd ? rd : d;
          row.source_txn_no = 'R' + row.txn_date.replace(/-/g, '') + r.source_txn_no.substring(9);
          sales.push(row);
          balance += row.amount;
          var left = -row.amount;
          var target = queue.filter(function (q) { return q.txn === r._orig; })[0];
          var order = target ? [target].concat(queue) : queue;
          for (var i = 0; i < order.length && left > 0; i++) {
            var cut = Math.min(order[i].amt, left); order[i].amt -= cut; left -= cut;
          }
          queue = queue.filter(function (q) { return q.amt > 0; });
        });
        delete pendingRet[rd];
      });
      // 3) 결제: 지연 기간이 지난 외상을 묶어서 입금
      var slow = p.slowFrom && d >= p.slowFrom;
      var lag = slow ? p.slowLag : p.payLag;
      if (rng() < p.payProb || closed) {
        var due = queue.filter(function (q) { return daysBetween_(q.date, d) >= (closed ? 0 : lag); });
        var dueAmt = due.reduce(function (s, q) { return s + q.amt; }, 0);
        if (slow) dueAmt = Math.round(dueAmt * p.slowPart / 1000) * 1000;
        if (dueAmt > 0) {
          var left2 = dueAmt;
          for (var i = 0; i < queue.length && left2 > 0; i++) {
            var cut = Math.min(queue[i].amt, left2); queue[i].amt -= cut; left2 -= cut;
          }
          queue = queue.filter(function (q) { return q.amt > 0; });
          var posted = rng() < 0.06 ? addDays_(d, 1) : d;   // 입금 반영 지연(가상)
          if (posted > end) posted = d;
          receipts.push({ source_receipt_no: 'P' + d.replace(/-/g, '') + p.id, receipt_date: d, posted_date: posted,
            wholesaler_id: p.id, amount: dueAmt, receipt_type: rng() < 0.8 ? '계좌이체' : '현금' });
          postAdj[posted] = (postAdj[posted] || 0) + dueAmt;
        }
      }
      // 4) 반영일이 오늘인 입금을 잔액에 반영 (휴장일 반영분은 다음 경매일 잔액에 포함)
      Object.keys(postAdj).forEach(function (pd) {
        if (pd <= d) { balance -= postAdj[pd]; delete postAdj[pd]; }
      });
      // 5) 경매일 잔액 (연체 = 약정 30일(가상) 초과 미결제)
      var overdue = 0, maxDays = 0;
      queue.forEach(function (q) {
        var age = daysBetween_(q.date, d) - 30;
        if (age > 0) { overdue += q.amt; maxDays = Math.max(maxDays, age); }
      });
      arRows.push({ base_date: d, wholesaler_id: p.id, balance: balance, overdue_amount: overdue, max_overdue_days: maxDays });
    });
  });

  // 반영일이 휴장일인 입금: 잔액 연속성 검사(달력일 누적)와 맞도록 반영일을 다음 경매일로 조정
  var isAuction = {};
  auctionDays.forEach(function (d) { isAuction[d] = true; });
  receipts.forEach(function (r) { while (!isAuction[r.posted_date] && r.posted_date <= end) r.posted_date = addDays_(r.posted_date, 1); });

  var master = vdMaster_(profiles, opt);
  master.M_CALENDAR = calendar;
  var files = vdFiles_(sales, receipts, arRows, start, end);
  return {
    master: master, files: files,
    summary: { wholesalers: profiles.length, sales: sales.length, receipts: receipts.length, arRows: arRows.length,
      files: files.length, period: start + ' ~ ' + end }
  };
}

function vdFiles_(sales, receipts, arRows, start, end) {
  var files = [];
  function emit(prefix, cols, rows, dateField, amtField) {
    var byYm = {};
    rows.forEach(function (r) { (byYm[ymOf_(r[dateField])] = byYm[ymOf_(r[dateField])] || []).push(r); });
    Object.keys(byYm).sort().forEach(function (ym) {
      var list = byYm[ym], sum = 0;
      var lines = [cols.join(',')];
      list.forEach(function (r) { lines.push(toCsvLine_(cols.map(function (c) { return r[c]; }))); sum += Number(r[amtField]); });
      lines.push('#CONTROL,' + list.length + ',' + sum);
      files.push({ name: prefix + ym.replace('-', '') + '.csv', content: lines.join('\n') + '\n' });
    });
  }
  emit('SALES_', SOURCE_SPEC.SALES.cols, sales, 'txn_date', 'amount');
  emit('RECEIPT_', SOURCE_SPEC.RECEIPT.cols, receipts, 'posted_date', 'amount');
  emit('AR_BAL_', SOURCE_SPEC.AR_BAL.cols, arRows, 'base_date', 'balance');
  return files;
}

function vdMaster_(profiles, opt) {
  var by = 'virtual-data', now = '2026-01-01 00:00:00';
  var aud = { created_at: now, created_by: by, updated_at: now, updated_by: by, row_version: 1, is_deleted: false };
  var ver = function (from, to, reason) {
    return { valid_from: from, valid_to: to || APP.OPEN_END, approval_status: '승인', change_reason: reason || '가상 초기자료',
      requested_by: by, requested_at: now, approved_by: by + '-approver', approved_at: now, reject_reason: '' };
  };
  var users = [
    { user_id: 'auctioneer1@example.invalid', name: '(가상)경매사1', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'auctioneer2@example.invalid', name: '(가상)경매사2', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'auctioneer3@example.invalid', name: '(가상)경매사3', role: 'AUCTIONEER', status: '사용' },
    { user_id: 'credit1@example.invalid', name: '(가상)채권담당1', role: 'CREDIT', status: '사용' },
    { user_id: 'viewer1@example.invalid', name: '(가상)조회자1', role: 'VIEWER', status: '사용' },
    { user_id: 'admin2@example.invalid', name: '(가상)관리자2', role: 'ADMIN', status: '사용' }
  ].map(function (u) { return Object.assign(u, aud); });

  var M = { M_USER: users, M_WHOLESALER: [], M_WS_STATUS_HIST: [], M_ASSIGNMENT: [], M_CONTACT: [],
    M_COLLATERAL: [], M_GUARANTEE: [], M_LIMIT: [], P_GUARANTOR: [] };
  profiles.forEach(function (p, i) {
    var closed = !!p.closedFrom;
    M.M_WHOLESALER.push(Object.assign({ wholesaler_id: p.id, name: p.name, representative: '(가상)대표' + (i + 1),
      biz_status: closed ? '휴업' : '정상', trade_start_date: p.tradeStart, categories: p.cats.join(','),
      settle_group: 'A', note: '가상 데이터' }, aud));
    M.M_WS_STATUS_HIST.push({ status_hist_id: 'ST-' + p.id + '-1', wholesaler_id: p.id, status: '정상', valid_from: p.tradeStart,
      valid_to: closed ? addDays_(p.closedFrom, -1) : APP.OPEN_END, change_reason: '가상 초기자료', created_at: now, created_by: by });
    if (closed) M.M_WS_STATUS_HIST.push({ status_hist_id: 'ST-' + p.id + '-2', wholesaler_id: p.id, status: '휴업',
      valid_from: p.closedFrom, valid_to: APP.OPEN_END, change_reason: '(가상) 휴업 신고', created_at: now, created_by: by });
    M.M_ASSIGNMENT.push(Object.assign({ assign_id: 'AS-' + p.id, wholesaler_id: p.id, user_id: 'auctioneer' + p.auctioneer + '@example.invalid',
      valid_from: '2024-01-01', valid_to: APP.OPEN_END, change_reason: '가상 초기자료' }, aud));
    M.M_CONTACT.push(Object.assign({ contact_id: 'CT-' + p.id, wholesaler_id: p.id, contact_type: '사무실 전화(가상)',
      value: '000-0000-' + (1000 + i) }, aud));

    var monthly = Object.keys(p.base).reduce(function (s, c) { return s + p.base[c]; }, 0) * 26;
    var setAmt = Math.round(monthly * 1.2 / 1000000) * 1000000;
    // 담보 1: 부동산 근저당 (설정금액 ≠ 회수 가능액: 평가·내부 인정금액 별도)
    M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-01', version_no: 1, wholesaler_id: p.id,
      collateral_type: '부동산(근저당)', set_amount: setAmt, appraised_amount: Math.round(setAmt * 1.1), appraisal_date: '2023-12-10',
      recognized_amount: Math.round(setAmt * 0.7), confirmed_date: '2023-12-10', review_status: '검토완료', expiry_date: '', evidence_ids: '' },
      ver('2024-01-01', p.id === 'W0123' ? '2026-05-31' : null)));
    if (p.id === 'W0123') {
      M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-01', version_no: 2, wholesaler_id: p.id,
        collateral_type: '부동산(근저당)', set_amount: setAmt, appraised_amount: Math.round(setAmt * 0.85), appraisal_date: '2026-05-20',
        recognized_amount: Math.round(setAmt * 0.5), confirmed_date: '2026-05-25', review_status: '검토완료', expiry_date: '', evidence_ids: '' },
        ver('2026-06-01', null, '(가상) 재평가 결과 반영')));
    }
    // 담보 2: 일부는 보증보험(만기 있음) — 기한 도래 확인용
    if (i % 3 === 0) {
      var exp = addDays_(opt.endDate, 20 + (i * 7) % 90);
      M.M_COLLATERAL.push(Object.assign({ collateral_id: 'C' + p.id + '-02', version_no: 1, wholesaler_id: p.id,
        collateral_type: '보증보험증권', set_amount: 30000000, appraised_amount: 30000000, appraisal_date: '2025-11-01',
        recognized_amount: 30000000, confirmed_date: '2025-11-01', review_status: '검토완료', expiry_date: exp, evidence_ids: '' },
        ver('2025-11-01')));
    }
    // 연대보증
    var hasG = i % 2 === 0;
    var gref = hasG ? 'GR-' + p.id : '';
    M.M_GUARANTEE.push(Object.assign({ guarantee_id: 'G' + p.id + '-01', version_no: 1, wholesaler_id: p.id,
      has_guarantee: hasG ? '있음' : '없음', guarantor_ref: gref, scope: hasG ? '포괄 근보증(가상)' : '',
      guarantee_limit: hasG ? setAmt : '', period_from: hasG ? '2024-01-01' : '', period_to: hasG ? (i % 4 === 0 ? addDays_(opt.endDate, 45) : '2027-12-31') : '',
      confirmed_date: '2024-01-01', doc_ids: '' }, ver('2024-01-01')));
    if (hasG) M.P_GUARANTOR.push(Object.assign({ guarantor_ref: gref, name: '(가상)보증인' + (i + 1), relation: '(가상)가족', note: '' }, aud));
    // 한도: 유형별 별도 행. 합산하지 않음
    var basic = Math.round(monthly * 1.5 / 1000000) * 1000000;
    M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-B', version_no: 1, wholesaler_id: p.id, limit_type: '기본한도',
      amount: basic, approval_basis: '(가상) 연간 한도 심사', approver: '(가상)승인권자' }, ver('2024-01-01', p.id === 'W0123' ? '2026-02-28' : null)));
    if (p.id === 'W0123') {
      M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-B', version_no: 2, wholesaler_id: p.id, limit_type: '기본한도',
        amount: Math.round(basic * 0.8 / 1000000) * 1000000, approval_basis: '(가상) 담보 재평가 예정에 따른 감액', approver: '(가상)승인권자' },
        ver('2026-03-01', null, '(가상) 한도 감액')));
    }
    if (i % 4 === 1) M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-M', version_no: 1, wholesaler_id: p.id, limit_type: '마감한도',
      amount: Math.round(basic * 0.3 / 1000000) * 1000000, approval_basis: '(가상) 마감 정산용', approver: '(가상)승인권자' }, ver('2024-01-01')));
    if (i % 6 === 2) M.M_LIMIT.push(Object.assign({ limit_id: 'L' + p.id + '-A', version_no: 1, wholesaler_id: p.id, limit_type: '추가한도',
      amount: 20000000, approval_basis: '(가상) 성수기 추가', approver: '(가상)승인권자' }, ver('2026-09-01', '2026-10-31')));
  });
  return M;
}

/* ══════════════ TestData.gs ══════════════ */
/**
 * TestData.gs — 가상 데이터 적재와 1단계 점검 (편집기에서 소유 계정으로 실행)
 * 가상 데이터는 기초자료가 비어 있는 저장소에만 넣는다(실제 자료 보호).
 */

/** [편집기 실행] 최근 24개월 + 당월(어제까지) 가상 데이터를 기초자료에 넣고, 원천 CSV를 가져오기 대기 폴더에 만든다. */
function loadVirtualData() {
  requireOwner_();
  var end = addDays_(todayStr_(), -1);
  var start = addMonths_(ymOf_(end), -24) + '-01';
  return loadVirtualData_({ startDate: start, endDate: end, seed: 20261027 });
}

function loadVirtualData_(opt) {
  return withLock_(function () {
    if (readTable_('DB_MASTER', 'M_WHOLESALER').length) {
      throw new Error('기초자료가 이미 있습니다. 가상 데이터는 빈 저장소에만 넣을 수 있습니다.');
    }
    var g = genVirtualData_(opt);
    var existingUsers = {};
    readTable_('DB_MASTER', 'M_USER').forEach(function (u) { existingUsers[u.user_id] = true; });
    Object.keys(g.master).forEach(function (t) {
      var db = t === 'P_GUARANTOR' ? 'DB_PII' : 'DB_MASTER';
      var rows = t === 'M_USER' ? g.master[t].filter(function (u) { return !existingUsers[u.user_id]; }) : g.master[t];
      appendObjects_(db, t, rows);
    });
    var inbox = folder_('INBOX');
    g.files.forEach(function (f) { inbox.createFile(f.name, f.content, MimeType.CSV); });
    loadVirtualDocs_(ownerAsUser_());
    // 가상 정답 표본: W0123 은 2026-09-20 (가상) 결제 지연 사안, W0105 는 신호 없이 발생한 (가상) 사안(포착 실패 예시)
    var a = newAuditFields_(ownerAsUser_());
    appendObjects_('DB_MASTER', 'M_BACKTEST_TRUTH', [
      Object.assign({ truth_id: 'BT-V1', wholesaler_id: 'W0123', event_date: '2026-09-20', event_type: '(가상) 결제 지연·채권 조치', note: '가상' }, a),
      Object.assign({ truth_id: 'BT-V2', wholesaler_id: 'W0105', event_date: '2026-03-10', event_type: '(가상) 거래 분쟁', note: '가상' }, a)
    ]);
    audit_(ownerAsUser_(), 'LOAD_VIRTUAL_DATA', 'DB_MASTER', '*', 'virtual', null, g.summary, '가상 데이터 적재');
    Logger.log(JSON.stringify(g.summary));
    return g.summary;
  });
}

/** 테스트 전용: 지정한 이메일 사용자로 함수 실행 (같은 실행 안에서만 유효) */
function withUser_(email, fn) {
  var prev = _testUserOverride;
  _testUserOverride = email;
  try { return fn(); } finally { _testUserOverride = prev; }
}

/**
 * [편집기 실행] 1단계 점검 — 운영 자료를 훼손하지 않는 점검만 수행한다.
 * 시나리오 4(재가져오기 중복 없음), 7(권한), 8(과거 시점 근거 보존), 9(대사), 3(데이터 상태 표시)
 */
function runPhase1Checks() {
  requireOwner_();
  var R = [];
  function check(id, name, ok, detail) { R.push({ scenario: id, check: name, result: ok ? '통과' : '실패', detail: detail || '' }); }

  // 9. 대사
  var st = readStatus_();
  var recon = readTable_('DB_AGG', 'A_RECON').filter(function (r) { return r.calc_run_id === st.last_calc_run_id; });
  var bad = recon.filter(function (r) { return r.result !== '일치'; });
  check(9, '원천↔집계 대사 전 항목 일치', recon.length > 0 && bad.length === 0, recon.length + '항목, 불일치 ' + bad.length);

  // 3. 데이터 상태가 불완전하면 정상으로 표시되지 않음
  var issuesLatest = readTable_('DB_AGG', 'A_DQ').filter(function (d) { return d.date === st.latest_base_date && d.status !== '경고'; }).length;
  check(3, '데이터 이상이 있으면 전체 상태가 정상이 아님', !(issuesLatest > 0 && st.data_status === '정상'),
    '최신 기준일 이상 ' + issuesLatest + '건, 상태 ' + st.data_status);

  // 7. 권한: 사용자를 바꿔 같은 서버 함수를 직접 호출
  var users = readTable_('DB_MASTER', 'M_USER');
  var viewer = users.filter(function (u) { return u.role === 'VIEWER' && u.status === '사용'; })[0];
  var auc = users.filter(function (u) { return u.role === 'AUCTIONEER' && u.status === '사용'; })[0];
  if (viewer) {
    withUser_(viewer.user_id, function () {
      check(7, '조회자 → 보증인 개인정보 요청 거부', api_getGuarantors('W0123').ok === false);
      check(7, '조회자 → 정기 처리 실행 거부', api_runPipelineNow().ok === false);
      check(7, '조회자 → 기초자료 변경 거부', api_submitVersion('M_LIMIT', { wholesaler_id: 'W0123', limit_type: '기본한도', amount: 1, valid_from: '2026-01-01', approval_basis: 'x' }, '테스트').ok === false);
      var v = api_get360('W0123');
      check(7, '조회자 360 응답에 연락처·보증인 참조 없음', v.ok && !v.data.contacts && (v.data.guarantees || []).every(function (g) { return g.guarantor_ref === undefined; }));
    });
  }
  if (auc) {
    var asg = readTable_('DB_MASTER', 'M_ASSIGNMENT');
    var other = readTable_('DB_MASTER', 'M_WHOLESALER').filter(function (w) {
      return !canAccessWs_({ user_id: auc.user_id, role: 'AUCTIONEER' }, w.wholesaler_id, asg, todayStr_());
    })[0];
    if (other) withUser_(auc.user_id, function () {
      check(7, '경매사 → 담당 외 중도매인(' + other.wholesaler_id + ') 조회 거부', api_get360(other.wholesaler_id).ok === false);
    });
  }
  withUser_('nobody@example.invalid', function () {
    check(7, '미등록 사용자 거부', api_bootstrap().ok === false);
  });
  withUser_('', function () {
    check(7, '식별 불가(이메일 빈 값) 사용자 거부', api_bootstrap().ok === false);
  });

  // 8. 과거 시점 조회: W0123 기본한도는 2026-03-01 감액 → 2026-02-15 기준과 현재가 달라야 함
  var lim = readTable_('DB_MASTER', 'M_LIMIT');
  var past = asOfVersions_(lim, 'limit_id', 'W0123', '2026-02-15').filter(function (l) { return l.limit_type === '기본한도'; })[0];
  var now = asOfVersions_(lim, 'limit_id', 'W0123', todayStr_()).filter(function (l) { return l.limit_type === '기본한도'; })[0];
  if (past && now) check(8, '한도 변경 후에도 과거 시점 한도 재현', past.version_no !== now.version_no,
    '2026-02-15: v' + past.version_no + ' ' + past.amount + ' / 현재: v' + now.version_no + ' ' + now.amount);

  // 4. 같은 파일 재가져오기: 완료 폴더의 파일 하나를 대기 폴더로 복사 → 처리 → 행 수 불변
  var done = folder_('DONE').getFiles(), sample = null;
  while (done.hasNext()) { var f = done.next(); if (detectSource_(f.getName()) === 'SALES') { sample = f; break; } }
  if (sample) {
    var before = readTable_('DB_RAW', 'R_SALES').length;
    sample.makeCopy(sample.getName(), folder_('INBOX'));
    _tableMemo = {};
    runPipeline_('점검');
    _tableMemo = {};
    var after = readTable_('DB_RAW', 'R_SALES').length;
    var lastBatch = readTable_('DB_RAW', 'R_BATCH').slice(-1)[0];
    check(4, '같은 파일 재가져오기 시 거래 행 수 불변', before === after, before + ' → ' + after);
    check(4, '재가져오기 배치는 중복파일로 기록', lastBatch && lastBatch.status === '중복파일', lastBatch ? lastBatch.status : '');
  }

  Logger.log(R.map(function (r) { return '[' + r.result + '] 시나리오' + r.scenario + ' ' + r.check + (r.detail ? ' — ' + r.detail : ''); }).join('\n'));
  return R;
}

/**
 * 가상 매뉴얼·서식·상황 코드·절차 (모두 가상. 실제 규정이 아니다)
 * - SIT-OVD-30 (연체 30일 이상)        : 가상 매뉴얼 v1 에 절차 3단계 + 서식 2종 연결
 * - SIT-TURN-DROP (회전율 저하 확인)    : 절차 미등록 → '확인 필요' 표시 검증용(시나리오 6)
 * - SIT-CONFLICT (복수 징후)            : 서로 다른 두 문서에 절차 → '충돌' 표시 검증용
 */
function loadVirtualDocs_(user) {
  var forms = folder_('FORMS');
  var mk = function (name, text) { return forms.createFile(name, text, 'text/plain').getId(); };
  var manualId = mk('(가상)채권관리업무매뉴얼_v1.txt', '(가상) 채권관리 업무매뉴얼 v1 — 테스트용 본문. 실제 규정이 아님.');
  var manual2Id = mk('(가상)여신관리지침_v2.txt', '(가상) 여신관리지침 v2 — 테스트용 본문. 실제 규정이 아님.');
  var form1 = mk('(가상)결제계획확인서.txt', '[가상 서식] 결제계획 확인서\n관리건: {{관리건ID}}\n중도매인: {{중도매인코드}} {{상호}} (대표 {{대표자}})\n기준일: {{기준일}}\n미수금: {{미수금}}원 / 연체금액: {{연체금액}}원 ({{연체일수}}일)\n담당 경매사: {{담당경매사}}\n작성일: {{작성일}}  작성자: {{작성자}}\n결제계획: \n');
  var form2 = mk('(가상)담보보강요청서.txt', '[가상 서식] 담보 보강 요청서\n관리건: {{관리건ID}} / {{상호}}\n기준일 {{기준일}} 미수금 {{미수금}}원\n요청 내용: \n');
  var now = nowStr_(), a = newAuditFields_(user);
  var docs = [
    { doc_id: 'DOC-MANUAL-CREDIT', doc_name: '(가상)채권관리 업무매뉴얼', doc_type: '매뉴얼', owner_dept: '(가상)채권팀' },
    { doc_id: 'DOC-GUIDE-LOAN', doc_name: '(가상)여신관리지침', doc_type: '매뉴얼', owner_dept: '(가상)심사팀' },
    { doc_id: 'FORM-PAYPLAN', doc_name: '(가상)결제계획확인서', doc_type: '서식', owner_dept: '(가상)채권팀' },
    { doc_id: 'FORM-COLLATERAL', doc_name: '(가상)담보보강요청서', doc_type: '서식', owner_dept: '(가상)채권팀' }
  ].map(function (d) { return Object.assign({ note: '가상' }, d, a); });
  appendObjects_('DB_MASTER', 'M_DOC', docs);
  var hash = function (id) { return sha256Hex_(DriveApp.getFileById(id).getBlob().getBytes()); };
  appendObjects_('DB_MASTER', 'M_DOC_VER', [
    { doc_id: 'DOC-MANUAL-CREDIT', version: 'v1', effective_from: '2025-01-01', effective_to: APP.OPEN_END, file_id: manualId, file_hash: hash(manualId), note: '가상' },
    { doc_id: 'DOC-GUIDE-LOAN', version: 'v2', effective_from: '2026-01-01', effective_to: APP.OPEN_END, file_id: manual2Id, file_hash: hash(manual2Id), note: '가상' },
    { doc_id: 'FORM-PAYPLAN', version: 'v3', effective_from: '2025-06-01', effective_to: APP.OPEN_END, file_id: form1, file_hash: hash(form1), note: '가상' },
    { doc_id: 'FORM-COLLATERAL', version: 'v1', effective_from: '2025-01-01', effective_to: APP.OPEN_END, file_id: form2, file_hash: hash(form2), note: '가상' }
  ].map(function (d) { return Object.assign(d, a); }));
  appendObjects_('DB_MASTER', 'M_SITUATION', [
    { situation_code: 'SIT-OVD-30', label: '연체 30일 이상', condition_json: JSON.stringify({ signals: ['S03'], min_overdue_days: 30 }), note: '가상' },
    { situation_code: 'SIT-OVD-NEW', label: '연체 발생(채권 검토 필요)', condition_json: JSON.stringify({ signals: ['S03'], result_class: '채권 검토 필요' }), note: '가상' },
    { situation_code: 'SIT-TURN-DROP', label: '회전율 저하 확인', condition_json: JSON.stringify({ signals: ['S01'] }), note: '가상 — 절차 미등록(확인 필요 검증용)' },
    { situation_code: 'SIT-MULTI', label: '복수 징후', condition_json: JSON.stringify({ signals: ['S07'] }), note: '가상 — 두 문서 충돌 검증용' }
  ].map(function (d) { return Object.assign(d, a); }));
  var steps = [
    { proc_step_id: 'PS-OVD-1', situation_code: 'SIT-OVD-NEW', step_no: 1, content: '(가상) 중도매인에게 결제계획 확인서를 받는다', checks: '결제 예정일·금액·방법', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제12조 제1항', page: '34' },
    { proc_step_id: 'PS-OVD-2', situation_code: 'SIT-OVD-NEW', step_no: 2, content: '(가상) 담보 평가 최신성을 확인하고 필요 시 담보 보강을 요청한다', checks: '최종 평가일 1년 초과 여부', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제15조', page: '41' },
    { proc_step_id: 'PS-OVD-3', situation_code: 'SIT-OVD-NEW', step_no: 3, content: '(가상) 연체 30일 경과 시 팀장 보고 후 거래 조건 변경을 검토한다', checks: '승인권자 결재', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제16조', page: '43' },
    { proc_step_id: 'PS-MULTI-A', situation_code: 'SIT-MULTI', step_no: 1, content: '(가상·문서A) 복수 징후 시 즉시 한도 재심사', checks: '', doc_id: 'DOC-MANUAL-CREDIT', doc_version: 'v1', article: '제20조', page: '50' },
    { proc_step_id: 'PS-MULTI-B', situation_code: 'SIT-MULTI', step_no: 1, content: '(가상·문서B) 복수 징후 시 30일 관찰 후 재심사', checks: '', doc_id: 'DOC-GUIDE-LOAN', doc_version: 'v2', article: '제7조', page: '12' }
  ].map(function (d) { return Object.assign(d, a); });
  appendObjects_('DB_MASTER', 'M_PROCEDURE', steps);
  appendObjects_('DB_MASTER', 'M_PROC_FORM', [
    { proc_step_id: 'PS-OVD-1', form_doc_id: 'FORM-PAYPLAN', required: true },
    { proc_step_id: 'PS-OVD-2', form_doc_id: 'FORM-COLLATERAL', required: false }
  ].map(function (d) { return Object.assign(d, a); }));
  void now;
}

/** [편집기 실행] 최근 12개월 백테스트를 현재 기준값으로 실행(완료까지 이어서) */
function runBacktest() {
  requireOwner_();
  var owner = ownerAsUser_();
  if (!prop_(BT_STATE_KEY)) startBacktest_(owner, {});
  var r;
  do { r = continueBacktest_(APP.JOB_TIME_BUDGET_MS, '수동'); } while (r.status === '진행');
  Logger.log(JSON.stringify(r));
  return r;
}

/* ══════════════ Main.gs ══════════════ */
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
  if (!Object.prototype.hasOwnProperty.call(BUNDLED_HTML_, name)) throw new Error('내장 화면 없음: ' + name);
  return BUNDLED_HTML_[name];
}

/* ══════════════ NhImport.gs ══════════════ */
/**
 * NhImport.gs — 농협 전산 추출 파일(엑셀) 어댑터
 *
 * 지원 형식(헤더 행으로 자동 판별, 파일명 무관)
 *  NH_SALES_DAILY   EBFW916007 일별: 번호,조직구분,사업장,사업장명,기표일자,농협대분류,농협대분류명,...,중도매인,중도매인명,거래인허가번호,중량,금액(A)
 *  NH_SALES_MONTHLY EBFW916007 월별: 번호,조직구분,사업장,사업장명,기표년월,중도매인,중도매인명,중량,금액(A)
 *  NH_COLLATERAL    담보현황(중도매인): 연번,허가번호,성명,품목,갱신년도,약정구분,마감한도,외상한도금액,최고한도금액,배수,추가한도,합계,거래보증금,부동산,보증보험,예금담보,보험(공제),...
 *  NH_MART          EBFW916004 계통마트 거래실적: 참고자료로만 기록(적재하지 않음)
 *
 * 이 파일들에는 입금·미수잔액·연체 자료가 없다. 따라서 회전율·연체·한도 사용률은 별도 미수 자료(AR_BAL_/RECEIPT_)가 들어오기 전까지 산출불가로 남는다.
 * 담보현황의 NICE 신용점수 열은 개인신용정보이므로 적재하지 않는다.
 */

var NH_HEADERS = {
  NH_SALES_DAILY: ['번호', '조직구분', '사업장', '사업장명', '기표일자', '농협대분류', '농협대분류명'],
  NH_SALES_MONTHLY: ['번호', '조직구분', '사업장', '사업장명', '기표년월', '중도매인', '중도매인명'],
  NH_COLLATERAL: ['허가 번호', '성명', '품목', '갱신 년도'],
  NH_MART: ['번호', '유통거래처지역본부', '유통거래처지역본부명']
};

function nhNorm_(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); }
function nhKey_(v) { return nhNorm_(v).replace(/\s/g, ''); }
function nhNum_(v) {
  if (typeof v === 'number') return v;
  var s = nhNorm_(v).replace(/[,\s원]/g, '');
  if (s === '' || s === '-') return 0;
  var n = Number(s);
  return isFinite(n) ? n : 0;
}
/** 2027-07-29 / 8/5/2022 / 2027.07.29 / Date 객체 → yyyy-MM-dd. 못 읽으면 '' */
function nhDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  var s = nhNorm_(v);
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (m) return '20' + m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return '';
}

/** 2차원 배열에서 헤더 행을 찾아 형식과 열 위치를 돌려준다 */
function detectNhFormat_(rows) {
  for (var i = 0; i < Math.min(rows.length, 60); i++) {
    var cells = rows[i].map(nhKey_);
    for (var fmt in NH_HEADERS) {
      var need = NH_HEADERS[fmt].map(nhKey_);
      if (need.every(function (h) { return cells.indexOf(h) >= 0; })) {
        var col = {};
        rows[i].forEach(function (c, j) { var k = nhKey_(c); if (k && col[k] === undefined) col[k] = j; });
        return { format: fmt, headerRow: i, col: col };
      }
    }
  }
  return null;
}

/** 파일 → 2차원 배열. 엑셀은 Drive API 로 Google 시트로 변환해 읽고 임시 파일은 휴지통으로 */
function fileToRows_(file) {
  var mime = String(file.getMimeType ? file.getMimeType() : '');
  var name = file.getName();
  if (/spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/i.test(name)) {
    if (typeof Drive === 'undefined' || !Drive.Files) throw new Error('엑셀 변환에는 고급 Drive 서비스가 필요합니다(appsscript.json dependencies 확인). CSV 로 저장해 올려도 됩니다.');
    var created = Drive.Files.create({ name: '(임시변환) ' + name, mimeType: 'application/vnd.google-apps.spreadsheet' }, file.getBlob());
    try {
      var ss = SpreadsheetApp.openById(created.id);
      var sh = ss.getSheets()[0];
      return sh.getDataRange().getValues();
    } finally {
      try { DriveApp.getFileById(created.id).setTrashed(true); } catch (e) { /* 정리 실패는 무시 */ }
    }
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    return SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  }
  return parseCsv_(file.getBlob().getDataAsString('UTF-8'));
}

/* ───────────── 판매 실적 ───────────── */

/**
 * 일별 낙찰 실적 → R_SALES 행. 거래번호가 없으므로 (기표일자, 중도매인, 분류, 매매·원표·수입·파렛 구분) 조합을 키로 쓴다.
 * 같은 키가 파일 안에 여러 번 나오면 합산한다(원천이 같은 조합을 분리 표기하는 경우).
 */
function parseNhSalesDaily_(rows, det, ctx) {
  var c = det.col, out = {}, rejects = [], names = {};
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!nhNorm_(r[c['번호']]) && !nhNorm_(r[c['기표일자']])) continue;
    var date = nhDate_(r[c['기표일자']]), ws = nhNorm_(r[c['중도매인']]), amt = nhNum_(r[c['금액(A)']]);
    if (!date) { rejects.push({ line: i + 1, code: 'BAD_DATE', msg: '기표일자 오류: ' + nhNorm_(r[c['기표일자']]), raw: r.slice(0, 20).join(',') }); continue; }
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '중도매인 코드 없음', raw: r.slice(0, 20).join(',') }); continue; }
    var big = nhNorm_(r[c['농협대분류명']]);
    var cat = NH_CATEGORY_MAP[big] || '기타';
    if (amt === 0) continue;   // 0원 행(수량 0)은 거래가 아니므로 건너뜀
    names[ws] = nhNorm_(r[c['중도매인명']]);
    var parts = ['기표일자', '중도매인', '농협대분류', '농협중분류', '농협소분류', '공판매매구분', '공판원표구분', '수입여부', '파렛출하여부']
      .map(function (k) { return c[k] === undefined ? '' : nhNorm_(r[c[k]]); });
    var key = 'NH' + date.replace(/-/g, '') + '|' + ws + '|' + fnv1a_(parts.join('|'));
    if (!out[key]) out[key] = { source_txn_no: key, line_no: '1', txn_date: date, wholesaler_id: ws, category: cat, amount: 0,
      txn_type: '미구분', correction_type: '정상', orig_txn_no: '', _name: names[ws], _big: big };
    out[key].amount += amt;
  }
  var list = Object.keys(out).map(function (k) { return out[k]; });
  // 음수 합계(반품만 있는 조합)는 반품 행으로 표시
  list.forEach(function (x) { if (x.amount < 0) { x.correction_type = '반품'; x.orig_txn_no = x.source_txn_no + '-ORIG'; } });
  return { records: list, rejects: rejects, names: names, dateField: 'txn_date', amountField: 'amount' };
}

function parseNhSalesMonthly_(rows, det) {
  var c = det.col, out = {}, rejects = [], names = {};
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    var ym = nhNorm_(r[c['기표년월']]), ws = nhNorm_(r[c['중도매인']]);
    if (!ym && !ws) continue;
    var m = ym.match(/(\d{4})[.\-\/]?(\d{2})/);
    if (!m) { rejects.push({ line: i + 1, code: 'BAD_DATE', msg: '기표년월 오류: ' + ym, raw: r.slice(0, 10).join(',') }); continue; }
    ym = m[1] + '-' + m[2];
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '중도매인 코드 없음', raw: r.slice(0, 10).join(',') }); continue; }
    names[ws] = nhNorm_(r[c['중도매인명']]);
    var key = ws + '|' + ym;
    if (!out[key]) out[key] = { ym: ym, wholesaler_id: ws, amount: 0, weight: 0, _name: names[ws] };
    out[key].amount += nhNum_(r[c['금액(A)']]);
    out[key].weight += nhNum_(r[c['중량']]);
  }
  return { records: Object.keys(out).map(function (k) { return out[k]; }), rejects: rejects, names: names, dateField: 'ym', amountField: 'amount' };
}

/** 미등록 중도매인 자동 등록(설정 NH_AUTO_REGISTER_WS). 상호는 성명/중도매인명, 거래 시작일은 파일 내 최초 거래일 */
function autoRegisterWs_(names, firstDates, settings) {
  var created = [];
  if ((settings.NH_AUTO_REGISTER_WS || '예') !== '예') return created;
  invalidate_('DB_MASTER', 'M_WHOLESALER');
  var have = {};
  readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { have[w.wholesaler_id] = true; });
  var sys = ownerAsUser_(), rows = [], hist = [];
  Object.keys(names).forEach(function (ws) {
    if (have[ws]) return;
    var start = firstDates[ws] || todayStr_();
    var row = { wholesaler_id: ws, name: names[ws] || ws, representative: '', biz_status: '정상', trade_start_date: start,
      categories: '', settle_group: '', note: '실적 파일에서 자동 등록 ' + todayStr_() + ' (거래 시작일은 파일 내 최초 거래일)' };
    Object.assign(row, newAuditFields_(sys)); rows.push(row); have[ws] = true;
    hist.push({ status_hist_id: uid_('ST'), wholesaler_id: ws, status: '정상', valid_from: start, valid_to: APP.OPEN_END, change_reason: '자동 등록', created_at: nowStr_(), created_by: sys.user_id });
    created.push(ws);
  });
  if (rows.length) {
    appendObjects_('DB_MASTER', 'M_WHOLESALER', rows);
    appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', hist);
    audit_(sys, 'AUTO_REGISTER', 'DB_MASTER', 'M_WHOLESALER', created.join(','), null, { count: created.length }, '실적 파일 자동 등록');
  }
  return created;
}

/* ───────────── 담보현황 ───────────── */

var NH_LIMIT_COLS = { '마감한도': '마감한도', '외상한도금액': '기본한도', '추가한도': '추가한도' };
var NH_COLLATERAL_COLS = { '거래보증금': '거래보증금', '부동산': '부동산', '보증보험': '보증보험증권', '예금담보': '예금(질권)', '보험(공제)': '보험(공제)' };

/**
 * 담보현황 한 행 → 기초자료 구조. 금액·일자·보증 여부만 쓰고 NICE 점수는 읽지 않는다.
 */
function parseNhCollateral_(rows, det, asOf) {
  var c = det.col, out = [], rejects = [];
  for (var i = det.headerRow + 1; i < rows.length; i++) {
    var r = rows[i];
    var ws = nhNorm_(r[c['허가번호']]), name = nhNorm_(r[c['성명']]);
    if (!ws && !name) continue;
    if (!ws) { rejects.push({ line: i + 1, code: 'REQUIRED', msg: '허가번호 없음: ' + name, raw: '' }); continue; }
    var limits = {}, cols = {};
    Object.keys(NH_LIMIT_COLS).forEach(function (k) { if (c[nhKey_(k)] !== undefined) limits[NH_LIMIT_COLS[k]] = nhNum_(r[c[nhKey_(k)]]); });
    Object.keys(NH_COLLATERAL_COLS).forEach(function (k) { if (c[nhKey_(k)] !== undefined) { var v = nhNum_(r[c[nhKey_(k)]]); if (v > 0) cols[NH_COLLATERAL_COLS[k]] = v; } });
    var g = nhNorm_(r[c['연대보증인유무']]), gName = nhNorm_(r[c['연대보증인']]);
    var gm = gName.match(/^(.*)\s*\(([^()]*)\)\s*$/);   // 마지막 괄호가 관계: "(가상)을 (자녀)" → 이름 "(가상)을", 관계 "자녀"
    var expiryText = nhNorm_(r[c[nhKey_('담보만기일(담보종류)')]]);
    var expiry = nhDate_(expiryText);
    out.push({
      wholesaler_id: ws, name: name, categories: nhNorm_(r[c['품목']]), trade_start_date: nhDate_(r[c['허가일']]),
      permit_expiry: nhDate_(r[c['허가만료일']]), contract_type: nhNorm_(r[c[nhKey_('약정구분(Safekey)')]]), renew_year: nhNorm_(r[c[nhKey_('갱신년도')]]),
      limits: limits, limit_note: '최고한도 ' + nhNum_(r[c['최고한도금액']]).toLocaleString() + ' / 배수 ' + nhNorm_(r[c['배수']]) + ' / 합계 ' + nhNum_(r[c['합계']]).toLocaleString(),
      collaterals: cols, collateral_change_date: nhDate_(r[c['담보변동일']]), collateral_expiry: expiry, collateral_expiry_text: expiryText,
      has_guarantee: g === '유' ? '있음' : (g === '무' ? '없음' : (gName ? '있음' : '')),
      guarantor_name: gm ? gm[1].trim() : gName, guarantor_relation: gm ? gm[2].trim() : '',
      collateral_desc: nhNorm_(r[c['담보물']]), note: nhNorm_(r[c['비고']]), updated: nhDate_(r[c['업데이트일']]) || asOf
    });
  }
  return { records: out, rejects: rejects };
}

/**
 * 담보현황을 기초자료에 반영한다. 값이 바뀐 항목만 새 승인 버전으로 만든다(재적재해도 중복 없음).
 * @return { wholesalers, limits, collaterals, guarantees, unchanged }
 */
function applyNhCollateral_(records, asOf, batchId) {
  var sys = ownerAsUser_(), stat = { wholesalers: 0, limits: 0, collaterals: 0, guarantees: 0, unchanged: 0 };
  invalidate_('DB_MASTER', 'M_WHOLESALER'); invalidate_('DB_MASTER', 'M_LIMIT'); invalidate_('DB_MASTER', 'M_COLLATERAL'); invalidate_('DB_MASTER', 'M_GUARANTEE'); invalidate_('DB_PII', 'P_GUARANTOR');
  var wsAll = readTable_('DB_MASTER', 'M_WHOLESALER');
  var reason = '담보현황 파일 적재(' + asOf + ', ' + batchId + ')';
  var ver = function (from) { return { valid_from: from, valid_to: APP.OPEN_END, approval_status: '승인', change_reason: reason, requested_by: 'import', requested_at: nowStr_(), approved_by: sys.user_id, approved_at: nowStr_(), reject_reason: '' }; };

  records.forEach(function (rec) {
    var ws = rec.wholesaler_id;
    var w = wsAll.filter(function (x) { return x.wholesaler_id === ws && !x.is_deleted; })[0];
    var note = ['약정 ' + rec.contract_type, '갱신 ' + rec.renew_year, '허가만료 ' + rec.permit_expiry, rec.collateral_desc, rec.note].filter(Boolean).join(' / ');
    if (!w) {
      w = { wholesaler_id: ws, name: rec.name || ws, representative: rec.name || '', biz_status: '정상', trade_start_date: rec.trade_start_date || asOf, categories: rec.categories, settle_group: '', note: note };
      Object.assign(w, newAuditFields_(sys)); appendObjects_('DB_MASTER', 'M_WHOLESALER', [w]); wsAll.push(w);
      appendObjects_('DB_MASTER', 'M_WS_STATUS_HIST', [{ status_hist_id: uid_('ST'), wholesaler_id: ws, status: '정상', valid_from: w.trade_start_date, valid_to: APP.OPEN_END, change_reason: '담보현황 적재', created_at: nowStr_(), created_by: sys.user_id }]);
      stat.wholesalers++;
    } else if (w.name !== rec.name || w.categories !== rec.categories || w.note !== note || (rec.trade_start_date && w.trade_start_date !== rec.trade_start_date && /자동 등록/.test(w.note || ''))) {
      var b = JSON.parse(JSON.stringify(w));
      w.name = rec.name || w.name; w.categories = rec.categories || w.categories; w.note = note;
      if (rec.trade_start_date && /자동 등록/.test(b.note || '')) w.trade_start_date = rec.trade_start_date;
      if (!w.representative) w.representative = rec.name || '';
      w.updated_at = nowStr_(); w.updated_by = sys.user_id; w.row_version = Number(w.row_version) + 1;
      writeObject_('DB_MASTER', 'M_WHOLESALER', w); audit_(sys, 'UPDATE', 'DB_MASTER', 'M_WHOLESALER', ws, b, w, reason); stat.wholesalers++;
    }

    // 한도: 유형별 ID 고정(L<ws>-B/M/A). 금액이 바뀐 경우만 새 버전
    Object.keys(rec.limits).forEach(function (type) {
      var id = 'L' + ws + '-' + ({ '기본한도': 'B', '마감한도': 'M', '추가한도': 'A' }[type]);
      var cur = asOfVersions_(readTable_('DB_MASTER', 'M_LIMIT'), 'limit_id', ws, asOf).filter(function (l) { return l.limit_id === id; })[0];
      if (cur && Number(cur.amount) === rec.limits[type]) { stat.unchanged++; return; }
      if (!cur && rec.limits[type] === 0) return;
      var all = readTable_('DB_MASTER', 'M_LIMIT').filter(function (l) { return l.limit_id === id; });
      var vno = all.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
      var row = Object.assign({ limit_id: id, version_no: vno, wholesaler_id: ws, limit_type: type, amount: rec.limits[type], approval_basis: '담보현황 파일 (' + rec.limit_note + ')', approver: '파일 적재' }, ver(asOf));
      closePreviousVersions_(all, 'limit_id', row).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_LIMIT', x.row); });
      appendObjects_('DB_MASTER', 'M_LIMIT', [row]); invalidate_('DB_MASTER', 'M_LIMIT'); stat.limits++;
    });

    // 담보: 종류별 ID 고정(C<ws>-<종류>). 설정금액 = 파일 금액, 평가·내부 인정금액은 비움(내부 기준 확인 전)
    var curCols = asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', ws, asOf);
    Object.keys(rec.collaterals).forEach(function (type) {
      var id = 'C' + ws + '-' + fnv1a_(type).substring(0, 4).toUpperCase();
      var cur = curCols.filter(function (x) { return x.collateral_id === id; })[0];
      var expiry = /보증보험|예금/.test(type) ? rec.collateral_expiry : '';
      if (cur && Number(cur.set_amount) === rec.collaterals[type] && (cur.expiry_date || '') === (expiry || '')) { stat.unchanged++; return; }
      var all = readTable_('DB_MASTER', 'M_COLLATERAL').filter(function (x) { return x.collateral_id === id; });
      var vno = all.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
      var row = Object.assign({ collateral_id: id, version_no: vno, wholesaler_id: ws, collateral_type: type, set_amount: rec.collaterals[type], appraised_amount: '', appraisal_date: '',
        recognized_amount: '', confirmed_date: rec.collateral_change_date || asOf, review_status: '파일 적재(내부 인정금액 미확인)', expiry_date: expiry, evidence_ids: '' }, ver(asOf));
      closePreviousVersions_(all, 'collateral_id', row).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_COLLATERAL', x.row); });
      appendObjects_('DB_MASTER', 'M_COLLATERAL', [row]); invalidate_('DB_MASTER', 'M_COLLATERAL'); stat.collaterals++;
    });
    // 파일에서 사라진 담보 종류는 종료
    curCols.forEach(function (x) {
      var still = Object.keys(rec.collaterals).some(function (type) { return x.collateral_id === 'C' + ws + '-' + fnv1a_(type).substring(0, 4).toUpperCase(); });
      if (!still && x.change_reason.indexOf('담보현황 파일') === 0) { x.valid_to = addDays_(asOf, -1); writeObject_('DB_MASTER', 'M_COLLATERAL', x); stat.collaterals++; }
    });

    // 연대보증
    if (rec.has_guarantee) {
      var gid = 'G' + ws + '-01';
      var curG = asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', ws, asOf).filter(function (x) { return x.guarantee_id === gid; })[0];
      var gref = '';
      if (rec.has_guarantee === '있음' && rec.guarantor_name) {
        var pii = readTable_('DB_PII', 'P_GUARANTOR').filter(function (p) { return p.name === rec.guarantor_name && p.note === 'WS:' + ws && !p.is_deleted; })[0];
        if (!pii) { pii = Object.assign({ guarantor_ref: uid_('GR'), name: rec.guarantor_name, relation: rec.guarantor_relation, note: 'WS:' + ws }, newAuditFields_(sys)); appendObjects_('DB_PII', 'P_GUARANTOR', [pii]); invalidate_('DB_PII', 'P_GUARANTOR'); }
        gref = pii.guarantor_ref;
      }
      if (curG && curG.has_guarantee === rec.has_guarantee && (curG.guarantor_ref || '') === gref) stat.unchanged++;
      else {
        var allG = readTable_('DB_MASTER', 'M_GUARANTEE').filter(function (x) { return x.guarantee_id === gid; });
        var gv = allG.reduce(function (mx, l) { return Math.max(mx, Number(l.version_no)); }, 0) + 1;
        var grow = Object.assign({ guarantee_id: gid, version_no: gv, wholesaler_id: ws, has_guarantee: rec.has_guarantee, guarantor_ref: gref, scope: rec.has_guarantee === '있음' ? '담보현황 기재(범위·한도 미확인)' : '',
          guarantee_limit: '', period_from: '', period_to: '', confirmed_date: rec.updated || asOf, doc_ids: '' }, ver(asOf));
        closePreviousVersions_(allG, 'guarantee_id', grow).forEach(function (x) { x.row.valid_to = x.newValidTo; writeObject_('DB_MASTER', 'M_GUARANTEE', x.row); });
        appendObjects_('DB_MASTER', 'M_GUARANTEE', [grow]); invalidate_('DB_MASTER', 'M_GUARANTEE'); stat.guarantees++;
      }
    }
  });
  audit_(sys, 'IMPORT_COLLATERAL', 'DB_MASTER', '*', batchId, null, stat, reason);
  return stat;
}

/** 파일명에서 기준일 추출: '26.9.16.기준' / '2026-09-16' / 없으면 오늘 */
function nhAsOfFromName_(name) {
  var m = String(name).match(/(\d{2})\.(\d{1,2})\.(\d{1,2})\.?\s*기준/);
  if (m) return '20' + m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  var d = nhDate_(name);
  return d || todayStr_();
}

/**
 * 농협 형식 파일 1개 처리. 반환값은 importFile_ 의 batch 에 합쳐진다.
 * @return { source, status, message, dest, accepted, rejected, dateFrom, dateTo, amount, rowCount }
 */
function importNhFile_(file, batch, settings) {
  var rows = fileToRows_(file);
  var det = detectNhFormat_(rows);
  if (!det) return null;
  batch.source = det.format;
  if (det.format === 'NH_MART') {
    return { status: '참고자료', message: '계통마트 거래실적(EBFW916004)은 채권관리 지표에 쓰지 않아 적재하지 않습니다. 파일은 완료 폴더에 보관합니다.', dest: 'DONE', accepted: 0, rejected: 0, rowCount: rows.length - det.headerRow - 1 };
  }
  if (det.format === 'NH_COLLATERAL') {
    var asOf = nhAsOfFromName_(file.getName());
    var pc = parseNhCollateral_(rows, det, asOf);
    var stat = applyNhCollateral_(pc.records, asOf, batch.batch_id);
    return { status: pc.rejects.length ? '부분적재' : '완료', message: '기준일 ' + asOf + ' / 중도매인 ' + pc.records.length + '명 / 신규·변경 ' + stat.wholesalers + ' / 한도 ' + stat.limits + ' / 담보 ' + stat.collaterals + ' / 보증 ' + stat.guarantees + ' / 변동 없음 ' + stat.unchanged + ' / 거부 ' + pc.rejects.length,
      dest: 'DONE', accepted: pc.records.length, rejected: pc.rejects.length, rejects: pc.rejects, rowCount: pc.records.length + pc.rejects.length, dateFrom: asOf, dateTo: asOf };
  }
  var parsed = det.format === 'NH_SALES_DAILY' ? parseNhSalesDaily_(rows, det, {}) : parseNhSalesMonthly_(rows, det);
  // 미등록 중도매인 자동 등록
  var firstDates = {};
  parsed.records.forEach(function (r) { var d = r.txn_date || (r.ym + '-01'); if (!firstDates[r.wholesaler_id] || d < firstDates[r.wholesaler_id]) firstDates[r.wholesaler_id] = d; });
  var created = autoRegisterWs_(parsed.names, firstDates, settings);
  var wsIds = {}; readTable_('DB_MASTER', 'M_WHOLESALER').forEach(function (w) { if (!w.is_deleted) wsIds[w.wholesaler_id] = true; });
  var table = det.format === 'NH_SALES_DAILY' ? 'R_SALES' : 'R_SALES_MONTHLY';
  var existing = {}; readTable_('DB_RAW', table).forEach(function (r) { existing[r.row_key] = r.content_hash; });
  var accepted = [], dup = 0, conflicts = 0, rejects = parsed.rejects.slice(), amount = 0, from = '', to = '';
  parsed.records.forEach(function (r) {
    if (!wsIds[r.wholesaler_id]) { rejects.push({ line: 0, code: 'UNKNOWN_WS', msg: '미등록 중도매인(자동 등록 꺼짐): ' + r.wholesaler_id, raw: JSON.stringify(r) }); return; }
    var rec = {}; Object.keys(r).forEach(function (k) { if (k.indexOf('_') !== 0) rec[k] = r[k]; });
    rec.row_key = det.format === 'NH_SALES_DAILY' ? rec.source_txn_no + '|1' : rec.wholesaler_id + '|' + rec.ym;
    rec.content_hash = fnv1a_(Object.keys(rec).sort().map(function (k) { return k + '=' + rec[k]; }).join('|'));
    if (existing[rec.row_key] !== undefined) {
      if (existing[rec.row_key] === rec.content_hash) { dup++; return; }
      // 같은 날·같은 조합의 금액이 달라짐 = 원천 정정. 일별은 거부(정정 파일 확인), 월별은 수정본 적재
      if (det.format === 'NH_SALES_DAILY') { conflicts++; rejects.push({ line: 0, code: 'KEY_CONFLICT', msg: '이미 적재된 일자·조합의 금액이 다름: ' + rec.row_key, raw: JSON.stringify(rec) }); return; }
    }
    existing[rec.row_key] = rec.content_hash;
    rec.batch_id = batch.batch_id; rec.loaded_at = nowStr_();
    accepted.push(rec); amount += Number(rec.amount);
    var d = rec.txn_date || rec.ym; if (!from || d < from) from = d; if (!to || d > to) to = d;
  });
  appendObjects_('DB_RAW', table, accepted);
  var status = accepted.length === 0 && rejects.length ? '실패' : (rejects.length ? '부분적재' : '완료');
  return { status: status, dest: status === '실패' ? 'ERROR' : 'DONE', accepted: accepted.length, rejected: rejects.length, rejects: rejects, duplicates: dup, rowCount: parsed.records.length + parsed.rejects.length,
    dateFrom: from, dateTo: to, amount: amount,
    message: (det.format === 'NH_SALES_DAILY' ? '일별 낙찰 실적' : '월별 사업실적') + ' / 적재 ' + accepted.length + ' / 중복 ' + dup + ' / 충돌 ' + conflicts + ' / 거부 ' + rejects.length + (created.length ? ' / 중도매인 자동 등록 ' + created.length + '명' : '') + ' / 관리합계 없음(농협 파일)' };
}

/* ══════════════ Snapshot.gs ══════════════ */
/**
 * Snapshot.gs — 사내망 배포용 스냅샷 HTML 생성 + 오프라인 동향보고 파일 적재
 *
 * 스냅샷: 정기 처리 후 역할별로 HTML 파일(JS·CSS·데이터 한 파일)을 40_배포 폴더에 만든다.
 *  - 전체용 1개: 채권담당·관리자 시점(모든 중도매인)
 *  - 경매사별 N개: 담당 중도매인만
 *  - 포함: 오늘 처리할 일, 신호·근거, 중도매인별 실적·회수 요약, 매트릭스, 관리 건, 절차 안내(상황 코드별), 동향보고 입력 폼
 *  - 제외: 보증인 성명·연락처·증빙·변경 이력(개인정보·내부 기록). 파일을 받은 사람은 파일 안 자료를 모두 볼 수 있으므로 역할별로 분리한다
 * 동향보고 파일(TREND_*.json): 스냅샷의 폼에서 내려받은 파일을 담당자가 가져오기 폴더에 넣으면 정기 처리가 보고서로 적재한다.
 */

function snapshotUserFor_(auctioneerId) {
  if (!auctioneerId) return ownerAsUser_();
  var u = readTable_('DB_MASTER', 'M_USER').filter(function (r) { return r.user_id === auctioneerId; })[0];
  return { user_id: u.user_id, name: u.name, role: u.role, roleLabel: ROLES[u.role] };
}

/** 스냅샷에 넣을 자료(개인정보·내부 기록 제외) */
function snapshotData_(user) {
  var st = readStatus_(), today = todayStr_();
  var queues = workQueues_(user);
  var perf = performanceSummary_(user);
  var matrix = matrix_(user, APP.ALL);
  var names = userNameMap_();
  var mine = {}; accessibleWs_(user).forEach(function (w) { mine[w.wholesaler_id] = w; });
  var signals = readTable_('DB_WORK', 'T_SIGNAL').filter(function (s) { return mine[s.wholesaler_id] && s.status !== '해소' && s.status !== '오탐확정'; })
    .map(function (s) { return { signal_id: s.signal_id, wholesaler_id: s.wholesaler_id, rule_id: s.rule_id, label: SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : s.rule_id, severity: s.severity, status: s.status, first_date: s.first_date, last_date: s.last_date, case_id: s.case_id, evidence: JSON.parse(s.evidence_json || '{}') }; });
  var cases = readTable_('DB_WORK', 'T_CASE').filter(function (c) { return mine[c.wholesaler_id] && !c.is_deleted && (c.status !== '종결' || c.closed_date >= addDays_(today, -90)); })
    .map(function (c) { return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, status: c.status, opened_date: c.opened_date, auctioneer: names[c.auctioneer_id] || '', auctioneer_id: c.auctioneer_id, owner: names[c.owner_id] || '', trend_due: c.trend_due, action_due: c.action_due, recheck_date: c.recheck_date, result_class: c.result_class, close_reason: c.close_reason, is_recurrence: c.is_recurrence }; });
  var trends = readTable_('DB_WORK', 'T_TREND').filter(function (t) { return mine[t.wholesaler_id] && t.status === '제출'; })
    .map(function (t) { return { case_id: t.case_id, version: t.version, checked_date: t.checked_date, check_method: t.check_method, result_class: t.result_class, facts: JSON.parse(t.facts_json || '[]').map(function (f) { return f.text; }), writer: names[t.writer_id] || '', submitted_at: t.submitted_at, official_source: t.official_source }; });
  var actions = readTable_('DB_WORK', 'T_ACTION').filter(function (a) { return mine[a.wholesaler_id] && !a.is_deleted; })
    .map(function (a) { return { case_id: a.case_id, action_type: a.action_type, content: a.content, owner: names[a.owner_id] || '', due_date: a.due_date, approval_status: a.needs_approval ? a.approval_status : '불필요', status: a.status, result: a.result, done_date: a.done_date }; });
  var situations = readTable_('DB_MASTER', 'M_SITUATION').filter(function (x) { return !x.is_deleted; }).map(function (x) {
    var p = proceduresFor_(x.situation_code, today);
    return { situation_code: x.situation_code, label: x.label, condition: x.condition_json, status: p.status, message: p.message,
      steps: p.steps.map(function (s) { return { step_no: s.step_no, content: s.content, checks: s.checks, basis: s.doc_name + ' ' + s.version + ' ' + s.article + (s.page ? ' p.' + s.page : ''), effective_from: s.effective_from, forms: s.forms.map(function (f) { return f.form_name + ' ' + f.version; }) }; }) };
  });
  var wsList = perf.rows.map(function (r) {
    var w = mine[r.wholesaler_id];
    return { wholesaler_id: r.wholesaler_id, name: r.name, biz_status: r.biz_status, isNew: r.isNew, categories: w ? w.categories : '', dataState: r.dataState,
      assignee: currentAssignees_(r.wholesaler_id, today, names).map(function (a) { return a.name; }).join(', '),
      byCategory: r.byCategory, turnover: r.turnover, turnoverInfo: r.turnoverInfo, collectionDays: r.collectionDays, balance: r.balance, overdue: r.overdue, overdueDays: r.overdueDays, limitUsage: r.limitUsage, limitUsageInfo: r.limitUsageInfo,
      limits: asOfVersions_(readTable_('DB_MASTER', 'M_LIMIT'), 'limit_id', r.wholesaler_id, today).map(function (l) { return { limit_type: l.limit_type, amount: l.amount, valid_from: l.valid_from, valid_to: l.valid_to }; }),
      collaterals: asOfVersions_(readTable_('DB_MASTER', 'M_COLLATERAL'), 'collateral_id', r.wholesaler_id, today).map(function (c) { return { type: c.collateral_type, set_amount: c.set_amount, recognized_amount: c.recognized_amount, expiry_date: c.expiry_date, review_status: c.review_status }; }),
      guarantee: asOfVersions_(readTable_('DB_MASTER', 'M_GUARANTEE'), 'guarantee_id', r.wholesaler_id, today).map(function (g) { return { has: g.has_guarantee, scope: g.scope, period_to: g.period_to }; })[0] || null };
  });
  return {
    generated_at: nowStr_(), for_user: { name: user.name, role: user.roleLabel, user_id: user.user_id }, app: { name: APP.NAME, version: APP.VERSION },
    status: { base_date: st.latest_base_date || '', data_status: st.data_status || '', status_reasons: st.status_reasons || '', last_updated: st.last_updated_at || '', ar_available: st.ar_available || '예', signal_base_date: st.signal_base_date || '' },
    meta: perf.meta, queues: queues, signals: signals, cases: cases, trends: trends, actions: actions, wholesalers: wsList,
    matrix: { xMode: matrix.xMode, growthRank: matrix.growthRank || null, boundaries: matrix.boundaries, counts: matrix.counts, points: matrix.points, excluded: matrix.excluded, disclaimer: matrix.disclaimer, axes: matrix.axes, quadrants: matrix.quadrants },
    situations: situations, resultClasses: RESULT_CLASSES, rules: SIGNAL_RULES, quadrants: MATRIX_QUADRANTS,
    notes: { turnover: perf.meta.turnoverNote, partial: perf.meta.partialNote, privacy: '이 파일에는 보증인 성명·연락처·증빙·변경 이력이 들어 있지 않습니다. 파일을 받은 사람은 파일 안 자료를 모두 볼 수 있으므로 외부로 전달하지 마세요.' }
  };
}

/**
 * 주간 요약(웹 홈·스냅샷 공용): 이상 징후 / 동향보고 / 조치사항 세 흐름 + 4분면 + 조치 안내 + 체크리스트
 */
function weeklySummary_(user) {
  var d = snapshotData_(user), today = todayStr_();
  var byCase = {}; d.cases.forEach(function (c) { byCase[c.case_id] = c; });
  var wsIdx = {}; d.wholesalers.forEach(function (w) { wsIdx[w.wholesaler_id] = w; });
  // ① 이상 징후: 중도매인별로 묶음(활성 신호가 있거나 관리 건이 열려 있는 경우)
  var sigByWs = {};
  d.signals.forEach(function (s) { (sigByWs[s.wholesaler_id] = sigByWs[s.wholesaler_id] || []).push(s); });
  var flagged = Object.keys(sigByWs).map(function (ws) {
    var sg = sigByWs[ws], c = d.cases.filter(function (x) { return x.wholesaler_id === ws && x.status !== '종결'; })[0];
    var w = wsIdx[ws] || {};
    var latestTrend = d.trends.filter(function (t) { return c && t.case_id === c.case_id; }).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; })[0];
    var sev = sg.some(function (s) { return s.severity === '위험'; }) ? '위험' : sg.some(function (s) { return s.severity === '경고'; }) ? '경고' : sg.some(function (s) { return s.severity === '주의'; }) ? '주의' : '정보';
    return { wholesaler_id: ws, name: w.name || ws, assignee: w.assignee || '', severity: sev, signals: sg, case_id: c ? c.case_id : '', case_status: c ? c.status : '', trend_due: c ? c.trend_due : '',
      latest_trend: latestTrend ? { checked_date: latestTrend.checked_date, result_class: latestTrend.result_class, check_method: latestTrend.check_method } : null,
      balance: w.balance, overdue: w.overdue, overdueDays: w.overdueDays, turnover: w.turnover, yoy: w.byCategory ? w.byCategory[APP.ALL].lastMonth.yoy : null, lastMonth: w.byCategory ? w.byCategory[APP.ALL].lastMonth : null };
  }).sort(function (a, b) { var o = { '위험': 0, '경고': 1, '주의': 2, '정보': 3 }; return o[a.severity] - o[b.severity] || (b.overdue || 0) - (a.overdue || 0); });
  // ② 동향보고: 최근 제출 + 확인 대기
  var trendWait = d.cases.filter(function (c) { return c.status === '접수' || c.status === '동향확인중'; }).map(function (c) {
    return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, name: (wsIdx[c.wholesaler_id] || {}).name || '', auctioneer: c.auctioneer, trend_due: c.trend_due, overdue: c.trend_due && c.trend_due < today,
      signals: (sigByWs[c.wholesaler_id] || []).map(function (s) { return s.rule_id; }) };
  });
  var recentTrends = d.trends.slice().sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; }).slice(0, 30).map(function (t) {
    return Object.assign({ name: (wsIdx[(byCase[t.case_id] || {}).wholesaler_id] || {}).name || '', wholesaler_id: (byCase[t.case_id] || {}).wholesaler_id || '' }, t);
  });
  // ③ 조치사항: 진행 중 조치 + 승인 대기 + 재점검 + 최근 완료
  var actions = d.actions.map(function (a) { return Object.assign({ wholesaler_id: (byCase[a.case_id] || {}).wholesaler_id || '', name: (wsIdx[(byCase[a.case_id] || {}).wholesaler_id] || {}).name || '', case_status: (byCase[a.case_id] || {}).status || '' }, a); });
  var openActions = actions.filter(function (a) { return a.status !== '완료'; });
  var doneActions = actions.filter(function (a) { return a.status === '완료'; }).sort(function (a, b) { return a.done_date < b.done_date ? 1 : -1; }).slice(0, 20);
  var recheck = d.cases.filter(function (c) { return c.status === '재점검대기'; }).map(function (c) { return { case_id: c.case_id, wholesaler_id: c.wholesaler_id, name: (wsIdx[c.wholesaler_id] || {}).name || '', recheck_date: c.recheck_date, due: c.recheck_date && c.recheck_date <= today, close_reason: c.close_reason }; });
  // 조치 안내(1줄 + 조항) 와 징후별 매칭: 상황 코드의 신호가 현재 활성 신호와 겹치면 해당
  var guides = actionGuides_();
  flagged.forEach(function (f) {
    var ids = f.signals.map(function (s) { return s.rule_id; });
    var od = (f.signals.filter(function (s) { return s.rule_id === 'S03'; })[0] || {}).evidence || {};
    f.guides = guides.filter(function (g) {
      if (!g.signals.length || !g.signals.every(function (r) { return ids.indexOf(r) >= 0; })) return false;
      if (g.min_overdue_days && Number(od.overdueDays || 0) < Number(g.min_overdue_days)) return false;
      if (g.result_class && (!f.latest_trend || f.latest_trend.result_class !== g.result_class)) return false;
      return true;
    }).map(function (g) { return { situation_code: g.situation_code, label: g.label, status: g.status, first: g.steps[0] || null, candidates: g.candidates }; });
  });
  // 체크리스트 인쇄 대상: 동향 확인 대기 관리 건
  var checklists = trendWait.map(function (t) { var c = byCase[t.case_id]; return checklistPrintData_({ case_id: c.case_id, wholesaler_id: c.wholesaler_id, auctioneer_id: c.auctioneer, opened_date: c.opened_date, trend_due: c.trend_due }, sigByWs[c.wholesaler_id] || [], t.name); });
  return {
    generated_at: d.generated_at, for_user: d.for_user, app: d.app, status: d.status, meta: d.meta, notes: d.notes, resultClasses: d.resultClasses, rules: d.rules, quadrants: d.quadrants,
    kpis: { flagged: flagged.length, flaggedHigh: flagged.filter(function (f) { return f.severity === '위험' || f.severity === '경고'; }).length, trendWait: trendWait.length, trendLate: trendWait.filter(function (t) { return t.overdue; }).length,
      trendsThisWeek: d.trends.filter(function (t) { return t.submitted_at && t.submitted_at.substring(0, 10) >= addDays_(today, -7); }).length,
      openActions: openActions.length, pendingApproval: openActions.filter(function (a) { return a.approval_status === '승인대기'; }).length, recheck: recheck.length, recheckDue: recheck.filter(function (r) { return r.due; }).length, wholesalers: d.wholesalers.length },
    flagged: flagged, trendWait: trendWait, recentTrends: recentTrends, openActions: openActions, doneActions: doneActions, recheck: recheck,
    matrix: d.matrix, guides: guides, checklists: checklists, checklistItems: checklistItems_(), wholesalers: d.wholesalers, cases: d.cases
  };
}

function snapshotHtml_(data) {
  var tpl = htmlFile_('SnapshotTemplate');
  var css = htmlFile_('Styles');
  var view = htmlFile_('SummaryView');
  var json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  return tpl.replace('<!--STYLES-->', css).replace('<!--SUMMARYVIEW-->', view).replace('/*DATA*/null', json);
}

/** [트리거·정기 처리] 역할별 스냅샷 생성 → 40_배포 폴더. 같은 날 파일은 덮어쓴다(이름 동일 파일 삭제 후 생성) */
function buildSnapshots_(runId, trigger) {
  var started = nowStr_(), out = [], settings = readSettings_();
  var folder = folder_('DEPLOY'), stamp = todayStr_();
  var targets = [{ id: '', label: '전체' }];
  readTable_('DB_MASTER', 'M_USER').forEach(function (u) { if (u.role === 'AUCTIONEER' && u.status === '사용' && !u.is_deleted) targets.push({ id: u.user_id, label: u.name }); });
  var mails = [];
  targets.forEach(function (t) {
    var user = snapshotUserFor_(t.id);
    var data = weeklySummary_(user);
    var html = snapshotHtml_(data);
    var name = '중도매인관리_' + stamp + '_' + t.label.replace(/[\\/:*?"<>|]/g, '_') + '.html';
    var it = folder.getFilesByName(name);
    while (it.hasNext()) it.next().setTrashed(true);
    var f = folder.createFile(name, html, 'text/html');
    out.push({ target: t.label, file_id: f.getId(), name: name, bytes: html.length, wholesalers: data.wholesalers.length });
    if (t.id && (settings.SNAPSHOT_EMAIL || '아니오') === '예') mails.push({ to: t.id, name: name, blob: Utilities.newBlob(html, 'text/html', name) });
  });
  var sent = 0;
  if (mails.length && MailApp.getRemainingDailyQuota() >= mails.length) {
    mails.forEach(function (m) { MailApp.sendEmail({ to: m.to, subject: '[' + APP.NAME + '] ' + stamp + ' 담당 중도매인 현황', body: '첨부 HTML 파일을 열어 확인하세요. 외부로 전달하지 마세요.', attachments: [m.blob] }); sent++; });
  }
  mergeStatus_({ snapshot_at: nowStr_(), snapshot_files: String(out.length) });
  logJob_(runId, 'SNAPSHOT', '완료', started, out.length, 0, out.map(function (o) { return o.target + '(' + Math.round(o.bytes / 1024) + 'KB)'; }).join(', ') + (sent ? ' / 메일 ' + sent : ''), trigger);
  return out;
}

/** [편집기 실행] 스냅샷 지금 생성 */
function buildSnapshotsNow() { requireOwner_(); return buildSnapshots_(uid_('SNAP'), '수동'); }

/* ───────────── 동향보고 파일 적재 ───────────── */

/**
 * TREND_*.json: { case_id, writer_id, checked_date, check_method, counterpart, facts[], business_status, payment_plan, opinion,
 *                 further_checks, result_class, recheck_date, followup, followup_owner, followup_due, submitted_at }
 * 작성자는 그 관리 건의 담당 경매사(또는 채권담당·관리자)여야 한다. 공식 원본 = 파일 제출(화면 입력과 구분 기록)
 */
function importTrendFile_(file, batch) {
  var o;
  try { o = JSON.parse(file.getBlob().getDataAsString('UTF-8')); } catch (e) { return { ok: false, status: '형식오류', message: 'JSON 을 읽을 수 없음', dest: 'ERROR' }; }
  if (!o || !o.case_id) return { ok: false, status: '형식오류', message: 'case_id 없음', dest: 'ERROR' };
  var users = readTable_('DB_MASTER', 'M_USER');
  var writer = users.filter(function (u) { return u.user_id === String(o.writer_id || '').toLowerCase() && u.status === '사용' && !u.is_deleted; })[0];
  if (!writer) return { ok: false, status: '실패', message: '작성자(writer_id)가 등록 사용자가 아님: ' + o.writer_id, dest: 'ERROR' };
  var user = { user_id: writer.user_id, name: writer.name, role: writer.role, roleLabel: ROLES[writer.role] };
  if (!can_(user.role, 'trend.write')) return { ok: false, status: '실패', message: '동향보고 작성 권한 없음: ' + user.role, dest: 'ERROR' };
  try {
    var c = findCase_(o.case_id);
    if (!canAccessWs_(user, c.wholesaler_id, readTable_('DB_MASTER', 'M_ASSIGNMENT'), todayStr_())) return { ok: false, status: '실패', message: '작성자가 담당하지 않는 중도매인: ' + c.wholesaler_id, dest: 'ERROR' };
    o.official_source = '파일 제출(' + file.getName() + ')';
    o.evidence_ids = '';
    var submit = !!o.result_class;
    var r = saveTrendReport_(user, o, submit);
    appendObjects_('DB_WORK', 'T_ATTACH', [{ attach_id: uid_('AT'), case_id: c.case_id, ref_type: 'TREND', ref_id: r.report_id, kind: '제출본', form_doc_id: '', form_version: '',
      file_id: file.getId(), file_name: file.getName(), file_hash: batch.file_hash, locked: true, created_at: nowStr_(), created_by: user.user_id }]);
    return { ok: true, status: '완료', message: '동향보고 ' + (submit ? '제출' : '임시 저장') + ' → ' + c.case_id + ' v' + r.version + ' (작성 ' + writer.name + ', 결과 ' + (o.result_class || '미분류') + ')', dest: 'DONE' };
  } catch (e) {
    return { ok: false, status: '실패', message: String(e && e.message ? e.message : e), dest: 'ERROR' };
  }
}

/* ══════════════ Checklist.gs ══════════════ */
/**
 * Checklist.gs — 이상징후 체크리스트 (현장 확인용)
 * 흐름: 징후가 뜬 중도매인별 서면 체크리스트 인쇄(스냅샷·웹) → 경매사가 대면·경매 현장에서 체크 → 채권 담당자가 결과를 입력하거나 스캔 파일 업로드
 *       → 동향보고(확인 방법 '현장 체크리스트')로 기록되고 관리 건 흐름으로 이어진다.
 * 판정 제안(가능성 높음/보통/낮음)은 가중 합계 기준의 가정값이며 담당자의 결과 분류를 대신하지 않는다.
 */

function seedChecklist_(user) {
  invalidate_('DB_MASTER', 'M_CHECKLIST');
  if (readTable_('DB_MASTER', 'M_CHECKLIST').length) return 0;
  var rows = CHECKLIST_SEED.map(function (c, i) {
    var r = { item_id: 'CK' + ('0' + (i + 1)).slice(-2), sort_no: i + 1, category: c[0], text: c[1], weight: c[2], is_assumed: true, active: true };
    Object.assign(r, newAuditFields_(user)); return r;
  });
  appendObjects_('DB_MASTER', 'M_CHECKLIST', rows);
  return rows.length;
}

function checklistItems_() {
  return readTable_('DB_MASTER', 'M_CHECKLIST').filter(function (r) { return r.active && !r.is_deleted; })
    .sort(function (a, b) { return a.sort_no - b.sort_no; })
    .map(function (r) { return { item_id: r.item_id, category: r.category, text: r.text, weight: Number(r.weight) || 1, is_assumed: !!r.is_assumed }; });
}

/** 체크리스트 점수 → 제안. 가정값(CHECKLIST_HIGH_SCORE) */
function checklistScore_(items, answers, settings) {
  var yes = 0, total = 0, unknown = 0;
  items.forEach(function (it) {
    var a = answers[it.item_id];
    total += it.weight;
    if (a === '예') yes += it.weight; else if (a === '미확인' || a === undefined) unknown++;
  });
  var high = settingNum_(settings, 'CHECKLIST_HIGH_SCORE', 3);
  var level = yes >= high ? '높음' : (yes > 0 ? '보통' : '낮음');
  return { yes: yes, total: total, unknown: unknown, level: level, threshold: high, note: '가정값 기준 제안. 담당자의 확인 결과 분류가 우선합니다.' };
}

/**
 * 체크 결과 입력 → 동향보고 제출. answers: {item_id: '예'|'아니오'|'미확인'}, remarks: {item_id: 비고}
 */
function saveChecklistResult_(user, o) {
  var c = findCase_(requireText_(o.case_id, '관리건ID'));
  requireWsAccess_(user, c.wholesaler_id);
  requireText_(o.checked_date, '확인일'); optDate_(o.checked_date, '확인일');
  if (RESULT_CLASSES.indexOf(o.result_class) < 0) throw new Error('확인 결과 분류를 선택하세요.');
  requireText_(o.recheck_date, '재점검일');
  var items = checklistItems_(), answers = o.answers || {}, remarks = o.remarks || {};
  var score = checklistScore_(items, answers, readSettings_());
  var facts = [], further = [];
  items.forEach(function (it) {
    var a = answers[it.item_id] || '미확인';
    var line = '[' + it.category + '] ' + it.text + ' → ' + a + (remarks[it.item_id] ? ' (' + remarks[it.item_id] + ')' : '');
    if (a === '예') facts.push({ text: line, item_id: it.item_id });
    else if (a === '미확인') further.push(it.category + ': ' + it.text);
  });
  if (!facts.length) facts.push({ text: '체크리스트 전 항목 "아니오" 또는 "미확인" (확인일 ' + o.checked_date + ')' });
  var checker = o.checker_name ? ' (현장 확인자: ' + o.checker_name + ')' : '';
  var report = saveTrendReport_(user, {
    case_id: c.case_id, checked_date: o.checked_date, check_method: '현장 체크리스트' + (o.by_paper ? '(서면)' : ''), counterpart: o.counterpart || '',
    facts: facts, business_status: o.business_status || '', payment_plan: o.payment_plan || '',
    opinion: (o.opinion || '') + (o.opinion ? ' / ' : '') + '체크리스트 점수 ' + score.yes + '/' + score.total + ' → 제안 ' + score.level + checker,
    further_checks: further.join('; ') + (o.further_checks ? ' / ' + o.further_checks : ''), result_class: o.result_class, recheck_date: o.recheck_date,
    followup: o.followup || '', official_source: o.by_paper ? '서면 체크리스트(담당자 전산 입력)' : '시스템 입력(체크리스트)'
  }, true);
  audit_(user, 'CHECKLIST', 'DB_WORK', 'T_TREND', report.report_id, null, { score: score, answers: answers }, '체크리스트 결과');
  return { report: report, score: score };
}

/** 인쇄용 체크리스트 자료(스냅샷·웹 공용) */
function checklistPrintData_(caseRow, signals, wsName) {
  return { case_id: caseRow.case_id, wholesaler_id: caseRow.wholesaler_id, name: wsName, auctioneer: caseRow.auctioneer_id, opened_date: caseRow.opened_date,
    trend_due: caseRow.trend_due, signals: signals.map(function (s) { return s.rule_id + ' ' + (SIGNAL_RULES[s.rule_id] ? SIGNAL_RULES[s.rule_id].label : ''); }), items: checklistItems_() };
}

/**
 * 서면 체크리스트 스캔·사진 파일 적재: 파일명 CHECK_<관리건ID>_<yyyymmdd>.(pdf|jpg|png)
 * 관리 건의 증빙(잠금)으로 첨부만 한다. 결과 입력은 담당자가 화면에서 한다.
 */
function importChecklistFile_(file, batch) {
  var m = String(file.getName()).match(/^CHECK_(C-\d{4}-\d{4})_/i);
  if (!m) return { ok: false, status: '형식오류', message: '파일명은 CHECK_<관리건ID>_<날짜> 형식이어야 합니다', dest: 'ERROR' };
  try {
    var c = findCase_(m[1]);
    var copy = file.makeCopy(file.getName(), caseFolder_(c.case_id));
    appendObjects_('DB_WORK', 'T_ATTACH', [{ attach_id: uid_('AT'), case_id: c.case_id, ref_type: 'CASE', ref_id: c.case_id, kind: '증빙', form_doc_id: '', form_version: '',
      file_id: copy.getId(), file_name: '체크리스트(서면) ' + file.getName(), file_hash: batch.file_hash, locked: true, created_at: nowStr_(), created_by: 'import' }]);
    return { ok: true, status: '완료', message: '서면 체크리스트 → ' + c.case_id + ' 증빙 첨부. 결과는 화면 "체크리스트 결과 입력"에서 기록하세요', dest: 'DONE' };
  } catch (e) { return { ok: false, status: '실패', message: String(e && e.message ? e.message : e), dest: 'ERROR' }; }
}

/* ══════════════ 내장 화면 (gas/*.html) ══════════════ */
var BUNDLED_HTML_ = {
 "Index": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n  <base target=\"_top\">\n  <meta charset=\"utf-8\">\n  <title>중도매인 통합관리</title>\n  <?!= include_('Styles'); ?>\n</head>\n<body>\n  <header class=\"topbar\">\n    <button class=\"menu-btn\" id=\"menuBtn\" aria-label=\"메뉴\">☰</button>\n    <div class=\"brand\">중도매인 통합관리 <span class=\"ver\" id=\"appVer\"></span></div>\n    <div class=\"statusbar\" id=\"statusbar\"></div>\n    <div class=\"who\" id=\"who\">사용자 확인 중…</div>\n  </header>\n  <div class=\"shell\">\n    <aside class=\"side\" id=\"side\"><nav id=\"nav\"></nav></aside>\n    <main id=\"view\"><p class=\"muted\">불러오는 중…</p></main>\n  </div>\n  <div id=\"toast\" class=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n  <?!= include_('SummaryView'); ?>\n  <?!= include_('Client'); ?>\n</body>\n</html>\n",
 "Styles": "<style>\n  :root {\n    color-scheme: light;\n    --bg: #f6f6f4; --surface: #fcfcfb; --surface-2: #f0f0ec; --border: #dcdbd5;\n    --text: #0b0b0b; --text-2: #52514e; --muted: #7a7974;\n    --accent: #2a78d6; --accent-ink: #ffffff;\n    --series-1: #2a78d6; --series-2: #eb6834;\n    --ok: #0f7b3e; --ok-bg: #e5f4ea; --warn: #8a5a00; --warn-bg: #fff3d6;\n    --bad: #b42318; --bad-bg: #fde8e7; --info-bg: #e8eef7;\n  }\n  @media (prefers-color-scheme: dark) {\n    :root:not([data-theme=\"light\"]) {\n      color-scheme: dark;\n      --bg: #121211; --surface: #1a1a19; --surface-2: #232321; --border: #3a3936;\n      --text: #f0efec; --text-2: #c3c2b7; --muted: #94938b;\n      --accent: #3987e5; --accent-ink: #ffffff;\n      --series-1: #3987e5; --series-2: #d95926;\n      --ok: #6fd39a; --ok-bg: #173323; --warn: #f2c25b; --warn-bg: #3a2e12;\n      --bad: #ff8f86; --bad-bg: #3d1a18; --info-bg: #1d2a3b;\n    }\n  }\n  :root[data-theme=\"dark\"] {\n    color-scheme: dark;\n    --bg: #121211; --surface: #1a1a19; --surface-2: #232321; --border: #3a3936;\n    --text: #f0efec; --text-2: #c3c2b7; --muted: #94938b;\n    --accent: #3987e5; --accent-ink: #ffffff;\n    --series-1: #3987e5; --series-2: #d95926;\n    --ok: #6fd39a; --ok-bg: #173323; --warn: #f2c25b; --warn-bg: #3a2e12;\n    --bad: #ff8f86; --bad-bg: #3d1a18; --info-bg: #1d2a3b;\n  }\n  * { box-sizing: border-box; }\n  body { margin: 0; background: var(--bg); color: var(--text);\n    font: 14px/1.5 -apple-system, \"Malgun Gothic\", \"Apple SD Gothic Neo\", \"Noto Sans KR\", sans-serif; }\n  a { color: var(--accent); text-decoration: none; }\n  a:hover { text-decoration: underline; }\n  /* 레이아웃: 상단 띠(브랜드·기준일·사용자) + 왼쪽 고정 내비 + 본문. 본문은 2/3 주 영역 + 1/3 보조 영역 */\n  .topbar { display: flex; align-items: center; gap: 8px 16px; padding: 8px 16px; min-height: 48px;\n    background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 6; }\n  .menu-btn { display: none; border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 2px 8px; font-size: 16px; }\n  .shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: calc(100vh - 49px); }\n  .side { background: var(--surface); border-right: 1px solid var(--border); position: sticky; top: 49px; height: calc(100vh - 49px); overflow-y: auto; padding: 10px 8px; }\n  .side .grp { font-size: 11px; letter-spacing: .04em; color: var(--muted); text-transform: uppercase; margin: 12px 8px 4px; }\n  .side a { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border-radius: 6px; color: var(--text-2); font-size: 14px; }\n  .side a:hover { background: var(--surface-2); text-decoration: none; }\n  .side a.on { background: var(--info-bg); color: var(--text); font-weight: 600; }\n  .side a .cnt { font-size: 11px; padding: 0 6px; border-radius: 9px; background: var(--surface-2); color: var(--text-2); }\n  .side a .cnt.hot { background: var(--bad-bg); color: var(--bad); }\n  .side a .cnt.warm { background: var(--warn-bg); color: var(--warn); }\n  .layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 12px; align-items: start; }\n  .layout > .main, .layout > .aside { display: grid; gap: 12px; min-width: 0; }\n  .layout .card { grid-column: auto; }\n  .kpis { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin: 0 0 12px; }\n  .kpi { background: var(--surface); border: 1px solid var(--border); border-left-width: 4px; border-radius: 8px; padding: 8px 12px; cursor: pointer; }\n  .kpi .k { color: var(--text-2); font-size: 12px; } .kpi .v { font-size: 24px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }\n  .kpi .v small { font-size: 12px; font-weight: 400; color: var(--text-2); }\n  .kpi.bad { border-left-color: var(--bad); } .kpi.warn { border-left-color: var(--warn); } .kpi.ok { border-left-color: var(--ok); } .kpi.info { border-left-color: var(--accent); }\n  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }\n  .chips button { padding: 3px 10px; border-radius: 12px; font-size: 13px; }\n  .chips button.on { background: var(--text); color: var(--surface); border-color: var(--text); }\n  .worklist tr.late td { background: color-mix(in srgb, var(--bad-bg) 55%, var(--surface)); }\n  .rec-head { position: sticky; top: 49px; z-index: 4; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;\n    display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: center; }\n  .rec-head .t { font-size: 18px; font-weight: 700; margin-right: 6px; }\n  .rec-head .f { font-size: 13px; color: var(--text-2); } .rec-head .f b { color: var(--text); font-weight: 600; }\n  .rec-head .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }\n  @media (max-width: 900px) {\n    .menu-btn { display: inline-block; }\n    .shell { grid-template-columns: 1fr; }\n    .side { position: fixed; left: 0; top: 49px; width: 240px; transform: translateX(-100%); transition: transform .15s; z-index: 7; box-shadow: 2px 0 8px rgba(0,0,0,.15); }\n    .side.open { transform: none; }\n    .layout { grid-template-columns: 1fr; }\n    .rec-head { position: static; }\n    .topbar .statusbar { display: none; }\n  }\n  .brand { font-weight: 700; }\n  .ver { color: var(--muted); font-weight: 400; font-size: 12px; }\n  nav { display: grid; gap: 2px; }\n  .who { color: var(--text-2); font-size: 13px; }\n  .statusbar { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--text-2); flex: 1; justify-content: center; }\n  .statusbar b { color: var(--text); font-weight: 600; }\n  main { padding: 16px 20px; max-width: 1296px; width: 100%; margin: 0 auto; min-width: 0; }\n  h1 { font-size: 20px; margin: 4px 0 12px; }\n  h2 { font-size: 16px; margin: 0 0 8px; }\n  h3 { font-size: 14px; margin: 12px 0 6px; color: var(--text-2); }\n  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }\n  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; min-width: 0; }\n  .card.wide { grid-column: 1 / -1; }\n  @media (min-width: 900px) { .card.span2 { grid-column: span 2; } }\n  .tiles { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 12px; }\n  .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }\n  .tile .k { color: var(--text-2); font-size: 12px; }\n  .tile .v { font-size: 22px; font-weight: 700; }\n  .tile .v small { font-size: 13px; font-weight: 400; color: var(--text-2); }\n  .scroll { overflow-x: auto; }\n  table { border-collapse: collapse; width: 100%; font-size: 13px; }\n  th, td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; white-space: nowrap; }\n  th { color: var(--text-2); font-weight: 600; background: var(--surface-2); }\n  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }\n  td.wrap { white-space: normal; min-width: 220px; }\n  tr.click { cursor: pointer; }\n  tr.click:hover td { background: var(--surface-2); }\n  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }\n  .b-ok { background: var(--ok-bg); color: var(--ok); }\n  .b-warn { background: var(--warn-bg); color: var(--warn); }\n  .b-bad { background: var(--bad-bg); color: var(--bad); }\n  .b-info { background: var(--info-bg); color: var(--text); }\n  .note { font-size: 12px; color: var(--text-2); background: var(--surface-2); border-left: 3px solid var(--border); padding: 6px 10px; margin: 8px 0; }\n  .note.warn { border-left-color: var(--warn); background: var(--warn-bg); color: var(--text); }\n  .note.bad { border-left-color: var(--bad); background: var(--bad-bg); color: var(--text); }\n  .muted { color: var(--muted); }\n  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }\n  input, select, textarea { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border);\n    border-radius: 6px; padding: 5px 8px; max-width: 100%; }\n  textarea { width: 100%; min-height: 54px; }\n  button { font: inherit; border: 1px solid var(--border); background: var(--surface); color: var(--text);\n    border-radius: 6px; padding: 5px 12px; cursor: pointer; }\n  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }\n  button.danger { color: var(--bad); }\n  button:disabled { opacity: .5; cursor: default; }\n  form.f { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 12px; margin: 8px 0; }\n  form.f label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-2); }\n  form.f .full { grid-column: 1 / -1; }\n  dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }\n  dl.kv dt { color: var(--text-2); }\n  dl.kv dd { margin: 0; }\n  .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 8px 0; }\n  .tabs button.on { background: var(--info-bg); font-weight: 600; }\n  .chart { width: 100%; height: auto; display: block; }\n  .chart .axis { fill: var(--text-2); font-size: 11px; }\n  .chart .grid line { stroke: var(--border); }\n  .chart .s1 { fill: var(--series-1); }\n  .chart .s2 { fill: var(--series-2); }\n  .chart rect.bar:hover { opacity: .8; }\n  .legend { display: flex; gap: 14px; font-size: 12px; color: var(--text-2); }\n  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }\n  .toast { position: fixed; right: 16px; bottom: 16px; max-width: 420px; padding: 10px 14px; border-radius: 8px;\n    background: var(--text); color: var(--surface); opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 10; }\n  .toast.show { opacity: .95; }\n  .toast.err { background: var(--bad); color: #fff; }\n  @media (max-width: 640px) { main { padding: 12px 16px; } .tile .v { font-size: 18px; } }\n</style>\n",
 "Client": "<script>\n/* Client.html — 화면 로직. 권한 판단은 서버가 한다(여기서 메뉴를 숨기는 것은 편의 기능). */\n'use strict';\nvar S = { boot: null, cat: '전체' };\n\n/* ───── 공통 ───── */\nfunction token() { try { return localStorage.getItem('wm_token') || ''; } catch (e) { return ''; } }\nfunction setToken(t) { try { t ? localStorage.setItem('wm_token', t) : localStorage.removeItem('wm_token'); } catch (e) { /* 저장 불가 환경 */ } }\nfunction rawCall(fn, args) {\n  return new Promise(function (resolve, reject) {\n    var r = google.script.run\n      .withSuccessHandler(function (res) { res && res.ok ? resolve(res.data) : reject(new Error(res ? res.error : '응답 없음')); })\n      .withFailureHandler(function (e) { reject(e); });\n    r[fn].apply(r, args);\n  });\n}\n/* 접속코드 방식이면 토큰을 붙여 api_call 로 보내고, 세션 만료면 로그인 화면으로 */\nfunction call(fn) {\n  var args = Array.prototype.slice.call(arguments, 1);\n  var p = S.codeMode ? rawCall('api_call', [token(), fn, args]) : rawCall(fn, args);\n  return p.catch(function (e) { if (/SESSION_EXPIRED/.test(e.message)) { setToken(''); showLogin('세션이 만료되었습니다. 다시 로그인하세요.'); } throw e; });\n}\nfunction h(v) {\n  return v === null || v === undefined ? '' : String(v).replace(/[&<>\"']/g, function (c) {\n    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c];\n  });\n}\nfunction won(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('ko-KR') + '원'; }\nfunction num(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('ko-KR'); }\nfunction pct(g) {\n  if (!g) return '—';\n  if (g.status !== '정상') return '<span class=\"muted\" title=\"' + h(g.reason) + '\">비교불가</span>';\n  var v = (g.value * 100).toFixed(1);\n  return (g.value > 0 ? '+' : '') + v + '%';\n}\nfunction can(a) { return S.boot && S.boot.perms.indexOf(a) >= 0; }\nfunction badge(text) {\n  var cls = { '정상': 'b-ok', '완료': 'b-ok', '일치': 'b-ok', '승인': 'b-ok',\n    '판정보류': 'b-bad', '불일치': 'b-bad', '누락': 'b-bad', '실패': 'b-bad', '형식오류': 'b-bad', '오류': 'b-bad', '반려': 'b-bad',\n    '지연': 'b-warn', '부분적재': 'b-warn', '경고': 'b-warn', '승인대기': 'b-warn', '휴업': 'b-warn', '폐업': 'b-bad',\n    '중복파일': 'b-info', '도래': 'b-warn', '연결': 'b-warn', '발생': 'b-warn', '보류': 'b-bad', '해소': 'b-ok', '오탐확정': 'b-info',\n    '동향확인중': 'b-warn', '조치진행': 'b-warn', '승인대기': 'b-warn', '확인완료': 'b-info', '재점검대기': 'b-info', '종결': 'b-ok', '접수': 'b-info',\n    '충돌': 'b-bad', '확인 필요': 'b-warn', '제출': 'b-ok', '임시': 'b-info', '진행': 'b-warn', '참고': 'b-info', '산출불가': 'b-info', '미산출': 'b-info', '비교불가': 'b-info' }[text] || 'b-info';\n  return '<span class=\"badge ' + cls + '\">' + h(text) + '</span>';\n}\nfunction toast(msg, err) {\n  var t = document.getElementById('toast');\n  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');\n  clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3000);\n}\nfunction view(html) { document.getElementById('view').innerHTML = html; applyLayouts(); window.scrollTo(0, 0); }\nfunction loading() { view('<p class=\"muted\">불러오는 중…</p>'); }\nfunction fail(e) { view('<div class=\"note bad\">' + h(e.message || e) + '</div>'); }\nfunction formData(form) {\n  var o = {};\n  Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.value; });\n  return o;\n}\nfunction table(cols, rows, opt) {\n  opt = opt || {};\n  if (!rows.length) return '<p class=\"muted\">' + h(opt.empty || '자료 없음') + '</p>';\n  var head = cols.map(function (c) { return '<th class=\"' + (c.num ? 'num' : '') + '\">' + h(c.t) + '</th>'; }).join('');\n  var body = rows.map(function (r, i) {\n    var tds = cols.map(function (c) {\n      var v = c.f ? c.f(r) : h(r[c.k]);\n      return '<td class=\"' + (c.num ? 'num' : '') + (c.wrap ? ' wrap' : '') + '\">' + v + '</td>';\n    }).join('');\n    return '<tr' + (opt.onRow ? ' class=\"click\" data-i=\"' + i + '\"' : '') + '>' + tds + '</tr>';\n  }).join('');\n  return '<div class=\"scroll\"><table' + (opt.id ? ' id=\"' + opt.id + '\"' : '') + '><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';\n}\nfunction bindRows(id, rows, fn) {\n  var t = document.getElementById(id);\n  if (!t) return;\n  t.addEventListener('click', function (e) {\n    var tr = e.target.closest('tr[data-i]');\n    if (tr) fn(rows[+tr.getAttribute('data-i')]);\n  });\n}\n\n/* ───── 상단 ───── */\n/* 왼쪽 내비: 업무(매일) → 조회·분석 → 관리 순. 건수 배지는 홈 자료를 받은 뒤 채운다 */\nvar NAV_GROUPS = [\n  ['주간 현황', [['home', '채권관리 현황', 'home.view'], ['ws', '중도매인 조회', 'ws.view'], ['perf', '실적·4분면', 'ws.view']]],\n  ['담당자 업무', [['trend', '동향관리', 'trend.write'], ['credit', '채권관리', 'case.manage'], ['approvals', '기초자료 승인', 'master.edit']]],\n  ['관리', [['master', '기초자료', 'master.edit'], ['rules', '지표·신호 기준', 'settings.edit'], ['docs', '조치 안내·매뉴얼', 'docs.manage'], ['import', '가져오기·오류 점검', 'import.view'], ['users', '사용자·권한', 'user.manage'], ['audit', '변경·처리 이력', 'audit.view']]]\n]\nS.navCounts = S.navCounts || {};\nfunction renderNav() {\n  var cur = (location.hash.replace('#/', '').split('/')[0]) || 'home';\n  if (cur === 'case' || cur === 'checklist') cur = 'home';\n  document.getElementById('nav').innerHTML = NAV_GROUPS.map(function (g) {\n    var items = g[1].filter(function (i) { return can(i[2]); });\n    if (!items.length) return '';\n    return '<div class=\"grp\">' + g[0] + '</div>' + items.map(function (i) {\n      var c = S.navCounts[i[0]];\n      return '<a href=\"#/' + i[0] + '\" class=\"' + (cur === i[0] ? 'on' : '') + '\">' + i[1] + (c && c.n ? '<span class=\"cnt ' + (c.late ? 'hot' : 'warm') + '\">' + c.n + '</span>' : '') + '</a>';\n    }).join('');\n  }).join('');\n  document.getElementById('side').classList.remove('open');\n}\ndocument.getElementById('menuBtn').onclick = function () { document.getElementById('side').classList.toggle('open'); };\n/* 본문 2/3 + 1/3 배치: data-layout 그리드의 카드를 data-col 에 따라 주/보조 열로 옮긴다 */\nfunction applyLayouts() {\n  Array.prototype.forEach.call(document.querySelectorAll('[data-layout=\"main-aside\"]'), function (g) {\n    var wrap = document.createElement('div'); wrap.className = 'layout';\n    var main = document.createElement('div'); main.className = 'main'; var aside = document.createElement('div'); aside.className = 'aside';\n    Array.prototype.slice.call(g.children).forEach(function (c) { (c.getAttribute('data-col') === 'aside' ? aside : main).appendChild(c); });\n    wrap.appendChild(main); wrap.appendChild(aside); g.replaceWith(wrap);\n  });\n}\nfunction renderStatus(st, meta) {\n  st = st || {};\n  var ds = meta ? meta.dataState : st.data_status || '자료없음';\n  var parts = [\n    '기준일 <b>' + h(meta ? meta.baseDate : st.latest_base_date || '—') + '</b>',\n    meta && meta.period ? '집계기간 <b>' + h(meta.period) + '</b>' : '',\n    '최종 갱신 <b>' + h(st.last_updated_at || (meta && meta.lastUpdated) || '—') + '</b>',\n    '데이터 상태 ' + badge(ds) + (st.status_reasons && !meta ? ' <span>' + h(st.status_reasons) + '</span>' : '')\n  ];\n  document.getElementById('statusbar').innerHTML = parts.filter(Boolean).map(function (p) { return '<span>' + p + '</span>'; }).join('');\n}\n\n/* ───── 라우팅 ───── */\nfunction route() {\n  if (!S.boot) return;\n  document.getElementById('view').onclick = null;   // 이전 화면의 클릭 처리 제거\n  renderNav();\n  var p = location.hash.replace('#/', '').split('/');\n  var page = p[0] || 'home';\n  var fn = { home: pageHome, ws: p[1] ? function () { page360(decodeURIComponent(p[1]), p[2]); } : pageSearch,\n    master: p[1] ? function () { pageMasterDetail(decodeURIComponent(p[1])); } : pageMasterList,\n    approvals: pageApprovals, import: pageImport, users: pageUsers, audit: pageAudit,\n    trend: pageTrend, credit: pageCredit, rules: pageRules, docs: pageDocs, perf: function () { pagePerf(p[1] ? decodeURIComponent(p[1]) : ''); },\n    qa: function () { pageQa(p[1] ? decodeURIComponent(p[1]) : ''); },\n    checklist: function () { pageChecklist(decodeURIComponent(p[1] || '')); },\n    'case': function () { pageCase(decodeURIComponent(p[1] || '')); } }[page] || pageHome;\n  renderStatus(S.boot.status);\n  fn();\n}\nwindow.addEventListener('hashchange', route);\n\n/* ───── 홈: 주간 채권관리 현황 (스냅샷과 같은 화면) ───── */\nfunction pageHome() {\n  loading();\n  call('api_summary').then(function (d) {\n    S.boot.status = { latest_base_date: d.status.base_date, last_updated_at: d.status.last_updated, data_status: d.status.data_status, status_reasons: d.status.status_reasons };\n    renderStatus(S.boot.status, { baseDate: d.status.base_date, period: d.meta.period12, lastUpdated: d.status.last_updated, dataState: d.status.data_status });\n    S.navCounts = { trend: { n: d.kpis.trendWait, late: d.kpis.trendLate }, credit: { n: d.kpis.openActions + d.kpis.recheck, late: d.kpis.pendingApproval + d.kpis.recheckDue } };\n    renderNav();\n    view('<h1>중도매인 채권관리 현황 <span class=\"muted\" style=\"font-size:13px;font-weight:400\">기준일 ' + h(d.status.base_date) + ' · ' + h(d.generated_at) + ' 생성</span></h1><div id=\"summary\"></div>');\n    SummaryView.render(document.getElementById('summary'), d, { web: true, onChecklist: function (caseId) { location.hash = '#/checklist/' + encodeURIComponent(caseId); } });\n  }).catch(fail);\n}\n\n/* ───── 체크리스트: 인쇄 + 결과 입력(담당자) ───── */\nfunction pageChecklist(caseId) {\n  loading();\n  call('api_checklist', caseId).then(function (d) {\n    var ck = d.print;\n    var html = '<div class=\"row\" style=\"justify-content:space-between\"><h1>현장 확인 체크리스트 — ' + h(ck.case_id) + '</h1><div class=\"row\"><button id=\"ckPrint\">인쇄</button><a href=\"#/case/' + encodeURIComponent(caseId) + '\"><button>관리 건</button></a></div></div>';\n    html += '<div class=\"note\">경매사가 서면으로 체크해 오면 담당자가 아래에 결과를 입력합니다. 서면 스캔은 파일명 <code>CHECK_' + h(ck.case_id) + '_날짜.pdf</code> 로 드라이브 폴더에 넣으면 증빙으로 첨부됩니다.</div>';\n    html += '<div class=\"grid\" data-layout=\"main-aside\"><div class=\"card\"><h2>결과 입력</h2>' + (d.canWrite ? '<form class=\"f\" id=\"ckf\">' +\n      '<label>확인일*<input type=\"date\" name=\"checked_date\" required></label><label>현장 확인자(경매사)<input name=\"checker_name\" value=\"' + h(ck.auctioneer || '') + '\"></label><label>확인 상대방<input name=\"counterpart\"></label><label>서면 제출<select name=\"by_paper\"><option value=\"1\">예(서면 체크 입력)</option><option value=\"\">아니오(직접 확인)</option></select></label>' +\n      '<div class=\"full scroll\"><table><thead><tr><th>구분</th><th>항목</th><th>예</th><th>아니오</th><th>미확인</th><th>비고(사실만)</th></tr></thead><tbody>' +\n      ck.items.map(function (it) { return '<tr><td>' + h(it.category) + '</td><td class=\"wrap\">' + h(it.text) + (it.is_assumed ? ' <span class=\"badge b-warn\">가정</span>' : '') + '</td>' + ['예', '아니오', '미확인'].map(function (a) { return '<td><input type=\"radio\" name=\"a_' + h(it.item_id) + '\" value=\"' + a + '\"' + (a === '미확인' ? ' checked' : '') + '></td>'; }).join('') + '<td><input name=\"r_' + h(it.item_id) + '\" style=\"width:160px\"></td></tr>'; }).join('') + '</tbody></table></div>' +\n      '<label>결제계획<input name=\"payment_plan\"></label><label>영업 상황<input name=\"business_status\"></label><label class=\"full\">작성자 의견 (사실과 별도)<textarea name=\"opinion\"></textarea></label>' +\n      '<label>확인 결과 분류*<select name=\"result_class\"><option value=\"\">선택</option>' + d.resultClasses.map(function (r) { return '<option>' + h(r) + '</option>'; }).join('') + '</select></label><label>재점검일*<input type=\"date\" name=\"recheck_date\" required></label><label>후속 조치<input name=\"followup\"></label>' +\n      '<div class=\"full\"><span id=\"ckScore\" class=\"muted\"></span></div><div class=\"full\"><button class=\"primary\">동향보고로 저장</button></div></form>' : '<p class=\"muted\">결과 입력 권한이 없습니다(경매사·채권담당·관리자).</p>') + '</div>' +\n      '<div class=\"card\" data-col=\"aside\"><h2>인쇄용 서면</h2>' + SummaryView.checklistHtml(ck) + '</div></div>';\n    view(html);\n    document.getElementById('ckPrint').onclick = function () { window.print(); };\n    var f = document.getElementById('ckf');\n    if (f) {\n      var weights = {}; ck.items.forEach(function (it) { weights[it.item_id] = it.weight; });\n      var score = function () { var yes = 0; ck.items.forEach(function (it) { var v = f.querySelector('input[name=\"a_' + it.item_id + '\"]:checked'); if (v && v.value === '예') yes += it.weight; }); document.getElementById('ckScore').textContent = '체크 점수(가중) ' + yes + ' — 제안: ' + (yes >= 4 ? '연체 가능성 높음' : yes > 0 ? '보통' : '낮음') + ' (가정값 4점 기준, 결과 분류는 담당자가 결정)'; };\n      f.addEventListener('change', score); score();\n      f.onsubmit = function (e) {\n        e.preventDefault(); var o = formData(f); o.case_id = caseId; o.answers = {}; o.remarks = {};\n        ck.items.forEach(function (it) { var v = f.querySelector('input[name=\"a_' + it.item_id + '\"]:checked'); o.answers[it.item_id] = v ? v.value : '미확인'; o.remarks[it.item_id] = o['r_' + it.item_id] || ''; delete o['a_' + it.item_id]; delete o['r_' + it.item_id]; });\n        call('api_saveChecklist', o).then(function (r) { toast('동향보고 v' + r.report.version + ' 저장 (제안 ' + r.score.level + ')'); location.hash = '#/case/' + encodeURIComponent(caseId); }).catch(function (err) { toast(err.message, true); });\n      };\n    }\n  }).catch(fail);\n}\n\n/* ───── 업무 대기열(홈·대시보드 공용) ───── */\nfunction caseLink(r) { return '<a href=\"#/case/' + encodeURIComponent(r.case_id) + '\">' + h(r.case_id) + '</a>' + (r.is_recurrence ? ' <span class=\"badge b-warn\">재발</span>' : ''); }\nfunction wsLink(r) { return '<a href=\"#/ws/' + encodeURIComponent(r.wholesaler_id) + '\">' + h(r.wholesaler_id + ' ' + r.name) + '</a>'; }\nfunction sigBadges(list) {\n  return (list || []).map(function (s) {\n    var cls = { '위험': 'b-bad', '경고': 'b-bad', '주의': 'b-warn', '정보': 'b-info' }[s.severity] || 'b-info';\n    return '<span class=\"badge ' + cls + '\" title=\"' + h(JSON.stringify(s.evidence)) + '\">' + h(s.rule_id + ' ' + s.label) + (s.status === '보류' ? '(보류)' : '') + '</span>';\n  }).join(' ');\n}\nfunction evidenceText(s) {\n  var e = s.evidence || {};\n  switch (s.rule_id) {\n    case 'S01': return '회전율 ' + e.prevTurnover + '회 → ' + e.turnover + '회 (' + e.dropPct + '% 하락), 회수일수 ' + e.collectionDays + '일 · 기간 ' + e.period + ' (직전 ' + e.prevPeriod + ')';\n    case 'S02': return '잔액 ' + won(e.balance) + ' / 3개월 평균 ' + won(e.avgBalance) + ' = ' + e.ratio + '배 (+' + won(e.increase) + ')';\n    case 'S03': return e.stage + ': 연체 ' + won(e.overdueAmount) + ', ' + e.overdueDays + '일 (' + e.definition + ')';\n    case 'S04': return '전년 동월(동일 경과일) ' + e.yoyPct + '%, 직전 3개월 ' + e.ma3Pct + '%, 부류 전체 대비 ' + e.vsMarketPp + '%p (시장 ' + e.marketPct + '%)';\n    case 'S05': return '한도 사용률 ' + e.usagePct + '% = ' + won(e.balance) + ' / ' + won(e.limit) + ' (' + e.method + ')';\n    case 'S06': return e.kind + ' ' + e.label + ' 만기 ' + e.date + ' (D-' + e.dday + ')';\n    case 'S07': return '동시 신호: ' + (e.rules || []).join(', ');\n    default: return h(JSON.stringify(e));\n  }\n}\nfunction workQueueCards(w) {\n  if (!w) return '';\n  var html = '<div class=\"tiles\">' + tile('신규 조기 신호', w.newSignals.length, '건', '기준일 ' + (w.base || '—')) +\n    tile('동향 확인 대기', w.trendWait.length, '건', '지연 ' + w.trendWait.filter(function (x) { return x.overdue; }).length) +\n    tile('채권 조치 대기', w.actionWait.length, '건', '지연 ' + w.actionWait.filter(function (x) { return x.overdue; }).length) +\n    tile('재점검 예정', w.recheck.length, '건', '도래 ' + w.recheck.filter(function (x) { return x.due; }).length) +\n    (w.heldSignals ? tile('판정 보류 신호', w.heldSignals, '건', '자료 불완전') : '') + '</div>';\n  html += '<div class=\"grid\" data-layout=\"main-aside\">';\n  html += '<div class=\"card\"><h2>① 신규 조기 신호</h2>' + table([{ t: '중도매인', f: wsLink }, { t: '관리 건', f: caseLink }, { t: '신호', wrap: true, f: function (r) { return sigBadges(r.signals); } },\n    { t: '근거', wrap: true, f: function (r) { return r.signals.map(function (s) { return '<div class=\"muted\">' + h(evidenceText(s)) + '</div>'; }).join(''); } }, { t: '담당 경매사', k: 'auctioneer' }], w.newSignals, { empty: '신규 신호 없음' }) + '</div>';\n  html += '<div class=\"card\"><h2>② 동향 확인 대기·지연</h2>' + table([{ t: '관리 건', f: caseLink }, { t: '중도매인', f: wsLink }, { t: '기한', f: function (r) { return h(r.trend_due) + (r.overdue ? ' ' + badge('지연') : ''); } }, { t: '담당', k: 'auctioneer' }],\n    w.trendWait.slice().sort(function (a, b) { return (a.trend_due || '') < (b.trend_due || '') ? -1 : 1; }), { empty: '대기 없음' }) + '</div>';\n  html += '<div class=\"card\"><h2>③ 채권 조치 대기·지연</h2>' + table([{ t: '관리 건', f: caseLink }, { t: '중도매인', f: wsLink }, { t: '상태', f: function (r) { return badge(r.status); } },\n    { t: '조치', f: function (r) { return (r.openActions || 0) + '건' + (r.pendingApproval ? ' (승인 대기 ' + r.pendingApproval + ')' : '') + (r.overdue ? ' ' + badge('지연') : ''); } }, { t: '담당', k: 'owner' }], w.actionWait, { empty: '대기 없음' }) + '</div>';\n  html += '<div class=\"card\" data-col=\"aside\"><h2>⑤ 재점검 예정</h2>' + table([{ t: '관리 건', f: caseLink }, { t: '중도매인', f: wsLink }, { t: '재점검일', f: function (r) { return h(r.recheck_date) + (r.due ? ' ' + badge('도래') : ''); } }, { t: '결과', k: 'result_class' }], w.recheck, { empty: '예정 없음' }) + '</div>';\n  html += '<div class=\"card\" data-col=\"aside\"><h2>⑦ 담당자별 미처리</h2>' + table([{ t: '담당자', k: 'name' }, { t: '대기', num: true, k: 'waiting' }, { t: '지연', num: true, f: function (r) { return r.overdue ? '<span class=\"badge b-bad\">' + r.overdue + '</span>' : '0'; } }], w.byOwner, { empty: '미처리 없음' }) + '</div>';\n  return html + '</div>';\n}\nvar APP_WARN_DAYS = 60;\nfunction tile(k, v, unit, sub) {\n  return '<div class=\"tile\"><div class=\"k\">' + h(k) + '</div><div class=\"v\">' + num(v) + ' <small>' + h(unit) + '</small></div>' +\n    (sub ? '<div class=\"k\">' + h(sub) + '</div>' : '') + '</div>';\n}\n\n/* ───── 중도매인 조회 ───── */\nfunction pageSearch() {\n  view('<h1>중도매인 조회</h1><div class=\"row\"><input id=\"q\" placeholder=\"코드 또는 상호\" autofocus> <button class=\"primary\" id=\"go\">검색</button></div><div id=\"res\"></div>');\n  var go = function () {\n    document.getElementById('res').innerHTML = '<p class=\"muted\">검색 중…</p>';\n    call('api_searchWholesalers', document.getElementById('q').value).then(function (rows) {\n      document.getElementById('res').innerHTML = table([{ t: '코드', k: 'wholesaler_id' }, { t: '상호', k: 'name' },\n        { t: '영업 상태', f: function (r) { return badge(r.biz_status); } }, { t: '취급 부류', k: 'categories' }, { t: '담당 경매사', k: 'assignees' }],\n        rows, { id: 'wsTbl', onRow: true, empty: '조회 가능한 중도매인이 없습니다.' });\n      bindRows('wsTbl', rows, function (r) { location.hash = '#/ws/' + encodeURIComponent(r.wholesaler_id); });\n    }).catch(function (e) { document.getElementById('res').innerHTML = '<div class=\"note bad\">' + h(e.message) + '</div>'; });\n  };\n  document.getElementById('go').onclick = go;\n  document.getElementById('q').onkeydown = function (e) { if (e.key === 'Enter') go(); };\n  go();\n}\n\n/* ───── 중도매인 통합 상세 ───── */\nfunction page360(wsId, asOf) {\n  loading();\n  call('api_get360', wsId, asOf || '').then(function (d) {\n    var m = d.meta, w = d.ws, c = d.credit;\n    renderStatus(S.boot.status, { baseDate: m.baseDate, period: m.period, lastUpdated: m.lastUpdated, dataState: d.dataState.state });\n    var html = '<div class=\"rec-head\"><span class=\"t\">' + h(w.wholesaler_id + ' ' + w.name) + '</span>' + badge(w.biz_status_asof || w.biz_status_now) +\n      '<span class=\"f\">대표자 <b>' + h(w.representative) + '</b></span><span class=\"f\">담당 경매사 <b>' + (w.assignees.map(function (a) { return h(a.name); }).join(', ') || '미지정') + '</b></span><span class=\"f\">취급 부류 <b>' + h(w.categories) + '</b></span><span class=\"f\">거래 시작 <b>' + h(w.trade_start_date) + '</b></span>' +\n      '<span class=\"acts\"><label class=\"muted\">기준일 <input type=\"date\" id=\"asOf\" value=\"' + h(m.asOf) + '\"></label><button id=\"asOfGo\">조회</button>' +\n      (m.isPast ? ' <a href=\"#/ws/' + encodeURIComponent(w.wholesaler_id) + '\"><button>오늘 기준</button></a>' : '') +\n      (can('master.edit') ? ' <a href=\"#/master/' + encodeURIComponent(w.wholesaler_id) + '\"><button>기초자료 수정</button></a>' : '') + '</span></div>';\n    if (m.isPast) html += '<div class=\"note warn\">과거 시점 조회: ' + h(m.asOf) + ' 당시 유효했던 담보·보증·한도·영업 상태를 표시합니다.</div>';\n    if (d.dataState.state !== '정상') html += '<div class=\"note bad\"><b>판정 보류(자료 불완전)</b> — ' + d.dataState.reasons.map(h).join('<br>') + '</div>';\n\n    html += '<div class=\"tiles\">' +\n      tile('미수 잔액', c.ar_balance === null ? '—' : Math.round(c.ar_balance / 10000), '만원', c.ar_date ? c.ar_date + ' 기준' : '자료 없음') +\n      tile('연체금액', c.overdue_amount === null ? '—' : Math.round(c.overdue_amount / 10000), '만원', '최장 ' + num(c.max_overdue_days) + '일') +\n      tile('적용 한도(유형별)', d.limits.length, '건', '합산하지 않음') +\n      tile('기한 도래', d.expiring.length, '건', APP_WARN_DAYS + '일 이내') + '</div>';\n\n    html += '<div class=\"grid\" data-layout=\"main-aside\">';\n    html += '<div class=\"card\" data-col=\"aside\"><h2>개요</h2><dl class=\"kv\">' +\n      '<dt>대표자</dt><dd>' + h(w.representative) + '</dd><dt>영업 상태</dt><dd>' + badge(w.biz_status_asof || '—') + (w.biz_status_asof !== w.biz_status_now ? ' <span class=\"muted\">(현재 ' + h(w.biz_status_now) + ')</span>' : '') + '</dd>' +\n      '<dt>거래 시작일</dt><dd>' + h(w.trade_start_date) + '</dd><dt>취급 부류</dt><dd>' + h(w.categories) + '</dd>' +\n      '<dt>담당 경매사</dt><dd>' + (w.assignees.map(function (a) { return h(a.name); }).join(', ') || '<span class=\"muted\">미지정</span>') + '</dd>' +\n      (d.contacts ? '<dt>업무 연락처</dt><dd>' + (d.contacts.map(function (x) { return h(x.contact_type + ' ' + x.value); }).join('<br>') || '—') + '</dd>' : '') +\n      '</dl>' + (d.pendingVersions ? '<div class=\"note warn\">승인 대기 중인 기초자료 변경 ' + d.pendingVersions + '건(승인 전에는 반영되지 않음)</div>' : '') + '</div>';\n\n    html += '<div class=\"card\"><h2>채권 현황</h2><dl class=\"kv\"><dt>미수 잔액</dt><dd>' + won(c.ar_balance) + ' <span class=\"muted\">' + h(c.ar_date) + '</span></dd>' +\n      '<dt>연체금액</dt><dd>' + won(c.overdue_amount) + '</dd><dt>최장 연체일수</dt><dd>' + num(c.max_overdue_days) + '일</dd></dl>' +\n      '<div class=\"note\">' + h(c.overdue_note) + '</div>' +\n      '<h3>한도 (유형별, 합산 안 함)</h3>' + table([{ t: '유형', k: 'limit_type' }, { t: '금액', num: true, f: function (r) { return won(r.amount); } },\n        { t: '적용기간', f: function (r) { return h(r.valid_from) + ' ~ ' + h(r.valid_to === '9999-12-31' ? '' : r.valid_to); } },\n        { t: '버전', f: function (r) { return 'v' + h(r.version_no); } }, { t: '승인 근거', k: 'approval_basis', wrap: true }], d.limits, { empty: '유효한 한도 없음' }) +\n      '<div class=\"note\">' + h(c.limit_note) + '</div>' +\n      '<h3>최근 입금</h3>' + table([{ t: '입금일', k: 'receipt_date' }, { t: '반영일', k: 'posted_date' }, { t: '금액', num: true, f: function (r) { return won(r.amount); } }, { t: '구분', k: 'receipt_type' }], c.recentReceipts) + '</div>';\n\n    html += '<div class=\"card\" data-col=\"aside\"><h2>담보</h2>' + table([{ t: 'ID·버전', f: function (r) { return h(r.collateral_id) + ' v' + h(r.version_no); } }, { t: '종류', k: 'collateral_type' },\n      { t: '설정금액', num: true, f: function (r) { return won(r.set_amount); } }, { t: '평가금액', num: true, f: function (r) { return won(r.appraised_amount); } },\n      { t: '내부 인정금액', num: true, f: function (r) { return won(r.recognized_amount); } }, { t: '평가일', k: 'appraisal_date' }, { t: '만기', k: 'expiry_date' }, { t: '검토', k: 'review_status' }],\n      d.collaterals, { empty: '유효한 담보 없음' }) + '<div class=\"note\">설정금액은 회수 가능액이 아닙니다. 회수 가능성은 내부 기준에 따라 별도 판단합니다.</div>' +\n      '<h2 style=\"margin-top:12px\">연대보증</h2>' + table([{ t: 'ID·버전', f: function (r) { return h(r.guarantee_id) + ' v' + h(r.version_no); } }, { t: '여부', k: 'has_guarantee' },\n        { t: '범위', k: 'scope' }, { t: '보증한도', num: true, f: function (r) { return won(r.guarantee_limit); } },\n        { t: '기간', f: function (r) { return r.period_from ? h(r.period_from) + ' ~ ' + h(r.period_to) : '—'; } }, { t: '확인일', k: 'confirmed_date' }],\n        d.guarantees, { empty: '보증 정보 없음' }) +\n      (can('ws.viewGuarantorPII') ? '<div class=\"row\"><button id=\"pii\">보증인 상세 보기(조회 기록 남음)</button></div><div id=\"piiBox\"></div>' : '') + '</div>';\n\n    html += '<div class=\"card\"><h2>실적 요약 — 최근 12개월 구매금액</h2>' + trendBlock(d.trend) + '<div class=\"note\">' + h(d.turnoverNote) + '</div></div>';\n    if (can('work.view')) html += '<div class=\"card\" id=\"workCard\"><h2>지표·신호·관리 건</h2><p class=\"muted\">불러오는 중…</p></div>';\n\n    if (d.expiring.length) html += '<div class=\"card\" data-col=\"aside\"><h2>기한 도래</h2>' + table([{ t: '구분', k: 'kind' }, { t: 'ID', k: 'id' }, { t: '내용', k: 'label' }, { t: '만기', k: 'date' }, { t: 'D-day', num: true, f: function (r) { return 'D-' + r.dday; } }], d.expiring) + '</div>';\n    html += '<div class=\"card\" data-col=\"aside\"><h2>데이터 상태 (최근 30일)</h2>' + table([{ t: '일자', k: 'date' }, { t: '상태', f: function (r) { return badge(r.status); } }, { t: '내용', k: 'detail', wrap: true }], d.dataState.issues, { empty: '이상 없음' }) + '</div>';\n    if (d.evidence) html += '<div class=\"card\" data-col=\"aside\"><h2>증빙</h2>' + table([{ t: '파일', k: 'file_name' }, { t: '유형', k: 'doc_type' }, { t: '대상', k: 'target_id' }, { t: '등록', k: 'created_at' }], d.evidence) + '</div>';\n    if (d.history) html += '<div class=\"card\" data-col=\"aside\"><h2>변경 이력</h2>' + table([{ t: '일시', k: 'at' }, { t: '사용자', k: 'user_id' }, { t: '작업', k: 'action' }, { t: '대상', k: 'table_name' }, { t: '키', k: 'record_key' }, { t: '사유', k: 'reason', wrap: true }], d.history) + '</div>';\n    html += '</div>';\n    view(html);\n\n    document.getElementById('asOfGo').onclick = function () {\n      location.hash = '#/ws/' + encodeURIComponent(w.wholesaler_id) + '/' + document.getElementById('asOf').value;\n    };\n    var pb = document.getElementById('pii');\n    if (pb) pb.onclick = function () {\n      call('api_getGuarantors', w.wholesaler_id).then(function (rows) {\n        document.getElementById('piiBox').innerHTML = table([{ t: '참조', k: 'guarantor_ref' }, { t: '성명', k: 'name' }, { t: '관계', k: 'relation' }], rows, { empty: '보증인 없음' });\n      }).catch(function (e) { toast(e.message, true); });\n    };\n    bindTrend(d.trend);\n    if (can('work.view')) call('api_wsWork', w.wholesaler_id).then(function (k) {\n      var el = document.getElementById('workCard'); if (!el) return;\n      var mt = k.metrics.filter(function (m) { return ['회전율', '회전율_직전', '회수일수', '평균잔액', '한도사용률', '구매증감_전년', '구매증감_3개월', '구매증감_시장대비'].indexOf(m.metric) >= 0; });\n      el.innerHTML = '<h2>지표·신호·관리 건 <span class=\"muted\" style=\"font-size:12px\">기준일 ' + h(k.base_date) + '</span></h2>' +\n        '<h3>지표</h3>' + table([{ t: '지표', k: 'metric' }, { t: '부류', k: 'category' }, { t: '값', num: true, f: function (m) { return m.status === '정상' || m.status === '참고' ? metricVal(m) : '—'; } },\n          { t: '상태', f: function (m) { return badge(m.status) + (m.reason ? ' <span class=\"muted\">' + h(m.reason) + '</span>' : ''); } }, { t: '집계기간', f: function (m) { return h(m.period_from) + (m.period_to ? '~' + h(m.period_to) : ''); } }, { t: '산출 방식', k: 'method' }], mt, { empty: '지표 없음' }) +\n        '<h3>신호</h3>' + table([{ t: '신호', f: function (s) { return sigBadges([s]); } }, { t: '상태', f: function (s) { return badge(s.status); } }, { t: '최초', k: 'first_date' }, { t: '최근', k: 'last_date' }, { t: '근거', wrap: true, f: function (s) { return h(evidenceText(s)); } }, { t: '관리 건', f: function (s) { return s.case_id ? caseLink({ case_id: s.case_id }) : ''; } }], k.signals, { empty: '신호 없음' }) +\n        '<h3>관리 건</h3>' + table([{ t: '관리 건', f: caseLink }, { t: '상태', f: function (c) { return badge(c.status); } }, { t: '개시', k: 'opened_date' }, { t: '결과', k: 'result_class' }, { t: '종결 사유', k: 'close_reason' }, { t: '재점검일', k: 'recheck_date' }], k.cases, { empty: '관리 건 없음' }) +\n        (can('case.manage') && !k.cases.some(function (c) { return c.status !== '종결'; }) ? '<div class=\"row\"><button id=\"openCase\">관리 건 수동 개시</button></div>' : '');\n      var ob = document.getElementById('openCase');\n      if (ob) ob.onclick = function () { var r = prompt('개시 사유'); if (!r) return; call('api_openCase', w.wholesaler_id, r).then(function (x) { location.hash = '#/case/' + encodeURIComponent(x.caseRow.case_id); }).catch(function (e) { toast(e.message, true); }); };\n    }).catch(function (e) { var el = document.getElementById('workCard'); if (el) el.innerHTML = '<div class=\"note bad\">' + h(e.message) + '</div>'; });\n  }).catch(fail);\n}\nfunction metricVal(m) {\n  if (/증감|사용률/.test(m.metric)) return (m.value * 100).toFixed(1) + (m.metric === '구매증감_시장대비' ? '%p' : '%');\n  if (/회전율/.test(m.metric)) return Number(m.value).toFixed(2) + '회';\n  if (/일수/.test(m.metric)) return Number(m.value).toFixed(1) + '일';\n  return won(m.value);\n}\n\nfunction trendBlock(trend) {\n  if (!trend.length) return '<p class=\"muted\">집계 자료 없음</p>';\n  return '<div class=\"tabs\" id=\"catTabs\">' + ['전체', '과일', '채소'].map(function (c) {\n    return '<button data-c=\"' + c + '\" class=\"' + (S.cat === c ? 'on' : '') + '\">' + c + '</button>';\n  }).join('') + '</div><div id=\"trendChart\"></div><div id=\"trendTable\"></div>';\n}\nfunction bindTrend(trend) {\n  var tabs = document.getElementById('catTabs');\n  if (!tabs) return;\n  var draw = function () {\n    Array.prototype.forEach.call(tabs.children, function (b) { b.className = b.getAttribute('data-c') === S.cat ? 'on' : ''; });\n    document.getElementById('trendChart').innerHTML = trendSvg(trend, S.cat);\n    document.getElementById('trendTable').innerHTML = table([\n      { t: '월', f: function (r) { return h(r.ym) + (r.partial ? ' <span class=\"badge b-warn\">진행 중</span>' : ''); } },\n      { t: '구매금액', num: true, f: function (r) { return won(r.byCategory[S.cat].amount); } },\n      { t: '구매일수', num: true, f: function (r) { return num(r.byCategory[S.cat].purchaseDays); } },\n      { t: '전년 동월', num: true, f: function (r) { return r.partial ? won(r.mtd.byCategory[S.cat].prevAmount) + '<br><span class=\"muted\">' + h(r.mtd.basis) + ' ' + r.mtd.elapsedAuctionDays + '일</span>' : won(r.byCategory[S.cat].prevYearAmount); } },\n      { t: '전년 대비', num: true, f: function (r) { return r.partial ? pct(r.mtd.byCategory[S.cat].growth) : pct(r.byCategory[S.cat].yoy); } }\n    ], trend.slice().reverse());\n  };\n  tabs.onclick = function (e) { var c = e.target.getAttribute('data-c'); if (c) { S.cat = c; draw(); } };\n  draw();\n}\n/* 막대: 당해(series-1), 전년 대응 월(series-2). 진행 중인 월의 전년 막대는 동일 경과 경매일 기준 금액 */\nfunction trendSvg(trend, cat) {\n  var W = 760, H = 220, L = 56, B = 28, T = 10, R = 8;\n  var vals = trend.map(function (t) {\n    var b = t.byCategory[cat];\n    return { ym: t.ym, cur: b.amount || 0, prev: t.partial ? t.mtd.byCategory[cat].prevAmount : (b.prevYearAmount || 0), partial: t.partial };\n  });\n  var max = Math.max.apply(null, vals.map(function (v) { return Math.max(v.cur, v.prev); }).concat([1]));\n  var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;\n  var pw = (W - L - R) / vals.length, bw = Math.min(16, (pw - 8) / 2), y = function (v) { return T + (H - T - B) * (1 - v / nice); };\n  var g = '';\n  for (var i = 0; i <= 4; i++) {\n    var v = nice * i / 4, yy = y(v);\n    g += '<g class=\"grid\"><line x1=\"' + L + '\" x2=\"' + (W - R) + '\" y1=\"' + yy + '\" y2=\"' + yy + '\"/></g>' +\n      '<text class=\"axis\" x=\"' + (L - 6) + '\" y=\"' + (yy + 4) + '\" text-anchor=\"end\">' + Math.round(v / 10000).toLocaleString('ko-KR') + '</text>';\n  }\n  vals.forEach(function (v, i) {\n    var cx = L + pw * i + pw / 2;\n    var bar = function (x, val, cls, label) {\n      var top = y(val), hgt = Math.max(0, H - B - top), r = Math.min(4, hgt);\n      return '<path class=\"bar ' + cls + '\" d=\"M' + x + ',' + (H - B) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +\n        'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (H - B) + 'Z\"><title>' + label + '</title></path>';\n    };\n    g += bar(cx - bw - 1, v.prev, 's2', h(v.ym) + ' 전년 대응' + (v.partial ? '(동일 경과일)' : '') + ': ' + won(v.prev));\n    g += bar(cx + 1, v.cur, 's1', h(v.ym) + (v.partial ? '(진행 중)' : '') + ': ' + won(v.cur));\n    g += '<text class=\"axis\" x=\"' + cx + '\" y=\"' + (H - 10) + '\" text-anchor=\"middle\">' + v.ym.substring(2).replace('-', '.') + (v.partial ? '*' : '') + '</text>';\n  });\n  return '<div class=\"legend\"><span><i style=\"background:var(--series-1)\"></i>당해</span><span><i style=\"background:var(--series-2)\"></i>전년 대응 월</span><span>단위: 만원 · *진행 중인 월은 동일 경과 경매일 기준 비교</span></div>' +\n    '<svg class=\"chart\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"최근 12개월 ' + h(cat) + ' 구매금액\">' + g + '</svg>';\n}\n\n/* ───── 기초자료 ───── */\nfunction pageMasterList() {\n  view('<h1>기초자료</h1><div class=\"row\"><input id=\"q\" placeholder=\"코드 또는 상호\"><button id=\"go\">검색</button></div><div id=\"res\"></div>' +\n    '<div class=\"card\"><h2>신규 중도매인 등록</h2><form class=\"f\" id=\"newWs\">' +\n    '<label>중도매인코드*<input name=\"wholesaler_id\" required></label><label>상호*<input name=\"name\" required></label>' +\n    '<label>대표자*<input name=\"representative\" required></label><label>거래 시작일*<input type=\"date\" name=\"trade_start_date\" required></label>' +\n    '<label>취급 부류<select name=\"categories\"><option>과일,채소</option><option>과일</option><option>채소</option></select></label>' +\n    '<label>결제 그룹<input name=\"settle_group\"></label><label class=\"full\">변경 사유*<input name=\"reason\" required></label>' +\n    '<div class=\"full\"><button class=\"primary\">등록</button></div></form></div>');\n  var go = function () {\n    call('api_searchWholesalers', document.getElementById('q').value).then(function (rows) {\n      document.getElementById('res').innerHTML = table([{ t: '코드', k: 'wholesaler_id' }, { t: '상호', k: 'name' }, { t: '상태', f: function (r) { return badge(r.biz_status); } }, { t: '담당', k: 'assignees' }], rows, { id: 'mTbl', onRow: true });\n      bindRows('mTbl', rows, function (r) { location.hash = '#/master/' + encodeURIComponent(r.wholesaler_id); });\n    }).catch(fail);\n  };\n  document.getElementById('go').onclick = go;\n  document.getElementById('newWs').onsubmit = function (e) {\n    e.preventDefault();\n    var o = formData(e.target), reason = o.reason; delete o.reason;\n    call('api_createWholesaler', o, reason).then(function (r) { toast('등록했습니다: ' + r.wholesaler_id); location.hash = '#/master/' + encodeURIComponent(r.wholesaler_id); })\n      .catch(function (err) { toast(err.message, true); });\n  };\n  go();\n}\n\nvar VFORMS = {\n  M_COLLATERAL: { label: '담보', id: 'collateral_id', fields: [['collateral_type', '종류*'], ['set_amount', '설정금액*', 'num'], ['appraised_amount', '평가금액', 'num'],\n    ['appraisal_date', '평가일', 'date'], ['recognized_amount', '내부 인정금액', 'num'], ['confirmed_date', '확인일', 'date'], ['review_status', '검토 상태'], ['expiry_date', '만기일', 'date']] },\n  M_GUARANTEE: { label: '연대보증', id: 'guarantee_id', fields: [['has_guarantee', '보증 여부*', 'sel:있음,없음'], ['guarantor_ref', '보증인 참조(GR-…)'], ['scope', '보증 범위'],\n    ['guarantee_limit', '보증 한도', 'num'], ['period_from', '보증 시작', 'date'], ['period_to', '보증 종료', 'date'], ['confirmed_date', '확인일', 'date']] },\n  M_LIMIT: { label: '한도', id: 'limit_id', fields: [['limit_type', '한도 유형*', 'sel:기본한도,마감한도,추가한도'], ['amount', '금액*', 'num'], ['approval_basis', '승인 근거*'], ['approver', '승인자']] }\n};\nfunction vForm(table, existingIds) {\n  var d = VFORMS[table];\n  var inp = function (f) {\n    var t = f[2] || '';\n    if (t.indexOf('sel:') === 0) return '<label>' + f[1] + '<select name=\"' + f[0] + '\">' + t.substring(4).split(',').map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></label>';\n    return '<label>' + f[1] + '<input name=\"' + f[0] + '\" ' + (t === 'date' ? 'type=\"date\"' : t === 'num' ? 'inputmode=\"numeric\"' : '') + '></label>';\n  };\n  return '<form class=\"f vform\" data-t=\"' + table + '\"><label>대상<select name=\"' + d.id + '\"><option value=\"\">새 ' + d.label + '</option>' +\n    existingIds.map(function (i) { return '<option value=\"' + h(i) + '\">' + h(i) + ' 새 버전</option>'; }).join('') + '</select></label>' +\n    d.fields.map(inp).join('') + '<label>적용 시작일*<input type=\"date\" name=\"valid_from\" required></label><label>적용 종료일<input type=\"date\" name=\"valid_to\"></label>' +\n    '<label class=\"full\">변경 사유*<input name=\"reason\" required></label><div class=\"full\"><button class=\"primary\">승인 요청</button> <span class=\"muted\">관리자 승인 후 반영됩니다.</span></div></form>';\n}\nfunction versionTable(rows, idField) {\n  return table([{ t: 'ID', k: idField }, { t: '버전', f: function (r) { return 'v' + h(r.version_no); } }, { t: '상태', f: function (r) { return badge(r.approval_status); } },\n    { t: '적용기간', f: function (r) { return h(r.valid_from) + ' ~ ' + h(r.valid_to === '9999-12-31' ? '' : r.valid_to); } },\n    { t: '주요 값', wrap: true, f: function (r) { return h([r.collateral_type || r.limit_type || r.has_guarantee, r.set_amount !== undefined ? '설정 ' + won(r.set_amount) : '', r.recognized_amount ? '인정 ' + won(r.recognized_amount) : '', r.amount ? won(r.amount) : '', r.scope || ''].filter(Boolean).join(' / ')); } },\n    { t: '요청·승인', f: function (r) { return h(r.requested_by) + '<br>' + h(r.approved_by || '') + (r.reject_reason ? '<br>반려: ' + h(r.reject_reason) : ''); } }, { t: '사유', k: 'change_reason', wrap: true }],\n    rows.slice().sort(function (a, b) { return a[idField] < b[idField] ? -1 : a[idField] > b[idField] ? 1 : b.version_no - a.version_no; }));\n}\nfunction pageMasterDetail(wsId) {\n  loading();\n  call('api_masterDetail', wsId).then(function (d) {\n    var w = d.ws;\n    var ids = function (rows, f) { return rows.map(function (r) { return r[f]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); };\n    var html = '<div class=\"row\" style=\"justify-content:space-between\"><h1>기초자료 — ' + h(w.wholesaler_id + ' ' + w.name) + '</h1><a href=\"#/ws/' + encodeURIComponent(wsId) + '\">통합 상세 보기 →</a></div><div class=\"grid\">';\n    html += '<div class=\"card\"><h2>기본정보 <span class=\"muted\" style=\"font-size:12px\">행 버전 ' + h(w.row_version) + '</span></h2><form class=\"f\" id=\"basic\">' +\n      '<label>상호*<input name=\"name\" value=\"' + h(w.name) + '\"></label><label>대표자<input name=\"representative\" value=\"' + h(w.representative) + '\"></label>' +\n      '<label>취급 부류<input name=\"categories\" value=\"' + h(w.categories) + '\"></label><label>결제 그룹<input name=\"settle_group\" value=\"' + h(w.settle_group) + '\"></label>' +\n      '<label class=\"full\">비고<input name=\"note\" value=\"' + h(w.note) + '\"></label><label class=\"full\">변경 사유*<input name=\"reason\" required></label>' +\n      '<div class=\"full\"><button class=\"primary\">저장</button></div></form></div>';\n    html += '<div class=\"card\"><h2>영업 상태</h2>' + table([{ t: '상태', f: function (r) { return badge(r.status); } }, { t: '기간', f: function (r) { return h(r.valid_from) + ' ~ ' + h(r.valid_to === '9999-12-31' ? '' : r.valid_to); } }, { t: '사유', k: 'change_reason', wrap: true }], d.statusHist) +\n      '<form class=\"f\" id=\"status\"><label>새 상태<select name=\"status\">' + d.statuses.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></label>' +\n      '<label>적용 시작일*<input type=\"date\" name=\"valid_from\" required></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button>상태 변경</button></div></form></div>';\n    html += '<div class=\"card\"><h2>담당 경매사</h2>' + table([{ t: '경매사', k: 'user_id' }, { t: '기간', f: function (r) { return h(r.valid_from) + ' ~ ' + h(r.valid_to === '9999-12-31' ? '' : r.valid_to); } }], d.assignments) +\n      '<form class=\"f\" id=\"assign\"><label>경매사<select name=\"user_id\">' + d.auctioneers.map(function (u) { return '<option value=\"' + h(u.user_id) + '\">' + h(u.name) + '</option>'; }).join('') + '</select></label>' +\n      '<label>적용 시작일*<input type=\"date\" name=\"valid_from\" required></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button>담당 지정</button></div></form></div>';\n    ['M_LIMIT', 'M_COLLATERAL', 'M_GUARANTEE'].forEach(function (t) {\n      var rows = t === 'M_LIMIT' ? d.limits : t === 'M_COLLATERAL' ? d.collaterals : d.guarantees;\n      html += '<div class=\"card wide\"><h2>' + VFORMS[t].label + ' (버전 이력)</h2>' + versionTable(rows, VFORMS[t].id) + '<h3>변경 요청</h3>' + vForm(t, ids(rows, VFORMS[t].id)) +\n        (t === 'M_LIMIT' ? '<div class=\"note\">기본·마감·추가한도는 각각 별도로 관리하며 합산하지 않습니다(내부 규정 확인 전).</div>' : '') +\n        (t === 'M_COLLATERAL' ? '<div class=\"note\">설정금액·평가금액·내부 인정금액을 구분해 입력하세요. 설정금액을 회수 가능액으로 보지 않습니다.</div>' : '') + '</div>';\n    });\n    if (can('ws.viewGuarantorPII')) html += '<div class=\"card\"><h2>보증인 등록(개인정보)</h2><form class=\"f\" id=\"gr\"><label>성명*<input name=\"name\" required></label><label>관계<input name=\"relation\"></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button>등록 후 참조번호 받기</button></div></form><div id=\"grOut\"></div><div class=\"note\">보증인 개인정보는 별도 저장소에 보관하며 필요한 범위만 입력하세요.</div></div>';\n    if (can('evidence.upload')) html += '<div class=\"card\"><h2>증빙 업로드</h2>' + table([{ t: '파일', k: 'file_name' }, { t: '유형', k: 'doc_type' }, { t: '대상', k: 'target_id' }, { t: '해시', f: function (r) { return h(String(r.file_hash).substring(0, 12)); } }], d.evidence) +\n      '<form class=\"f\" id=\"ev\"><label>파일*<input type=\"file\" name=\"file\" required></label><label>문서 유형*<input name=\"doc_type\" placeholder=\"예: 감정평가서\" required></label><label>대상 ID<input name=\"target_id\" placeholder=\"예: C' + h(wsId) + '-01\"></label><div class=\"full\"><button>업로드</button> <span class=\"muted\">작은 파일 권장(요청 크기 제한 확인 필요)</span></div></form></div>';\n    html += '</div>';\n    view(html);\n\n    var reload = function (msg) { toast(msg); pageMasterDetail(wsId); };\n    var err = function (e) { toast(e.message, true); };\n    document.getElementById('basic').onsubmit = function (e) {\n      e.preventDefault(); var o = formData(e.target), reason = o.reason; delete o.reason;\n      call('api_updateWholesaler', wsId, o, w.row_version, reason).then(function () { reload('저장했습니다.'); }).catch(err);\n    };\n    document.getElementById('status').onsubmit = function (e) {\n      e.preventDefault(); var o = formData(e.target);\n      call('api_changeWsStatus', wsId, o.status, o.valid_from, o.reason).then(function () { reload('상태를 변경했습니다.'); }).catch(err);\n    };\n    document.getElementById('assign').onsubmit = function (e) {\n      e.preventDefault(); var o = formData(e.target);\n      call('api_setAssignment', wsId, o.user_id, o.valid_from, o.reason).then(function () { reload('담당을 지정했습니다.'); }).catch(err);\n    };\n    Array.prototype.forEach.call(document.querySelectorAll('form.vform'), function (f) {\n      f.onsubmit = function (e) {\n        e.preventDefault(); var o = formData(f), reason = o.reason; delete o.reason; o.wholesaler_id = wsId;\n        call('api_submitVersion', f.getAttribute('data-t'), o, reason).then(function () { reload('승인 요청했습니다.'); }).catch(err);\n      };\n    });\n    var gr = document.getElementById('gr');\n    if (gr) gr.onsubmit = function (e) {\n      e.preventDefault(); var o = formData(gr), reason = o.reason; delete o.reason;\n      call('api_createGuarantor', o, reason).then(function (r) { document.getElementById('grOut').innerHTML = '<div class=\"note\">참조번호 <b>' + h(r.guarantor_ref) + '</b> — 연대보증 변경 요청의 보증인 참조에 입력하세요.</div>'; }).catch(err);\n    };\n    var ev = document.getElementById('ev');\n    if (ev) ev.onsubmit = function (e) {\n      e.preventDefault(); var file = ev.elements.file.files[0];\n      if (!file) return;\n      var rd = new FileReader();\n      rd.onload = function () {\n        call('api_uploadEvidence', { wholesaler_id: wsId, file_name: file.name, mime_type: file.type, base64: String(rd.result).split(',')[1],\n          doc_type: ev.elements.doc_type.value, target_id: ev.elements.target_id.value }).then(function () { reload('업로드했습니다.'); }).catch(err);\n      };\n      rd.readAsDataURL(file);\n    };\n  }).catch(fail);\n}\n\n/* ───── 승인 대기 ───── */\nfunction pageApprovals() {\n  loading();\n  call('api_listPending').then(function (rows) {\n    var html = '<h1>기초자료 승인 대기</h1>' + (can('master.approve') ? '' : '<div class=\"note\">승인 권한이 없습니다. 본인 요청의 진행 상태만 확인할 수 있습니다.</div>');\n    html += table([{ t: '구분', k: 'tableLabel' }, { t: '중도매인', f: function (r) { return '<a href=\"#/master/' + encodeURIComponent(r.wholesaler_id) + '\">' + h(r.wholesaler_id) + '</a>'; } },\n      { t: 'ID·버전', f: function (r) { return h(r.id) + ' v' + h(r.version_no); } }, { t: '적용 시작', k: 'valid_from' },\n      { t: '내용', wrap: true, f: function (r) { return h(JSON.stringify(pickShown(r))); } }, { t: '요청', f: function (r) { return h(r.requested_by) + '<br>' + h(r.requested_at); } }, { t: '사유', k: 'change_reason', wrap: true },\n      { t: '처리', f: function (r, i) { return can('master.approve') ? '<button class=\"primary\" data-a=\"승인\" data-k=\"' + h(r.table + '|' + r.id + '|' + r.version_no) + '\">승인</button> <button class=\"danger\" data-a=\"반려\" data-k=\"' + h(r.table + '|' + r.id + '|' + r.version_no) + '\">반려</button>' : ''; } }],\n      rows, { empty: '승인 대기 없음' });\n    html += '<div class=\"note\">요청자 본인은 승인할 수 없습니다. 승인하면 같은 ID의 이전 버전은 새 버전 시작 전날로 종료됩니다.</div>';\n    view(html);\n    document.getElementById('view').onclick = function (e) {\n      var b = e.target.closest('button[data-a]'); if (!b) return;\n      var k = b.getAttribute('data-k').split('|'), a = b.getAttribute('data-a');\n      var reason = a === '반려' ? prompt('반려 사유를 입력하세요') : (prompt('승인 의견(선택)') || '');\n      if (a === '반려' && !reason) return;\n      b.disabled = true;\n      call('api_decideVersion', k[0], k[1], Number(k[2]), a, reason).then(function () { toast(a + ' 처리했습니다.'); pageApprovals(); })\n        .catch(function (err) { b.disabled = false; toast(err.message, true); });\n    };\n  }).catch(fail);\n}\nfunction pickShown(r) {\n  var o = {};\n  ['collateral_type', 'set_amount', 'appraised_amount', 'recognized_amount', 'expiry_date', 'limit_type', 'amount', 'approval_basis', 'has_guarantee', 'scope', 'guarantee_limit', 'period_to']\n    .forEach(function (k) { if (r[k] !== undefined && r[k] !== '') o[k] = r[k]; });\n  return o;\n}\n\n/* ───── 가져오기·오류 점검 ───── */\nfunction pageImport() {\n  loading();\n  call('api_importStatus').then(function (d) {\n    var st = d.status;\n    var html = '<div class=\"row\" style=\"justify-content:space-between\"><h1>데이터 가져오기·오류 점검</h1>' +\n      (can('import.run') ? '<button class=\"primary\" id=\"run\">지금 처리 실행</button>' : '') + '</div>';\n    html += '<div class=\"tiles\">' + tile('대기 파일', d.inboxCount, '개') + tile('최신 기준일', '', st.latest_base_date || '—') +\n      tile('데이터 이상', Number(st.issue_count || 0), '건') + tile('대사 불일치', d.recon.filter(function (r) { return r.result !== '일치'; }).length, '항목') + '</div>';\n    if (d.pipelineState) html += '<div class=\"note warn\">처리 진행 중/중단됨: 단계 ' + h(d.pipelineState.stage) + ' (실행 ' + h(d.pipelineState.runId) + '). 다시 실행하면 이 단계부터 이어서 처리합니다.</div>';\n    if (st.last_failure) html += '<div class=\"note bad\">최근 실패: ' + h(st.last_failure_at) + ' ' + h(st.last_failure) + '</div>';\n    html += '<div class=\"note\">원천 파일(CSV)을 Drive의 <b>01_가져오기_대기</b> 폴더에 넣으면 정기 처리 때 적재합니다. 같은 내용의 파일은 다시 적재하지 않고, 같은 거래번호의 다른 내용은 거부합니다(정정은 새 거래번호로).</div>';\n    html += '<div class=\"grid\"><div class=\"card wide\"><h2>가져오기 배치 (최근 100)</h2>' + table([\n      { t: '파일', k: 'file_name' }, { t: '상태', f: function (r) { return badge(r.status); } }, { t: '기간', f: function (r) { return h(r.date_from) + (r.date_to ? '~' + h(r.date_to) : ''); } },\n      { t: '읽음', num: true, f: function (r) { return num(r.row_count); } }, { t: '적재', num: true, f: function (r) { return num(r.accepted_count); } },\n      { t: '중복', num: true, f: function (r) { return num(r.duplicate_count); } }, { t: '거부', num: true, f: function (r) { return num(r.rejected_count); } },\n      { t: '관리합계', f: function (r) { return badge(r.control_result || '—'); } }, { t: '완료', k: 'finished_at' }], d.batches, { id: 'bTbl', onRow: true }) + '<div id=\"rej\"></div></div>';\n    var recSum = {};\n    d.recon.forEach(function (r) { var x = recSum[r.item] = recSum[r.item] || { item: r.item, n: 0, bad: 0 }; x.n++; if (r.result !== '일치') x.bad++; });\n    html += '<div class=\"card wide\"><h2>대사 결과 (최근 집계 ' + h(st.last_calc_run_id || '') + ')</h2>' +\n      table([{ t: '항목', k: 'item' }, { t: '대상 기간 수', num: true, k: 'n' }, { t: '불일치', num: true, k: 'bad' },\n        { t: '결과', f: function (r) { return badge(r.bad ? '불일치' : '일치'); } }], Object.keys(recSum).map(function (k) { return recSum[k]; })) +\n      '<h3>불일치 상세</h3>' + table([\n      { t: '항목', k: 'item' }, { t: '기간', k: 'period' }, { t: '원천', num: true, f: function (r) { return num(r.source_value); } },\n      { t: '시스템', num: true, f: function (r) { return num(r.system_value); } }, { t: '차이', num: true, f: function (r) { return num(r.diff); } },\n      { t: '결과', f: function (r) { return badge(r.result); } }, { t: '비고', k: 'note', wrap: true }],\n      d.recon.filter(function (r) { return r.result !== '일치'; }), { empty: '불일치 없음' }) + '</div>';\n    html += '<div class=\"card\"><h2>데이터 이상 (사유별)</h2>' + table([{ t: '사유', k: 'k' }, { t: '건수', num: true, k: 'v' }],\n      Object.keys(d.dqByReason).map(function (k) { return { k: k, v: d.dqByReason[k] }; }), { empty: '이상 없음' }) +\n      '<h3>최근 100건</h3>' + table([{ t: '중도매인', k: 'wholesaler_id' }, { t: '일자', k: 'date' }, { t: '상태', f: function (r) { return badge(r.status); } }, { t: '내용', k: 'detail', wrap: true }], d.dqRecent) + '</div>';\n    html += '<div class=\"card\"><h2>작업 로그 (최근 30)</h2>' + table([{ t: '단계', k: 'stage' }, { t: '상태', f: function (r) { return badge(r.status); } }, { t: '종료', k: 'finished_at' }, { t: '내용', k: 'message', wrap: true }], d.jobs) + '</div></div>';\n    view(html);\n    bindRows('bTbl', d.batches, function (b) {\n      call('api_batchRejects', b.batch_id).then(function (rows) {\n        document.getElementById('rej').innerHTML = '<h3>' + h(b.file_name) + ' — ' + h(b.message) + '</h3>' +\n          table([{ t: '행', num: true, k: 'line_no' }, { t: '오류', k: 'error_code' }, { t: '내용', k: 'error_message', wrap: true }, { t: '원문', k: 'raw_line', wrap: true }], rows, { empty: '거부된 행 없음' });\n      }).catch(function (e) { toast(e.message, true); });\n    });\n    var run = document.getElementById('run');\n    if (run) run.onclick = function () {\n      run.disabled = true; run.textContent = '처리 중…';\n      call('api_runPipelineNow').then(function (r) { toast('처리 ' + r.status + (r.message ? ': ' + r.message : '')); pageImport(); })\n        .catch(function (e) { toast(e.message, true); pageImport(); });\n    };\n  }).catch(fail);\n}\n\n/* ───── 사용자·권한 ───── */\nfunction pageUsers() {\n  loading();\n  call('api_listUsers').then(function (rows) {\n    var roles = { AUCTIONEER: '경매사', CREDIT: '채권담당', ADMIN: '관리자', VIEWER: '조회자' };\n    view('<h1>사용자·권한</h1>' + table([{ t: '이메일', k: 'user_id' }, { t: '이름', k: 'name' }, { t: '역할', f: function (r) { return h(roles[r.role] || r.role); } }, { t: '상태', f: function (r) { return badge(r.status === '사용' ? '정상' : '중지'); } },\n      { t: '접속코드', f: function (r) { return (r.has_code ? '발급됨 ' + h(r.code_issued_at || '') : '<span class=\"muted\">없음</span>') + (r.last_login ? '<br><span class=\"muted\">최근 로그인 ' + h(r.last_login) + '</span>' : ''); } },\n      { t: '', f: function (r) { return '<button data-code=\"' + h(r.user_id) + '\">' + (r.has_code ? '코드 재발급' : '코드 발급') + '</button>'; } }], rows, { id: 'uTbl', onRow: true }) +\n      '<div id=\"codeOut\"></div>' +\n      '<div class=\"card\"><h2>등록·수정</h2><form class=\"f\" id=\"uf\"><label>이메일*<input name=\"user_id\" required></label><label>이름*<input name=\"name\" required></label>' +\n      '<label>역할<select name=\"role\">' + Object.keys(roles).map(function (k) { return '<option value=\"' + k + '\">' + roles[k] + '</option>'; }).join('') + '</select></label>' +\n      '<label>상태<select name=\"status\"><option>사용</option><option>중지</option></select></label><label class=\"full\">변경 사유*<input name=\"reason\" required></label>' +\n      '<div class=\"full\"><button class=\"primary\">저장</button></div></form><div class=\"note\">권한은 서버에서 확인합니다. 저장소(시트)는 사용자에게 직접 공유하지 마세요.</div></div>');\n    bindRows('uTbl', rows, function (u) {\n      var f = document.getElementById('uf');\n      f.user_id.value = u.user_id; f.name.value = u.name; f.role.value = u.role; f.status.value = u.status;\n    });\n    document.getElementById('uf').onsubmit = function (e) {\n      e.preventDefault(); var o = formData(e.target), reason = o.reason; delete o.reason;\n      call('api_saveUser', o, reason).then(function () { toast('저장했습니다.'); pageUsers(); }).catch(function (err) { toast(err.message, true); });\n    };\n    document.getElementById('view').onclick = function (e) {\n      var b = e.target.closest('button[data-code]'); if (!b) return; e.stopPropagation();\n      var reason = prompt('발급 사유'); if (!reason) return;\n      call('api_issueAccessCode', b.getAttribute('data-code'), reason).then(function (r) {\n        document.getElementById('codeOut').innerHTML = '<div class=\"note warn\"><b>' + h(r.name) + ' (' + h(r.user_id) + ')</b> 접속코드: <code style=\"font-size:18px\">' + h(r.code) + '</code><br>' + h(r.note) + '</div>';\n      }).catch(function (err) { toast(err.message, true); });\n    };\n  }).catch(fail);\n}\n\n/* ───── 이력 ───── */\nfunction pageAudit() {\n  view('<h1>변경·처리 이력</h1><div class=\"tabs\"><button id=\"tA\" class=\"on\">변경 이력</button><button id=\"tB\">접근 기록</button></div>' +\n    '<form class=\"row\" id=\"af\"><input name=\"table\" placeholder=\"테이블(예: M_LIMIT)\"><input name=\"key\" placeholder=\"키 포함(예: W0123)\"><input name=\"user\" placeholder=\"사용자\">' +\n    '<input type=\"date\" name=\"from\"><input type=\"date\" name=\"to\"><button>조회</button></form><div id=\"ares\"></div>');\n  var loadA = function () {\n    call('api_auditLog', formData(document.getElementById('af'))).then(function (rows) {\n      document.getElementById('ares').innerHTML = table([{ t: '일시', k: 'at' }, { t: '사용자', k: 'user_id' }, { t: '작업', k: 'action' }, { t: '테이블', k: 'table_name' }, { t: '키', k: 'record_key' },\n        { t: '사유', k: 'reason', wrap: true }, { t: '변경 후', wrap: true, f: function (r) { return '<span class=\"muted\">' + h(String(r.after_json).substring(0, 160)) + '</span>'; } }], rows);\n    }).catch(fail);\n  };\n  var loadB = function () {\n    call('api_accessLog', {}).then(function (rows) {\n      document.getElementById('ares').innerHTML = table([{ t: '일시', k: 'at' }, { t: '사용자', k: 'user_id' }, { t: '작업', k: 'action' }, { t: '대상', k: 'target' }, { t: '결과', f: function (r) { return badge(r.result === '허용' ? '정상' : '실패'); } }, { t: '내용', k: 'detail', wrap: true }], rows);\n    }).catch(fail);\n  };\n  document.getElementById('af').onsubmit = function (e) { e.preventDefault(); loadA(); };\n  document.getElementById('tA').onclick = function () { this.className = 'on'; document.getElementById('tB').className = ''; document.getElementById('af').style.display = ''; loadA(); };\n  document.getElementById('tB').onclick = function () { this.className = 'on'; document.getElementById('tA').className = ''; document.getElementById('af').style.display = 'none'; loadB(); };\n  loadA();\n}\n\n/* ───── 동향관리 (경매사) ───── */\nfunction pageTrend() {\n  loading();\n  call('api_workQueues').then(function (w) {\n    var html = '<h1>동향관리</h1><div class=\"note\">자동 신호(왼쪽)와 실제 확인 결과(동향보고)는 분리됩니다. 확인 결과 분류: ' + ['일시적 변화', '지속 관찰', '채권 검토 필요', '판정 보류(자료 부족)'].join(' / ') + '</div>';\n    var rows = w.trendWait.concat(w.newSignals.filter(function (n) { return !w.trendWait.some(function (t) { return t.case_id === n.case_id; }); }));\n    html += '<div class=\"card\"><h2>신호 목록 · 동향 확인 대기</h2>' + table([{ t: '중도매인', f: wsLink }, { t: '관리 건', f: caseLink }, { t: '상태', f: function (r) { return badge(r.status); } },\n      { t: '신호', wrap: true, f: function (r) { return sigBadges(r.signals); } }, { t: '근거 수치', wrap: true, f: function (r) { return r.signals.map(function (s) { return '<div class=\"muted\">' + h(evidenceText(s)) + '</div>'; }).join(''); } },\n      { t: '확인 기한', f: function (r) { return h(r.trend_due) + (r.overdue ? ' ' + badge('지연') : ''); } }, { t: '', f: function (r) { return '<a href=\"#/case/' + encodeURIComponent(r.case_id) + '\"><button class=\"primary\">보고 작성</button></a>'; } }], rows, { empty: '확인 대기 신호 없음' }) + '</div>';\n    html += '<div class=\"card\"><h2>재점검 예정</h2>' + table([{ t: '관리 건', f: caseLink }, { t: '중도매인', f: wsLink }, { t: '재점검일', f: function (r) { return h(r.recheck_date) + (r.due ? ' ' + badge('도래') : ''); } }], w.recheck, { empty: '없음' }) + '</div>';\n    view(html);\n  }).catch(fail);\n}\n\n/* ───── 채권관리 (채권담당) ───── */\nfunction pageCredit() {\n  loading();\n  Promise.all([call('api_workQueues'), call('api_pendingApprovals')]).then(function (res) {\n    var w = res[0], ap = res[1];\n    var html = '<h1>채권관리</h1>' + workQueueCards(w);\n    html += '<div class=\"card\" style=\"margin-top:12px\"><h2>조치 승인 대기</h2>' + table([{ t: '관리 건', f: caseLink }, { t: '중도매인', f: wsLink }, { t: '조치', f: function (r) { return h(r.action_type); } }, { t: '내용', k: 'content', wrap: true },\n      { t: '기한', k: 'due_date' }, { t: '요청', f: function (r) { return h(r.requested_by) + '<br><span class=\"muted\">' + h(r.requested_at) + '</span>'; } },\n      { t: '처리', f: function (r) { return r.canDecide ? '<button class=\"primary\" data-ap=\"' + h(r.approval_id) + '\" data-d=\"승인\">승인</button> <button class=\"danger\" data-ap=\"' + h(r.approval_id) + '\" data-d=\"반려\">반려</button>' : '<span class=\"muted\">승인권자 대기</span>'; } }], ap, { empty: '승인 대기 없음' }) +\n      '<div class=\"note\">승인 요청 시점의 한도·담보·지표·매뉴얼 버전은 관리 건 상세의 \"판단 근거 스냅샷\"에 고정됩니다.</div></div>';\n    view(html);\n    document.getElementById('view').onclick = function (e) {\n      var b = e.target.closest('button[data-ap]'); if (!b) return;\n      var d = b.getAttribute('data-d'), reason = d === '반려' ? prompt('반려 사유') : (prompt('승인 의견(선택)') || '');\n      if (d === '반려' && !reason) return;\n      b.disabled = true;\n      call('api_decideApproval', b.getAttribute('data-ap'), d, reason).then(function () { toast(d + ' 처리'); pageCredit(); }).catch(function (err) { b.disabled = false; toast(err.message, true); });\n    };\n  }).catch(fail);\n}\n\n/* ───── 관리 건 상세 ───── */\nfunction pageCase(caseId) {\n  loading();\n  call('api_caseDetail', caseId).then(function (d) {\n    var c = d.caseRow, g = d.guide;\n    var html = '<div class=\"rec-head\"><span class=\"t\">관리 건 ' + h(c.case_id) + '</span>' + badge(c.status) + (c.is_recurrence ? ' <span class=\"badge b-warn\">재발 ← ' + h(c.parent_case_id) + '</span>' : '') +\n      '<span class=\"f\">중도매인 <b>' + wsLink(Object.assign({ name: c.ws.name }, c.ws)) + '</b></span><span class=\"f\">담당 경매사 <b>' + h(c.auctioneer_name || '미지정') + '</b></span><span class=\"f\">채권 책임자 <b>' + h(c.owner_name || '미지정') + '</b></span>' +\n      '<span class=\"f\">개시 <b>' + h(c.opened_date) + '</b></span><span class=\"f\">동향 기한 <b>' + h(c.trend_due || '—') + '</b></span><span class=\"f\">조치 기한 <b>' + h(c.action_due || '—') + '</b></span><span class=\"f\">재점검 <b>' + h(c.recheck_date || '—') + '</b></span>' +\n      (c.result_class ? '<span class=\"f\">확인 결과 <b>' + h(c.result_class) + '</b></span>' : '') + (c.close_reason ? '<span class=\"f\">종결 <b>' + h(c.close_reason) + ' (' + h(c.closed_date) + ')</b></span>' : '') +\n      '<span class=\"acts\">' + ((c.status === '접수' || c.status === '동향확인중') && can('trend.write') ? '<a href=\"#/checklist/' + encodeURIComponent(caseId) + '\"><button class=\"primary\">체크리스트 입력·인쇄</button></a>' : '') + '<a href=\"#/ws/' + encodeURIComponent(c.wholesaler_id) + '\"><button>통합 상세</button></a></span></div>';\n    html += '<div class=\"grid\" data-layout=\"main-aside\">';\n    // 신호\n    html += '<div class=\"card\" data-col=\"aside\"><h2>연결된 신호</h2>' + table([{ t: '신호', f: function (s) { return sigBadges([s]); } }, { t: '상태', f: function (s) { return badge(s.status); } }, { t: '최초', k: 'first_date' }, { t: '최근 판정', k: 'last_date' },\n      { t: '근거 수치', wrap: true, f: function (s) { return h(evidenceText(s)); } }, { t: '판정 기준', wrap: true, f: function (s) { return '<span class=\"muted\">' + h(Object.keys(s.params).filter(function (k) { return k.indexOf(s.rule_id) === 0; }).map(function (k) { return k + '=' + s.params[k]; }).join(', ')) + '</span>' + (s.false_alarm_reason ? '<br>' + h(s.false_alarm_reason) : ''); } },\n      { t: '', f: function (s) { return (s.status === '연결' || s.status === '발생') && can('signal.flag') ? '<button data-fa=\"' + h(s.signal_id) + '\">오탐 ' + (can('case.manage') ? '확정' : '의견') + '</button>' : ''; } }], d.signals, { empty: '신호 없음(수동 개시)' }) + '</div>';\n    // 절차 안내\n    html += '<div class=\"card\"><h2>조치 안내 (매뉴얼 근거)</h2><div class=\"note\">[기준] 데이터 기준일 ' + h(g.basis.data_base_date) + ' (' + h(g.basis.data_status) + ') · 매뉴얼: ' + (g.basis.manual_versions.map(h).join(', ') || '등록된 문서 없음') + '</div>' +\n      '<h3>1. 확인된 상황</h3>' + (g.facts.length ? '<ul>' + g.facts.map(function (f) { return '<li>' + h(f) + '</li>'; }).join('') + '</ul>' : '<p class=\"muted\">—</p>') +\n      '<h3>2. 추가 확인사항</h3>' + (g.furtherChecks.length ? '<ul>' + g.furtherChecks.map(function (f) { return '<li>' + h(f) + '</li>'; }).join('') + '</ul>' : '<p class=\"muted\">—</p>') +\n      '<h3>3·4·5. 적용 가능한 절차 · 근거 · 필요 서식</h3>' +\n      (g.procedures.length ? g.procedures.map(function (p) {\n        var head = '<p><b>' + h(p.label) + '</b> <span class=\"muted\">(' + h(p.situation_code) + ')</span> ' + badge(p.status) + '</p>';\n        if (p.status === '확인 필요') return head + '<div class=\"note warn\">' + h(p.message) + '</div>';\n        return head + (p.status === '충돌' ? '<div class=\"note bad\">' + h(p.message) + '</div>' : '') + table([{ t: '단계', num: true, k: 'step_no' }, { t: '절차', k: 'content', wrap: true }, { t: '확인사항', k: 'checks', wrap: true },\n          { t: '근거', wrap: true, f: function (s) { return h(s.doc_name) + ' ' + h(s.version) + ' ' + h(s.article) + (s.page ? ' p.' + h(s.page) : '') + '<br><span class=\"muted\">시행 ' + h(s.effective_from) + '</span>'; } },\n          { t: '서식', wrap: true, f: function (s) { return s.forms.map(function (f) { return h(f.form_name) + ' ' + h(f.version) + (f.required ? '*' : '') + (f.available ? ' <button data-blank=\"' + h(f.form_doc_id) + '\">빈 서식</button>' + (can('form.draft') ? ' <button class=\"primary\" data-draft=\"' + h(f.form_doc_id) + '\">작성본 만들기</button>' : '') : ' <span class=\"badge b-warn\">서식 파일 없음</span>'); }).join('<br>') || '—'; } }], p.steps);\n      }).join('') : '<div class=\"note warn\">해당하는 상황 코드가 없습니다. 절차를 임의로 만들지 않습니다.</div>') +\n      '<h3>6. 다음 할 일</h3><ul>' + g.nextSteps.map(function (n) { return '<li>' + h(n) + '</li>'; }).join('') + '</ul></div>';\n    // 동향보고\n    html += '<div class=\"card\"><h2>동향보고</h2>' + table([{ t: '버전', f: function (t) { return 'v' + h(t.version) + ' ' + badge(t.status); } }, { t: '작성', f: function (t) { return h(t.writer_name) + ' ' + h(t.written_date); } }, { t: '확인', f: function (t) { return h(t.checked_date) + ' ' + h(t.check_method) + (t.counterpart ? ' / ' + h(t.counterpart) : ''); } },\n      { t: '확인된 사실', wrap: true, f: function (t) { return '<ol style=\"margin:0;padding-left:18px\">' + t.facts.map(function (f) { return '<li>' + h(f.text) + '</li>'; }).join('') + '</ol>'; } }, { t: '영업·결제계획', wrap: true, f: function (t) { return h(t.business_status) + (t.payment_plan ? '<br>결제계획: ' + h(t.payment_plan) : ''); } },\n      { t: '작성자 의견', k: 'opinion', wrap: true }, { t: '결과', f: function (t) { return h(t.result_class) + (t.recheck_date ? '<br><span class=\"muted\">재점검 ' + h(t.recheck_date) + '</span>' : ''); } }], d.trends, { empty: '작성된 동향보고 없음' });\n    if (c.canWriteTrend && c.status !== '종결' && c.status !== '재점검대기') {\n      var draft = d.trends.filter(function (t) { return t.status === '임시'; })[0] || {};\n      html += '<h3>동향보고 작성 ' + (draft.report_id ? '<span class=\"muted\">(임시 저장본 이어서)</span>' : '') + '</h3>' +\n        '<div class=\"row\"><button data-tform=\"0\">빈 양식 받기</button><button data-tform=\"1\">기본정보 채운 양식 받기</button><span class=\"muted\">공식 원본은 시스템 입력입니다. 파일로 제출하면 확인일·결과 분류·재점검일만 화면에 입력하세요.</span></div>' +\n        '<form class=\"f\" id=\"tf\"><input type=\"hidden\" name=\"report_id\" value=\"' + h(draft.report_id || '') + '\">' +\n        '<div class=\"full note\">A. 자동 채움: 중도매인 ' + h(c.ws.wholesaler_id + ' ' + c.ws.name) + ' · 관리건 ' + h(c.case_id) + ' · 신호 ' + d.signals.map(function (s) { return s.rule_id; }).join(',') + ' · 작성일 ' + h(d.today) + '</div>' +\n        '<label>B. 확인일*<input type=\"date\" name=\"checked_date\" value=\"' + h(draft.checked_date || '') + '\"></label><label>확인 방법*<select name=\"check_method\">' + ['방문', '전화', '면담', '자료 수령', '기타'].map(function (m) { return '<option' + (draft.check_method === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label>' +\n        '<label>확인 상대방(직위)<input name=\"counterpart\" value=\"' + h(draft.counterpart || '') + '\"></label>' +\n        '<label class=\"full\">C. 확인된 사실* (한 줄에 하나, 의견은 쓰지 않음)<textarea name=\"facts\">' + h((draft.facts || []).map(function (f) { return f.text; }).join('\\n')) + '</textarea></label>' +\n        '<label>D. 영업 상황<input name=\"business_status\" value=\"' + h(draft.business_status || '') + '\"></label><label>결제계획(금액·일자·방법)<input name=\"payment_plan\" value=\"' + h(draft.payment_plan || '') + '\"></label>' +\n        '<label class=\"full\">E. 작성자 의견 (사실과 별도)<textarea name=\"opinion\">' + h(draft.opinion || '') + '</textarea></label>' +\n        '<label>F. 확인 결과 분류*<select name=\"result_class\"><option value=\"\">선택</option>' + d.resultClasses.map(function (r) { return '<option' + (draft.result_class === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>' +\n        '<label>재점검일*<input type=\"date\" name=\"recheck_date\" value=\"' + h(draft.recheck_date || '') + '\"></label>' +\n        '<label class=\"full\">G. 추가 확인사항<input name=\"further_checks\" value=\"' + h(draft.further_checks || '') + '\"></label><label>후속 조치<input name=\"followup\" value=\"' + h(draft.followup || '') + '\"></label><label>후속 기한<input type=\"date\" name=\"followup_due\" value=\"' + h(draft.followup_due || '') + '\"></label>' +\n        '<div class=\"full\"><button type=\"button\" id=\"tfDraft\">임시 저장</button> <button class=\"primary\" type=\"button\" id=\"tfSubmit\">제출</button> <span class=\"muted\">제출 후 수정은 새 버전으로 저장됩니다.</span></div></form>';\n    }\n    html += '</div>';\n    // 조치\n    html += '<div class=\"card\"><h2>조치·승인</h2>' + table([{ t: '유형', k: 'action_type' }, { t: '내용', k: 'content', wrap: true }, { t: '담당', k: 'owner_name' }, { t: '기한', k: 'due_date' }, { t: '승인', f: function (a) { return a.needs_approval ? badge(a.approval_status) : '<span class=\"muted\">불필요</span>'; } },\n      { t: '상태', f: function (a) { return badge(a.status) + (a.done_date ? '<br><span class=\"muted\">' + h(a.done_date) + '</span>' : ''); } }, { t: '결과', k: 'result', wrap: true },\n      { t: '', f: function (a) { if (!can('case.manage') || a.status === '완료') return ''; var b = ''; if (a.needs_approval && a.approval_status === '미요청') b += '<button data-req=\"' + h(a.action_id) + '\">승인 요청</button> '; if (a.needs_approval && a.approval_status === '반려') b += '<button data-req=\"' + h(a.action_id) + '\">재요청</button> '; if (!a.needs_approval || a.approval_status === '승인') b += '<button class=\"primary\" data-done=\"' + h(a.action_id) + '\">결과 등록</button> '; b += '<button data-final=\"' + h(a.action_id) + '\">제출본 첨부</button>'; return b; } }], d.actions, { empty: '등록된 조치 없음' });\n    if (can('case.manage') && c.status !== '종결' && c.status !== '재점검대기') {\n      html += '<h3>조치 등록</h3><form class=\"f\" id=\"af\"><label>조치 유형*<select name=\"action_type\">' + d.actionTypes.map(function (a) { return '<option value=\"' + h(a.type) + '\">' + h(a.type) + (a.needsApproval ? ' (승인 필요)' : '') + '</option>'; }).join('') + '</select></label>' +\n        '<label>처리 기한*<input type=\"date\" name=\"due_date\" required></label><label>상황 코드<input name=\"situation_code\" value=\"' + h((g.situations[0] || {}).situation_code || '') + '\"></label><label class=\"full\">조치 내용*<textarea name=\"content\" required></textarea></label><div class=\"full\"><button class=\"primary\">등록</button></div></form>';\n      if (c.status !== '접수' && c.status !== '동향확인중') html += '<h3>종결</h3><form class=\"f\" id=\"cf\"><label>종결 사유*<select name=\"reason\">' + ['해소 확인', '일시적 변화로 확인', '조치 완료', '거래 종료', '기타'].map(function (r) { return '<option>' + r + '</option>'; }).join('') + '</select></label><label>재점검일 (비우면 +30일 가정값)<input type=\"date\" name=\"recheck\"></label><label class=\"full\">요약<input name=\"summary\"></label><div class=\"full\"><button class=\"danger\">종결(재점검 대기로)</button> <span class=\"muted\">열린 조치가 있거나 승인 미완료면 종결할 수 없습니다.</span></div></form>';\n    }\n    if (can('case.manage') && c.status === '재점검대기') html += '<div class=\"row\"><button class=\"primary\" id=\"recheck\">재점검 실행</button><span class=\"muted\">활성 신호가 없으면 종결, 있으면 동향 확인으로 재개합니다.</span></div>';\n    html += '</div>';\n    // 첨부·근거·이력\n    html += '<div class=\"card\" data-col=\"aside\"><h2>첨부</h2>' + table([{ t: '구분', f: function (a) { return badge(a.kind) + (a.locked ? ' 🔒' : ''); } }, { t: '파일', wrap: true, f: function (a) { return '<a href=\"https://drive.google.com/file/d/' + h(a.file_id) + '/view\" target=\"_blank\" rel=\"noopener\">' + h(a.file_name) + '</a>'; } }, { t: '서식', f: function (a) { return h(a.form_doc_id) + ' ' + h(a.form_version); } }, { t: '등록', k: 'created_at' }], d.attachments, { empty: '첨부 없음' }) +\n      '<div class=\"note\">원본 서식(승인본) / 작성본(자동 입력) / 제출본(최종·잠금)을 구분합니다. 원본은 덮어쓰지 않습니다.</div></div>';\n    html += '<div class=\"card\" data-col=\"aside\"><h2>판단 근거 스냅샷</h2>' + (d.basisList.length ? d.basisList.map(function (b) {\n      return '<details><summary>' + h(b.created_at) + ' — ' + h((b.settings || {}).note || '') + ' <span class=\"muted\">(데이터 기준일 ' + h(b.base_date) + ')</span></summary>' +\n        '<dl class=\"kv\"><dt>한도</dt><dd>' + (b.limits || []).map(function (l) { return h(l.limit_type) + ' v' + h(l.version_no) + ' ' + won(l.amount); }).join('<br>') + '</dd>' +\n        '<dt>담보</dt><dd>' + (b.collaterals || []).map(function (x) { return h(x.collateral_type) + ' v' + h(x.version_no) + ' 인정 ' + won(x.recognized_amount); }).join('<br>') + '</dd>' +\n        '<dt>지표</dt><dd>' + (b.metrics || []).filter(function (m) { return m.status === '정상'; }).slice(0, 8).map(function (m) { return h(m.metric) + ' ' + metricVal(m); }).join('<br>') + '</dd>' +\n        '<dt>매뉴얼</dt><dd>' + (b.docs || []).map(function (x) { return h(x.doc_id + ' ' + x.version); }).join('<br>') + '</dd><dt>기준값</dt><dd class=\"muted\">' + h(JSON.stringify((b.settings || {}).settings || {})) + '</dd></dl></details>';\n    }).join('') : '<p class=\"muted\">승인 요청·종결 시 생성</p>') + '</div>';\n    html += '<div class=\"card\" data-col=\"aside\"><h2>타임라인</h2>' + table([{ t: '일시', k: 'at' }, { t: '전환', f: function (x) { return h(x.from_status || '—') + ' → ' + badge(x.to_status); } }, { t: '사유', k: 'reason', wrap: true }, { t: '사용자', k: 'user_name' }], d.history) + '</div>';\n    html += '</div>';\n    view(html);\n\n    var err = function (e) { toast(e.message, true); }, reload = function (m) { toast(m); pageCase(caseId); };\n    var tf = document.getElementById('tf');\n    var collect = function () { var o = formData(tf); o.case_id = caseId; o.facts = String(o.facts || '').split('\\n').map(function (x) { return x.trim(); }).filter(Boolean); return o; };\n    if (tf) {\n      document.getElementById('tfDraft').onclick = function () { call('api_saveTrend', collect(), false).then(function () { reload('임시 저장'); }).catch(err); };\n      document.getElementById('tfSubmit').onclick = function () { if (!confirm('제출하면 관리 건 상태가 바뀝니다. 제출할까요?')) return; call('api_saveTrend', collect(), true).then(function () { reload('제출 완료'); }).catch(err); };\n    }\n    var af = document.getElementById('af'); if (af) af.onsubmit = function (e) { e.preventDefault(); var o = formData(af); o.case_id = caseId; call('api_createAction', o).then(function () { reload('조치 등록'); }).catch(err); };\n    var cf = document.getElementById('cf'); if (cf) cf.onsubmit = function (e) { e.preventDefault(); var o = formData(cf); call('api_closeCase', caseId, o.reason, o.recheck, o.summary).then(function () { reload('종결 처리'); }).catch(err); };\n    var rk = document.getElementById('recheck'); if (rk) rk.onclick = function () { call('api_recheckCase', caseId, prompt('재점검 메모(선택)') || '').then(function (r) { reload(r.reopened ? '활성 신호가 있어 재개했습니다' : '종결했습니다'); }).catch(err); };\n    document.getElementById('view').onclick = function (e) {\n      var b = e.target.closest('button[data-req],button[data-done],button[data-final],button[data-fa],button[data-blank],button[data-draft],button[data-tform]'); if (!b) return;\n      if (b.hasAttribute('data-req')) call('api_requestApproval', b.getAttribute('data-req')).then(function () { reload('승인 요청'); }).catch(err);\n      else if (b.hasAttribute('data-done')) { var r = prompt('결과 내용'); if (r) call('api_completeAction', b.getAttribute('data-done'), r, '').then(function () { reload('결과 등록'); }).catch(err); }\n      else if (b.hasAttribute('data-fa')) { var fr = prompt('오탐 사유'); if (fr) call('api_flagFalseAlarm', b.getAttribute('data-fa'), fr, can('case.manage')).then(function () { reload('처리했습니다'); }).catch(err); }\n      else if (b.hasAttribute('data-blank')) call('api_blankForm', b.getAttribute('data-blank')).then(function (r) { window.open(r.url, '_blank'); }).catch(err);\n      else if (b.hasAttribute('data-draft')) call('api_createDraftForm', caseId, b.getAttribute('data-draft')).then(function (r) { toast('작성본 생성: ' + r.attach.file_name + (r.filled === 'copy_only' ? ' (자동 입력 불가 형식 — 복사만)' : '')); pageCase(caseId); }).catch(err);\n      else if (b.hasAttribute('data-tform')) call('api_trendFormText', caseId, b.getAttribute('data-tform') === '1').then(function (r) { downloadText(r.file_name, r.text); }).catch(err);\n      else if (b.hasAttribute('data-final')) {\n        var inp = document.createElement('input'); inp.type = 'file';\n        inp.onchange = function () { var f = inp.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () {\n          call('api_uploadFinal', caseId, { file_name: f.name, mime_type: f.type, base64: String(rd.result).split(',')[1], kind: '제출본', ref_type: 'ACTION', ref_id: b.getAttribute('data-final') }).then(function () { reload('제출본 등록'); }).catch(err); }; rd.readAsDataURL(f); };\n        inp.click();\n      }\n    };\n  }).catch(fail);\n}\nfunction downloadText(name, text) {\n  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);\n}\n\n/* ───── 지표·신호 기준 ───── */\nfunction pageRules() {\n  loading();\n  call('api_settings').then(function (d) {\n    var html = '<h1>지표·신호 기준 관리</h1><div class=\"note\">값은 드라이브의 기준 시트(M_SETTING)에만 저장됩니다. <b>가정값</b>은 내부 기준 확인 전 임시값입니다. 변경 전후는 이력에 남고, 각 신호에는 판정 시점의 기준값이 함께 저장됩니다.</div>';\n    html += table([{ t: '키', k: 'key' }, { t: '설명', k: 'label', wrap: true }, { t: '값', f: function (r) { return '<b>' + h(r.value) + '</b> ' + h(r.unit); } }, { t: '구분', f: function (r) { return r.is_assumed ? '<span class=\"badge b-warn\">가정값</span>' : '<span class=\"badge b-ok\">확정</span>'; } }, { t: '비고', k: 'note', wrap: true },\n      { t: '', f: function (r) { return d.canEdit ? '<button data-k=\"' + h(r.key) + '\">변경</button>' : ''; } }], d.settings, { id: 'stTbl' });\n    if (d.canEdit) html += '<div class=\"row\"><button id=\"blBtn\">매트릭스 세로축 기준선 재산정(전년 연간 중앙값)</button><button id=\"ntBtn\">일일 요약 메일 지금 발송(설정 NOTIFY_EMAIL=예 일 때)</button></div>';\n    html += '<div class=\"card\" style=\"margin-top:12px\" id=\"btCard\"><h2>백테스트·그림자 운영</h2><p class=\"muted\">불러오는 중…</p></div>';\n    if (d.canEdit) html += '<div class=\"card\" style=\"margin-top:12px\"><h2>시뮬레이션 (저장 안 함)</h2><div class=\"row\"><input id=\"simKey\" placeholder=\"키 (예: S01_DROP_PCT)\"><input id=\"simVal\" placeholder=\"값\"><button id=\"simGo\">최신 기준일 신호 건수 보기</button></div><div id=\"simOut\"></div><div class=\"note\">저장하지 않고 최신 기준일만 계산합니다. 과거 기준일 전체는 위 백테스트를 사용하세요.</div></div>';\n    view(html);\n    var byKey = {}; d.settings.forEach(function (s) { byKey[s.key] = s; });\n    document.getElementById('view').onclick = function (e) {\n      var b = e.target.closest('button[data-k]'); if (!b) return;\n      var k = b.getAttribute('data-k'), cur = byKey[k];\n      var v = prompt(cur.label + '\\n현재 ' + cur.value + (d.choices[k] ? '\\n허용: ' + d.choices[k].join(' | ') : ''), cur.value); if (v === null) return;\n      var confirmed = confirm('내부 기준으로 확정된 값입니까? (취소 = 가정값으로 표시)');\n      var reason = prompt('변경 사유(근거 문서·조항)'); if (!reason) return;\n      call('api_updateSetting', k, v, !confirmed, confirmed ? reason : cur.note, reason).then(function () { toast('변경했습니다. 다음 정기 처리부터 적용됩니다.'); pageRules(); }).catch(function (err) { toast(err.message, true); });\n    };\n    renderBacktest(d.canEdit);\n    var nt = document.getElementById('ntBtn'); if (nt) nt.onclick = function () { call('api_sendDailySummaryNow').then(function (r) { toast(r.sent ? r.sent + '명 발송' : '발송 안 함: ' + (r.skipped || '')); }).catch(function (e) { toast(e.message, true); }); };\n    var bl = document.getElementById('blBtn'); if (bl) bl.onclick = function () { bl.disabled = true; call('api_computeMatrixBaseline').then(function (r) { toast('기준선 ' + r.value + '회 저장'); pageRules(); }).catch(function (e) { bl.disabled = false; toast(e.message, true); }); };\n    var sg = document.getElementById('simGo');\n    if (sg) sg.onclick = function () {\n      var o = {}; var k = document.getElementById('simKey').value.trim(); if (k) o[k] = document.getElementById('simVal').value.trim();\n      call('api_simulateSettings', o).then(function (r) {\n        document.getElementById('simOut').innerHTML = '<p>기준일 ' + h(r.base_date) + ' · 중도매인 ' + r.total + '명 · ' + h(r.note) + '</p>' + table([{ t: '신호', k: 'k' }, { t: '건수', num: true, k: 'v' }], Object.keys(r.counts).map(function (x) { return { k: x + ' ' + (d.rules[x] || {}).label, v: r.counts[x] }; }), { empty: '신호 없음' }) +\n          table([{ t: '중도매인', k: 'wholesaler_id' }, { t: '상호', k: 'name' }, { t: '신호', k: 'rules' }], r.wholesalersWithSignals, { empty: '' });\n      }).catch(function (err) { toast(err.message, true); });\n    };\n  }).catch(fail);\n}\n\n/* ───── 매뉴얼·서식 ───── */\nfunction pageDocs() {\n  loading();\n  call('api_docs').then(function (d) {\n    var html = '<h1>매뉴얼·서식 관리</h1><div class=\"note\">원본 서식은 드라이브 <b>10_원본서식</b> 폴더에 두고 파일 ID로 버전을 등록합니다. 서식 안의 자리표시자 {{상호}} {{대표자}} {{중도매인코드}} {{관리건ID}} {{기준일}} {{미수금}} {{연체금액}} {{연체일수}} {{담당경매사}} {{작성일}} {{작성자}} 가 작성본에서 치환됩니다(Google 문서·텍스트 파일).</div>';\n    html += '<div class=\"grid\"><div class=\"card span2\"><h2>문서·버전</h2>' + table([{ t: 'ID', k: 'doc_id' }, { t: '문서명', k: 'doc_name' }, { t: '유형', k: 'doc_type' }, { t: '소관', k: 'owner_dept' },\n      { t: '버전', wrap: true, f: function (r) { return r.versions.map(function (v) { return h(v.version) + ' (시행 ' + h(v.effective_from) + (v.effective_to !== '9999-12-31' ? '~' + h(v.effective_to) : '') + ') <a href=\"https://drive.google.com/file/d/' + h(v.file_id) + '/view\" target=\"_blank\" rel=\"noopener\">파일</a>'; }).join('<br>') || '<span class=\"badge b-warn\">버전 없음</span>'; } }], d.docs, { empty: '등록 문서 없음' }) + '</div>';\n    html += '<div class=\"card span2\"><h2>상황 코드 → 절차 → 서식</h2>' + d.situations.map(function (s) {\n      var p = s.procedures;\n      return '<p><b>' + h(s.label) + '</b> <span class=\"muted\">' + h(s.situation_code) + ' · 조건 ' + h(s.condition_json) + '</span> ' + badge(p.status) + '</p>' + (p.status === '정상' || p.status === '충돌' ? (p.status === '충돌' ? '<div class=\"note bad\">' + h(p.message) + '</div>' : '') + table([{ t: '단계', num: true, k: 'step_no' }, { t: '절차', k: 'content', wrap: true }, { t: '근거', wrap: true, f: function (x) { return h(x.doc_name + ' ' + x.version + ' ' + x.article) + (x.page ? ' p.' + h(x.page) : ''); } }, { t: '서식', f: function (x) { return x.forms.map(function (f) { return h(f.form_name) + (f.required ? '*' : ''); }).join(', ') || '—'; } }], p.steps) : '<div class=\"note warn\">' + h(p.message) + '</div>' +\n        ((p.candidates || []).length ? '<p class=\"muted\" style=\"font-size:13px\">근거 후보 문서: ' + p.candidates.map(function (c) { return '<a href=\"https://drive.google.com/file/d/' + h(c.file_id) + '/view\" target=\"_blank\" rel=\"noopener\">' + h(c.doc_name + ' ' + c.version) + '</a>'; }).join(' · ') + '</p>' : ''));\n    }).join('') + '</div>';\n    if (d.canManage) {\n      html += '<div class=\"card\"><h2>매뉴얼 폴더 한 번에 등록</h2><form class=\"row\" id=\"mf\"><input name=\"folder\" placeholder=\"드라이브 폴더 이름 또는 ID (예: 기초 자료)\" style=\"flex:1\" required><button class=\"primary\">폴더 등록</button></form><div class=\"note\">HWP·PDF·Google 문서를 문서·버전으로 등록합니다. 파일명의 \"(2023.12.29 개정)\"이 시행일이 됩니다. 본문은 읽지 않으므로 조항·쪽수는 아래 \"절차 단계 등록\"에서 입력하세요.</div><div id=\"mfOut\"></div></div>';\n      html += '<div class=\"card\"><h2>문서 등록</h2><form class=\"f\" id=\"df\"><label>문서 ID*<input name=\"doc_id\" required placeholder=\"DOC-…/FORM-…\"></label><label>문서명*<input name=\"doc_name\" required></label><label>유형<select name=\"doc_type\"><option>매뉴얼</option><option>서식</option></select></label><label>소관<input name=\"owner_dept\"></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button class=\"primary\">등록</button></div></form></div>';\n      html += '<div class=\"card\"><h2>버전 등록</h2><form class=\"f\" id=\"vf\"><label>문서 ID*<input name=\"doc_id\" required></label><label>버전*<input name=\"version\" required placeholder=\"v2\"></label><label>시행일*<input type=\"date\" name=\"effective_from\" required></label><label>Drive 파일 ID*<input name=\"file_id\" required></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button class=\"primary\">등록</button> <span class=\"muted\">같은 문서의 이전 버전은 시행 전날로 종료됩니다.</span></div></form></div>';\n      html += '<div class=\"card\"><h2>상황 코드 등록</h2><form class=\"f\" id=\"sf\"><label>코드*<input name=\"situation_code\" required placeholder=\"SIT-…\"></label><label>상황명*<input name=\"label\" required></label><label class=\"full\">조건 JSON*<input name=\"condition_json\" required placeholder=\\'{\"signals\":[\"S03\"],\"min_overdue_days\":30}\\'></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button class=\"primary\">등록</button></div></form></div>';\n      html += '<div class=\"card\"><h2>절차 단계 등록</h2><form class=\"f\" id=\"pf\"><label>상황 코드*<input name=\"situation_code\" required></label><label>단계<input name=\"step_no\" value=\"1\"></label><label>근거 문서 ID*<input name=\"doc_id\" required></label><label>문서 버전*<input name=\"doc_version\" required></label><label>조항<input name=\"article\"></label><label>쪽수<input name=\"page\"></label><label class=\"full\">절차 내용*<input name=\"content\" required></label><label class=\"full\">확인사항<input name=\"checks\"></label><label class=\"full\">필요 서식 ID (쉼표 구분)<input name=\"forms\"></label><label class=\"full\">사유*<input name=\"reason\" required></label><div class=\"full\"><button class=\"primary\">등록</button></div></form></div>';\n    }\n    html += '</div>';\n    view(html);\n    var bind = function (id, fn, prep) { var f = document.getElementById(id); if (f) f.onsubmit = function (e) { e.preventDefault(); var o = formData(f), r = o.reason; delete o.reason; if (prep) prep(o); call(fn, o, r).then(function () { toast('등록했습니다'); pageDocs(); }).catch(function (err) { toast(err.message, true); }); }; };\n    bind('df', 'api_registerDoc'); bind('vf', 'api_registerDocVersion'); bind('sf', 'api_registerSituation');\n    var mf = document.getElementById('mf'); if (mf) mf.onsubmit = function (e) { e.preventDefault(); document.getElementById('mfOut').textContent = '등록 중…'; call('api_registerManualFolder', mf.folder.value).then(function (r) { toast('등록 완료'); pageDocs(); }).catch(function (err) { toast(err.message, true); document.getElementById('mfOut').textContent = ''; }); };\n    bind('pf', 'api_registerProcedure', function (o) { o.form_doc_ids = String(o.forms || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); delete o.forms; });\n  }).catch(fail);\n}\n\n/* ───── 백테스트·그림자 운영 ───── */\nfunction renderBacktest(canEdit) {\n  call('api_backtestStatus').then(function (b) {\n    var el = document.getElementById('btCard'); if (!el) return;\n    var sh = b.shadow;\n    var html = '<h2>백테스트·그림자 운영</h2>';\n    html += '<h3>그림자 운영 집계 (최근 ' + sh.weeks + '주, ' + h(sh.from) + '~' + h(sh.to) + ')</h3><div class=\"tiles\">' + tile('전체 신호', sh.total_signals, '건') +\n      tile('불필요한 경보 비율', sh.false_alarm_rate === null ? '—' : (sh.false_alarm_rate * 100).toFixed(0), '%', '오탐 ' + sh.false_alarm + ' + 일시적 변화 ' + sh.temporary_change_cases) + '</div>' +\n      table([{ t: '경매사', k: 'auctioneer' }, { t: '주당 경보', num: true, k: 'per_week' }, { t: '합계', num: true, k: 'total' }], sh.per_auctioneer_week, { empty: '신호 없음' }) +\n      table([{ t: '규칙', f: function (r) { return h(r.rule_id + ' ' + r.label); } }, { t: '전체', num: true, k: 'total' }, { t: '활성', num: true, k: 'active' }, { t: '해소', num: true, k: 'resolved' }, { t: '오탐 확정', num: true, k: 'false_alarm' }], sh.by_rule, { empty: '' }) + '<div class=\"note\">' + h(sh.note) + '</div>';\n    html += '<h3>정답 표본 (과거 실제 사안 — 익명 코드·시점만)</h3>' + table([{ t: '중도매인', k: 'wholesaler_id' }, { t: '발생일', k: 'event_date' }, { t: '유형', k: 'event_type' }, { t: '비고', k: 'note', wrap: true },\n      { t: '', f: function (r) { return canEdit ? '<button class=\"danger\" data-tdel=\"' + h(r.truth_id) + '\">삭제</button>' : ''; } }], b.truth, { empty: '표본 없음 — 표본이 없으면 포착률·적중률을 계산할 수 없습니다(경보량만 산출)' });\n    if (canEdit) html += '<form class=\"row\" id=\"tf2\"><input name=\"wholesaler_id\" placeholder=\"중도매인코드\" required><input type=\"date\" name=\"event_date\" required><input name=\"event_type\" placeholder=\"사안 유형\" required><input name=\"note\" placeholder=\"비고(개인정보·금액 금지)\"><button class=\"primary\">표본 추가</button></form>';\n    html += '<h3>백테스트 실행 기록</h3>' + (b.current ? '<div class=\"note warn\">진행 중: ' + h(b.current) + ' <button id=\"btCont\">이어서 실행</button></div>' : '') +\n      (canEdit && !b.current ? '<form class=\"row\" id=\"btf\"><label class=\"muted\">시작일 <input type=\"date\" name=\"dateFrom\"></label><label class=\"muted\">표본 간격(경매일) <input name=\"sampleDays\" value=\"5\" style=\"width:60px\"></label><label class=\"muted\">임시 기준값(JSON) <input name=\"overrides\" placeholder=\\'{\"S01_DROP_PCT\":\"40\"}\\' style=\"width:220px\"></label><button class=\"primary\">백테스트 시작</button></form>' : '');\n    html += table([{ t: '실행', k: 'run_id' }, { t: '상태', f: function (r) { return badge(r.status) + (r.message ? ' <span class=\"muted\">' + h(r.message) + '</span>' : ''); } }, { t: '기간', f: function (r) { return h(r.date_from) + '~' + h(r.date_to) + ' (' + h(r.sample_days) + '경매일마다, ' + h(r.dates_done) + '/' + h(r.dates_total) + ')'; } },\n      { t: '임시 기준', wrap: true, f: function (r) { return h(JSON.stringify((r.params || {}).overrides || {})); } },\n      { t: '결과', wrap: true, f: function (r) { var s = r.summary; if (!s) return '—'; return '표본 ' + s.truth_count + ' · 포착률 ' + (s.capture_rate === null ? '—' : (s.capture_rate * 100).toFixed(0) + '%') + ' · 적중률 ' + (s.precision === null ? '—' : (s.precision * 100).toFixed(0) + '%') + ' · 선행 중앙값 ' + (s.lead_days_median === null ? '—' : s.lead_days_median + '일') + ' · 경보 ' + s.alerts + '건(주당 ' + s.alerts_per_week.toFixed(1) + ')' + (s.caveat ? '<br><span class=\"badge b-warn\">표본 부족</span> <span class=\"muted\">' + h(s.caveat) + '</span>' : '') + '<br><span class=\"muted\">경매사별 주당: ' + s.alerts_per_auctioneer_week.map(function (x) { return h(x.auctioneer) + ' ' + x.per_week; }).join(', ') + '</span>'; } }], b.runs, { empty: '실행 기록 없음' });\n    html += '<div class=\"note\">측정: 포착률(사안 전 ' + '기준일수 이내 신호) · 적중률(신호 후 기준일수 이내 사안) · 선행기간 · 경매사 1인당 주간 경보량. 운영 전 4~8주(가정) 그림자 운영으로 오탐 비율을 확인한 뒤 기준값을 확정하세요.</div>';\n    el.innerHTML = html;\n    var err = function (e) { toast(e.message, true); };\n    var tf2 = document.getElementById('tf2'); if (tf2) tf2.onsubmit = function (e) { e.preventDefault(); var r = prompt('등록 사유'); if (!r) return; call('api_saveTruth', formData(tf2), r).then(function () { toast('추가'); renderBacktest(canEdit); }).catch(err); };\n    var btf = document.getElementById('btf'); if (btf) btf.onsubmit = function (e) { e.preventDefault(); var o = formData(btf); try { o.overrides = o.overrides ? JSON.parse(o.overrides) : {}; } catch (x) { return toast('임시 기준값 JSON 형식 오류', true); } toast('실행 중… 시간이 걸리면 트리거로 이어서 처리됩니다'); call('api_startBacktest', o).then(function () { renderBacktest(canEdit); }).catch(err); };\n    var bc = document.getElementById('btCont'); if (bc) bc.onclick = function () { call('api_continueBacktest').then(function () { renderBacktest(canEdit); }).catch(err); };\n    el.onclick = function (e) { var b2 = e.target.closest('button[data-tdel]'); if (!b2) return; var r = prompt('삭제 사유'); if (!r) return; call('api_deleteTruth', b2.getAttribute('data-tdel'), r).then(function () { renderBacktest(canEdit); }).catch(err); };\n  }).catch(function (e) { var el = document.getElementById('btCard'); if (el) el.innerHTML = '<div class=\"note bad\">' + h(e.message) + '</div>'; });\n}\n\n/* ───── 실적관리 ───── */\nS.perfTab = S.perfTab || 'summary';\nfunction pagePerf(wsId) {\n  if (wsId) return pagePerfDetail(wsId);\n  loading();\n  call('api_performance').then(function (p) {\n    var m = p.meta;\n    renderStatus(S.boot.status, { baseDate: m.baseDate, period: m.period12, lastUpdated: m.lastUpdated, dataState: m.dataStatus });\n    var html = '<h1>실적관리</h1>' + (m.partialNote ? '<div class=\"note warn\">' + h(m.partialNote) + '</div>' : '') +\n      '<div class=\"tabs\" id=\"pTabs\">' + [['summary', '요약'], ['trend', '추이'], ['collect', '회수'], ['compare', '비교'], ['matrix', '거래·회수 매트릭스']].map(function (t) { return '<button data-t=\"' + t[0] + '\" class=\"' + (S.perfTab === t[0] ? 'on' : '') + '\">' + t[1] + '</button>'; }).join('') +\n      '<span style=\"flex:1\"></span><div class=\"tabs\" id=\"pCats\">' + ['전체', '과일', '채소'].map(function (c) { return '<button data-c=\"' + c + '\" class=\"' + (S.cat === c ? 'on' : '') + '\">' + c + '</button>'; }).join('') + '</div></div><div id=\"pBody\"></div>';\n    view(html);\n    var draw = function () {\n      Array.prototype.forEach.call(document.getElementById('pTabs').querySelectorAll('button[data-t]'), function (b) { b.className = b.getAttribute('data-t') === S.perfTab ? 'on' : ''; });\n      Array.prototype.forEach.call(document.getElementById('pCats').children, function (b) { b.className = b.getAttribute('data-c') === S.cat ? 'on' : ''; });\n      var body = document.getElementById('pBody');\n      if (S.perfTab === 'matrix') { body.innerHTML = '<p class=\"muted\">불러오는 중…</p>'; call('api_matrix', S.cat).then(function (mx) { body.innerHTML = matrixHtml(mx); bindRows('mxTbl', mx.points, function (r) { location.hash = '#/ws/' + encodeURIComponent(r.wholesaler_id); }); }).catch(function (e) { body.innerHTML = '<div class=\"note bad\">' + h(e.message) + '</div>'; }); return; }\n      body.innerHTML = perfTabHtml(p, S.perfTab, S.cat);\n      bindRows('pTbl', p.rows, function (r) { location.hash = '#/perf/' + encodeURIComponent(r.wholesaler_id); });\n      var cb = document.getElementById('csvBtn');\n      if (cb) cb.onclick = function () { cb.disabled = true; call('api_exportCompare', S.cat).then(function (r) { downloadText(r.file_name, '\\uFEFF' + r.text); cb.disabled = false; }).catch(function (e) { cb.disabled = false; toast(e.message, true); }); };\n    };\n    document.getElementById('pTabs').onclick = function (e) { var t = e.target.getAttribute('data-t'); if (t) { S.perfTab = t; draw(); } };\n    document.getElementById('pCats').onclick = function (e) { var c = e.target.getAttribute('data-c'); if (c) { S.cat = c; draw(); } };\n    draw();\n  }).catch(fail);\n}\nfunction perfTabHtml(p, tab, cat) {\n  var m = p.meta, rows = p.rows.slice(), c = function (r) { return r.byCategory[cat]; };\n  var flag = function (r) { return (r.isNew ? ' <span class=\"badge b-info\">신규</span>' : '') + (r.biz_status !== '정상' ? ' ' + badge(r.biz_status) : '') + (r.dataState !== '정상' ? ' ' + badge('판정보류') : ''); };\n  var nameCol = { t: '중도매인', f: function (r) { return h(r.wholesaler_id + ' ' + r.name) + flag(r); } };\n  var mk = p.marketGrowth[cat];\n  if (tab === 'summary') {\n    rows.sort(function (a, b) { return c(b).amount12 - c(a).amount12; });\n    var tot = p.market[cat];\n    return '<div class=\"tiles\">' + tile(cat + ' 최근 12개월 구매', Math.round(tot.amount12 / 1e8 * 10) / 10, '억원', m.period12) + tile('전년 동기 누적 대비(부류 전체)', mk.status === '정상' ? ((mk.value > 0 ? '+' : '') + (mk.value * 100).toFixed(1)) : '—', '%', m.ytdPeriod) + tile('중도매인', rows.length, '명') + '</div>' +\n      table([nameCol, { t: '12개월 구매', num: true, f: function (r) { return won(c(r).amount12); } }, { t: '구매일수', num: true, f: function (r) { return num(c(r).days12); } },\n        { t: cat === '전체' ? '시장 구성비' : '중도매인 내 구성비', num: true, f: function (r) { var v = cat === '전체' ? c(r).shareOfMarket : c(r).shareInWs; return v === null ? '—' : (v * 100).toFixed(1) + '%'; } },\n        { t: m.lastCompleteYm + ' 구매', num: true, f: function (r) { return won(c(r).lastMonth.amount); } }, { t: '전년 동월 대비', num: true, f: function (r) { return pct(c(r).lastMonth.yoy); } },\n        { t: '전년 동기 누적 대비', num: true, f: function (r) { return pct(c(r).ytd.growth); } },\n        { t: m.currentYm + ' 진행(동일 경과일)', num: true, f: function (r) { return c(r).mtd ? won(c(r).mtd.amount) + ' <span class=\"muted\">' + pct(c(r).mtd.growth) + '</span>' : '—'; } }], rows, { id: 'pTbl', onRow: true });\n  }\n  if (tab === 'trend') {\n    rows.sort(function (a, b) { return c(b).amount12 - c(a).amount12; });\n    return '<div class=\"note\">중도매인을 선택하면 최근 24개월 월별 추이와 전년 대응 월 비교를 봅니다. 진행 중인 월은 동일 경과 경매일 기준입니다.</div>' +\n      table([nameCol, { t: '12개월 구매', num: true, f: function (r) { return won(c(r).amount12); } }, { t: '전년 동기 누적 대비', num: true, f: function (r) { return pct(c(r).ytd.growth); } }, { t: '', f: function () { return '<button>추이 보기</button>'; } }], rows, { id: 'pTbl', onRow: true });\n  }\n  if (tab === 'collect') {\n    rows.sort(function (a, b) { return (b.overdue || 0) - (a.overdue || 0) || (a.turnover || 99) - (b.turnover || 99); });\n    return '<div class=\"note\">' + h(m.turnoverNote) + ' 지표 기준일 ' + h(m.metricBaseDate) + '.</div>' +\n      table([nameCol, { t: '미수 잔액', num: true, f: function (r) { return won(r.balance); } }, { t: '회전율(3개월)', num: true, f: function (r) { return r.turnover === null ? '<span class=\"muted\" title=\"' + h(r.turnoverInfo.reason) + '\">' + h(r.turnoverInfo.status) + '</span>' : r.turnover.toFixed(2) + '회'; } },\n        { t: '회수일수', num: true, f: function (r) { return r.collectionDays === null ? '—' : r.collectionDays.toFixed(1) + '일'; } }, { t: '연체금액', num: true, f: function (r) { return won(r.overdue); } }, { t: '연체일수', num: true, f: function (r) { return num(r.overdueDays); } },\n        { t: '한도 사용률', num: true, f: function (r) { return r.limitUsage === null ? '<span class=\"muted\" title=\"' + h(r.limitUsageInfo.reason) + '\">산출불가</span>' : (r.limitUsage * 100).toFixed(1) + '%'; } }], rows, { id: 'pTbl', onRow: true });\n  }\n  // compare\n  rows.sort(function (a, b) { return c(b).amount12 - c(a).amount12; });\n  var csv = [['코드', '상호', '12개월구매', '구매일수', '전년동월대비', '전년동기누적대비', '회전율', '회수일수', '미수잔액', '연체금액']].concat(rows.map(function (r) {\n    var g1 = c(r).lastMonth.yoy, g2 = c(r).ytd.growth;\n    return [r.wholesaler_id, r.name, c(r).amount12, c(r).days12, g1.status === '정상' ? (g1.value * 100).toFixed(1) : g1.status, g2.status === '정상' ? (g2.value * 100).toFixed(1) : g2.status, r.turnover === null ? '' : r.turnover.toFixed(2), r.collectionDays === null ? '' : r.collectionDays.toFixed(1), r.balance === null ? '' : r.balance, r.overdue === null ? '' : r.overdue];\n  })).map(function (row) { return row.map(function (v) { return /[\",\\n]/.test(String(v)) ? '\"' + String(v).replace(/\"/g, '\"\"') + '\"' : v; }).join(','); }).join('\\n');\n  void csv;\n  return '<div class=\"row\"><button id=\"csvBtn\">비교표 다운로드(CSV)</button><span class=\"muted\">기준일 ' + h(m.baseDate) + ' · ' + h(cat) + ' · 다운로드는 반출 기록에 남습니다</span></div>' +\n    table([{ t: '순위', num: true, f: function (r, i) { return ''; } }, nameCol, { t: '12개월 구매', num: true, f: function (r) { return won(c(r).amount12); } }, { t: '전년 동월', num: true, f: function (r) { return pct(c(r).lastMonth.yoy); } }, { t: '전년 누적', num: true, f: function (r) { return pct(c(r).ytd.growth); } },\n      { t: '회전율', num: true, f: function (r) { return r.turnover === null ? '—' : r.turnover.toFixed(2); } }, { t: '회수일수', num: true, f: function (r) { return r.collectionDays === null ? '—' : r.collectionDays.toFixed(1); } }, { t: '미수 잔액', num: true, f: function (r) { return won(r.balance); } }, { t: '연체', num: true, f: function (r) { return won(r.overdue); } }], rows, { id: 'pTbl', onRow: true }) +\n    '';\n}\nfunction pagePerfDetail(wsId) {\n  loading();\n  call('api_performanceDetail', wsId).then(function (d) {\n    var w = d.wholesaler;\n    var html = '<div class=\"row\" style=\"justify-content:space-between\"><h1>' + h(w.wholesaler_id + ' ' + w.name) + ' — 월별 실적</h1><div class=\"row\"><a href=\"#/perf\">← 실적관리</a> <a href=\"#/ws/' + encodeURIComponent(wsId) + '\">통합 상세</a></div></div>';\n    html += '<div class=\"card\"><h2>최근 24개월 구매금액과 전년 대응 월</h2>' + trendBlock(d.trend) + '</div>';\n    html += '<div class=\"card\" style=\"margin-top:12px\"><h2>회전율 추이(전체 기준, 저장된 기준일 스냅샷)</h2>' + table([{ t: '기준일', k: 'base_date' }, { t: '회전율', num: true, f: function (r) { return r.value.toFixed(2) + '회'; } }, { t: '집계기간', k: 'period' }], d.turnoverHistory, { empty: '스냅샷 없음' }) + '</div>';\n    view(html);\n    // 24개월 표: trendBlock 은 12개월 가정 → 전체 사용\n    bindTrend(d.trend);\n  }).catch(fail);\n}\n\n/* 매트릭스: x 로그 눈금(구매금액), y 회전율, 색 = 전년 동기 누적 증감(감소 주황, 증가 청록, 비교불가 회색), 크기 = 미수금 */\nfunction matrixHtml(mx) {\n  var W = 760, H = 460, L = 60, R = 20, T = 20, B = 44;\n  var pts = mx.points;\n  var html = '<div class=\"note\">' + h(mx.disclaimer) + '</div>';\n  html += '<div class=\"legend\"><span>가로축: ' + h(mx.axes.x) + '</span><span>세로축: ' + h(mx.axes.y) + '</span></div><div class=\"legend\"><span>색: ' + h(mx.axes.color) + ' — <i style=\"background:#1baf7a\"></i>증가 <i style=\"background:#eb6834\"></i>감소 <i style=\"background:#9a9a94\"></i>비교불가</span><span>크기: ' + h(mx.axes.size) + '</span></div>';\n  if (!pts.length) return html + '<p class=\"muted\">표시할 점 없음</p>';\n  var xs = pts.map(function (p) { return Math.max(p.x, 1); }), ys = pts.map(function (p) { return p.y; });\n  var lx0 = Math.log10(Math.min.apply(null, xs)) - 0.1, lx1 = Math.log10(Math.max.apply(null, xs)) + 0.1;\n  var y0 = 0, y1 = Math.max.apply(null, ys.concat([mx.boundaries.y])) * 1.15;\n  var X = function (v) { return L + (Math.log10(Math.max(v, 1)) - lx0) / (lx1 - lx0) * (W - L - R); }, Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };\n  var smax = Math.max.apply(null, pts.map(function (p) { return p.size; }).concat([1]));\n  var svg = '<svg class=\"chart\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"거래·회수 매트릭스\">';\n  // 사분면 배경 라벨\n  var bx = X(mx.boundaries.x), by = Y(mx.boundaries.y);\n  svg += '<line x1=\"' + bx + '\" x2=\"' + bx + '\" y1=\"' + T + '\" y2=\"' + (H - B) + '\" stroke=\"var(--text-2)\" stroke-dasharray=\"4 4\"/><line x1=\"' + L + '\" x2=\"' + (W - R) + '\" y1=\"' + by + '\" y2=\"' + by + '\" stroke=\"var(--text-2)\" stroke-dasharray=\"4 4\"/>';\n  var lab = function (x, y, t, anchor) { return '<text class=\"axis\" x=\"' + x + '\" y=\"' + y + '\" text-anchor=\"' + anchor + '\" font-weight=\"600\">' + h(t) + '</text>'; };\n  svg += lab(W - R - 4, T + 14, mx.quadrants.HH.label + ' ' + mx.counts.HH, 'end') + lab(W - R - 4, H - B - 6, mx.quadrants.HL.label + ' ' + mx.counts.HL, 'end') + lab(L + 4, T + 14, mx.quadrants.LH.label + ' ' + mx.counts.LH, 'start') + lab(L + 4, H - B - 6, mx.quadrants.LL.label + ' ' + mx.counts.LL, 'start');\n  // 축 눈금\n  for (var e = Math.ceil(lx0); e <= Math.floor(lx1); e++) { var xv = Math.pow(10, e); svg += '<text class=\"axis\" x=\"' + X(xv) + '\" y=\"' + (H - B + 16) + '\" text-anchor=\"middle\">' + (xv / 1e8 >= 1 ? (xv / 1e8) + '억' : (xv / 1e4) + '만') + '</text>'; }\n  for (var k = 0; k <= 4; k++) { var yv = y0 + (y1 - y0) * k / 4; svg += '<g class=\"grid\"><line x1=\"' + L + '\" x2=\"' + (W - R) + '\" y1=\"' + Y(yv) + '\" y2=\"' + Y(yv) + '\"/></g><text class=\"axis\" x=\"' + (L - 6) + '\" y=\"' + (Y(yv) + 4) + '\" text-anchor=\"end\">' + yv.toFixed(1) + '회</text>'; }\n  svg += '<text class=\"axis\" x=\"' + (W / 2) + '\" y=\"' + (H - 6) + '\" text-anchor=\"middle\">최근 12개월 구매금액(로그 눈금) · 경계 ' + Math.round(mx.boundaries.x / 1e4).toLocaleString() + '만원(' + h(mx.boundaries.xSource) + ')</text>';\n  svg += '<text class=\"axis\" transform=\"translate(14,' + (H / 2) + ') rotate(-90)\" text-anchor=\"middle\">회전율(전체) · 경계 ' + mx.boundaries.y.toFixed(2) + '회(' + h(mx.boundaries.ySource) + ')</text>';\n  pts.forEach(function (p) {\n    var r = 5 + 14 * Math.sqrt(p.size / smax);\n    var col = p.growth.status !== '정상' ? '#9a9a94' : (p.growth.value < 0 ? '#eb6834' : '#1baf7a');\n    svg += '<circle cx=\"' + X(p.x) + '\" cy=\"' + Y(p.y) + '\" r=\"' + r + '\" fill=\"' + col + '\" fill-opacity=\"0.75\" stroke=\"var(--surface)\" stroke-width=\"2\"><title>' + h(p.wholesaler_id + ' ' + p.name) + '\\n' + h(p.quadrantLabel) + '\\n구매 ' + won(p.x) + ' · 회전율 ' + p.y.toFixed(2) + '회 · 미수금 ' + won(p.size) + '\\n전년 동기 누적 대비 ' + (p.growth.status === '정상' ? (p.growth.value * 100).toFixed(1) + '%' : p.growth.reason) + '</title></circle>';\n    svg += '<text class=\"axis\" x=\"' + (X(p.x) + r + 2) + '\" y=\"' + (Y(p.y) + 3) + '\">' + h(p.wholesaler_id) + '</text>';\n  });\n  svg += '</svg>';\n  html += svg;\n  html += '<h3>분류 표</h3>' + table([{ t: '중도매인', f: function (p) { return h(p.wholesaler_id + ' ' + p.name); } }, { t: '분류', f: function (p) { return '<span class=\"badge ' + ({ HH: 'b-ok', HL: 'b-bad', LH: 'b-info', LL: 'b-warn' }[p.quadrant]) + '\">' + h(p.quadrantLabel) + '</span>'; } },\n    { t: '12개월 구매', num: true, f: function (p) { return won(p.x); } }, { t: '회전율', num: true, f: function (p) { return p.y.toFixed(2); } }, { t: '회수일수', num: true, f: function (p) { return p.collectionDays === null ? '—' : p.collectionDays.toFixed(1); } },\n    { t: '미수금', num: true, f: function (p) { return won(p.size); } }, { t: '전년 누적 대비', num: true, f: function (p) { return pct(p.growth); } }], pts.slice().sort(function (a, b) { return a.quadrant === b.quadrant ? b.x - a.x : a.quadrant.localeCompare(b.quadrant); }), { id: 'mxTbl', onRow: true });\n  html += '<h3>그래프 밖 (분류 제외)</h3>' + table([{ t: '중도매인', f: function (p) { return h(p.wholesaler_id + ' ' + p.name); } }, { t: '사유', k: 'reason' }, { t: '12개월 구매', num: true, f: function (p) { return won(p.x); } }], mx.excluded, { empty: '없음' });\n  html += '<div class=\"note\">경계선: 가로축은 부류 필터별 당기 중앙값, 세로축은 전년도 연간 중앙값 고정(지표·신호 기준 화면 \"기준선 재산정\") 또는 내부 목표값. 산정 시각 ' + h(mx.boundaries.computedAt) + '</div>';\n  return html;\n}\n\n/* ───── 매뉴얼 질의 ───── */\nfunction pageQa(caseId) {\n  view('<h1>매뉴얼 질의</h1><div class=\"note\">등록된 매뉴얼·절차에서 근거를 찾아 답합니다. 근거가 없으면 절차를 만들지 않고 \"확인 필요\"로 답합니다. 자유 질의 AI는 조직 승인 후 설정에서 켤 수 있으며, 꺼져 있어도 이 화면은 동작합니다.</div>' +\n    '<form class=\"row\" id=\"qf\"><input name=\"q\" style=\"flex:1;min-width:240px\" placeholder=\"예: 연체 30일 넘었을 때 절차, 담보 재평가 주기\" required>' + (caseId ? '<span class=\"badge b-info\">관리 건 ' + h(caseId) + '</span>' : '') + '<button class=\"primary\">질의</button></form><div id=\"qa\"></div>');\n  document.getElementById('qf').onsubmit = function (e) {\n    e.preventDefault();\n    var q = document.getElementById('qf').q.value;\n    document.getElementById('qa').innerHTML = '<p class=\"muted\">검색 중…</p>';\n    call('api_askManual', q, caseId).then(function (a) {\n      var html = '<div class=\"card\"><div class=\"note\">[기준] 중도매인 데이터 기준일 ' + h(a.basis.data_base_date) + ' (' + h(a.basis.data_status) + ') · 매뉴얼: ' + (a.basis.manual_versions.map(h).join(', ') || '등록 문서 없음') + '</div>' +\n        '<p><b>' + h(a.query) + '</b> ' + badge(a.status) + '</p>' + (a.message ? '<div class=\"note ' + (a.status === '충돌' ? 'bad' : 'warn') + '\">' + h(a.message) + '</div>' : '') +\n        '<h3>1. 확인된 상황</h3>' + (a.facts.length ? '<ul>' + a.facts.map(function (f) { return '<li>' + h(f) + '</li>'; }).join('') + '</ul>' : '<p class=\"muted\">' + (caseId ? '—' : '관리 건을 지정하면 그 건의 신호·확인 결과가 표시됩니다') + '</p>') +\n        '<h3>2. 추가 확인사항</h3>' + (a.furtherChecks.length ? '<ul>' + a.furtherChecks.map(function (f) { return '<li>' + h(f) + '</li>'; }).join('') + '</ul>' : '<p class=\"muted\">—</p>') +\n        '<h3>3. 적용 가능한 절차 · 4. 근거</h3>' + (a.procedures.length ? a.procedures.map(function (p) {\n          var head = '<p><b>' + h(p.label) + '</b> <span class=\"muted\">(' + h(p.situation_code) + ')</span> ' + badge(p.status) + '</p>';\n          if (!p.steps.length) return head + '<div class=\"note warn\">' + h(p.message) + '</div>';\n          return head + (p.status === '충돌' ? '<div class=\"note bad\">' + h(p.message) + '</div>' : '') + table([{ t: '단계', num: true, k: 'step_no' }, { t: '절차', k: 'content', wrap: true }, { t: '확인사항', k: 'checks', wrap: true },\n            { t: '근거(문서·버전·조항·쪽수·시행일)', wrap: true, f: function (s) { return h(s.doc_name + ' ' + s.version + ' ' + s.article) + (s.page ? ' p.' + h(s.page) : '') + '<br><span class=\"muted\">시행 ' + h(s.effective_from) + '</span>'; } }], p.steps);\n        }).join('') : '<p class=\"muted\">해당 절차 없음</p>') +\n        '<h3>5. 필요 서식</h3>' + (a.forms.length ? '<ul>' + a.forms.map(function (f) { return '<li>' + h(f.form_name + ' ' + f.version) + (f.available ? ' <button data-blank=\"' + h(f.form_doc_id) + '\">빈 서식</button>' : ' <span class=\"badge b-warn\">파일 없음</span>') + '</li>'; }).join('') + '</ul>' : '<p class=\"muted\">—</p>') +\n        '<h3>6. 다음 할 일</h3><ul>' + a.nextSteps.map(function (n) { return '<li>' + h(n) + '</li>'; }).join('') + '</ul>' +\n        '<h3>AI 답변(선택 기능)</h3>' + (a.ai.used ? '<div class=\"note\">' + h(a.ai.text) + '<br><span class=\"muted\">' + h(a.ai.note) + '</span></div>' : '<p class=\"muted\">' + h(a.ai.status) + ' — ' + h(a.ai.reason) + '</p>') + '</div>';\n      document.getElementById('qa').innerHTML = html;\n      document.getElementById('qa').onclick = function (ev) { var b = ev.target.closest('button[data-blank]'); if (b) call('api_blankForm', b.getAttribute('data-blank')).then(function (r) { window.open(r.url, '_blank'); }).catch(function (x) { toast(x.message, true); }); };\n    }).catch(function (e) { document.getElementById('qa').innerHTML = '<div class=\"note bad\">' + h(e.message) + '</div>'; });\n  };\n}\n\n/* ───── 시작 ───── */\nfunction showLogin(msg) {\n  document.getElementById('who').innerHTML = '';\n  document.getElementById('nav').innerHTML = '';\n  view('<div class=\"card\" style=\"max-width:420px;margin:40px auto\"><h2>로그인</h2>' + (msg ? '<div class=\"note warn\">' + h(msg) + '</div>' : '') +\n    '<form class=\"f\" id=\"lf\"><label class=\"full\">이메일<input name=\"email\" type=\"email\" required autocomplete=\"username\"></label><label class=\"full\">접속코드<input name=\"code\" required autocomplete=\"current-password\" style=\"text-transform:uppercase\"></label>' +\n    '<div class=\"full\"><button class=\"primary\">로그인</button></div></form><div class=\"note\">접속코드는 관리자가 개인별로 발급합니다. 코드를 모르면 관리자에게 문의하세요. 공용 PC에서는 사용 후 로그아웃하세요.</div></div>');\n  document.getElementById('lf').onsubmit = function (e) {\n    e.preventDefault(); var o = formData(e.target);\n    rawCall('api_login', [o.email, o.code]).then(function (r) { setToken(r.token); start(); }).catch(function (err) { toast(err.message, true); });\n  };\n}\nfunction start() {\n  call('api_bootstrap').then(function (b) {\n    S.boot = b;\n    document.getElementById('appVer').textContent = 'v' + b.app.version;\n    document.getElementById('who').innerHTML = h(b.user.name) + ' (' + h(b.user.roleLabel) + ')' + (S.codeMode ? ' <button id=\"logout\" style=\"margin-left:8px;padding:2px 8px;font-size:12px\">로그아웃</button>' : '');\n    var lo = document.getElementById('logout'); if (lo) lo.onclick = function () { call('api_logout').catch(function () {}).then(function () { setToken(''); showLogin('로그아웃했습니다.'); }); };\n    if (!location.hash || location.hash === '#/') location.hash = '#/home';\n    route();\n  }).catch(function (e) {\n    if (S.codeMode) return showLogin(/SESSION_EXPIRED/.test(e.message) ? '' : e.message);\n    document.getElementById('who').textContent = '';\n    view('<div class=\"note bad\"><b>접속할 수 없습니다.</b><br>' + h(e.message || e) + '</div>');\n  });\n}\nrawCall('api_authInfo', []).then(function (a) {\n  S.codeMode = a.mode === 'code' && !a.googleIdentified;   // Google 계정으로 식별되면 토큰 없이 그대로 사용\n  if (S.codeMode && !token()) return showLogin('');\n  start();\n}).catch(function (e) { view('<div class=\"note bad\">' + h(e.message || e) + '</div>'); });\n</script>\n",
 "SummaryView": "<script>\n/* SummaryView.html — 주간 요약 화면 (웹앱 홈과 스냅샷 HTML 이 같은 코드를 쓴다)\n * 구성: 상단 요약 3장(이상 징후 / 동향보고 / 조치사항) → 4분면 → 탭 3개 상세 → 조치 안내(1줄 + 조항)\n * opts.web = true 이면 관리 건·중도매인 링크가 웹앱 경로, false 이면 문서 내 앵커 */\n(function (global) {\n  'use strict';\n  function h(v) { return v === null || v === undefined ? '' : String(v).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; }); }\n  function won(n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('ko-KR') + '원'; }\n  function man(n) { return n === null || n === undefined || n === '' ? '—' : Math.round(Number(n) / 10000).toLocaleString('ko-KR') + '만원'; }\n  function pct(g) { if (!g) return '—'; if (g.status !== '정상') return '<span class=\"muted\">' + h(g.status) + '</span>'; return (g.value > 0 ? '+' : '') + (g.value * 100).toFixed(1) + '%'; }\n  function badge(t) { var cls = { '정상': 'b-ok', '판정보류': 'b-bad', '지연': 'b-warn', '휴업': 'b-warn', '폐업': 'b-bad', '위험': 'b-bad', '경고': 'b-bad', '주의': 'b-warn', '정보': 'b-info', '동향확인중': 'b-warn', '접수': 'b-info', '조치진행': 'b-warn', '승인대기': 'b-warn', '확인완료': 'b-info', '재점검대기': 'b-info', '종결': 'b-ok', '확인 필요': 'b-warn', '충돌': 'b-bad', '보류': 'b-bad', '승인': 'b-ok', '반려': 'b-bad', '완료': 'b-ok', '진행': 'b-warn', '도래': 'b-warn' }[t] || 'b-info'; return '<span class=\"badge ' + cls + '\">' + h(t) + '</span>'; }\n  function table(cols, rows, empty) {\n    if (!rows.length) return '<p class=\"muted\">' + h(empty || '해당 없음') + '</p>';\n    return '<div class=\"scroll\"><table><thead><tr>' + cols.map(function (c) { return '<th class=\"' + (c.num ? 'num' : '') + '\">' + h(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +\n      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td class=\"' + (c.num ? 'num' : '') + (c.wrap ? ' wrap' : '') + '\">' + (c.f ? c.f(r) : h(r[c.k])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';\n  }\n  function ev(s) { var e = s.evidence || {}; switch (s.rule_id) {\n    case 'S01': return '회전율 ' + e.prevTurnover + '→' + e.turnover + '회(' + e.dropPct + '%↓), 회수 ' + e.collectionDays + '일';\n    case 'S02': return '미수 ' + man(e.balance) + ' (3개월 평균의 ' + e.ratio + '배)';\n    case 'S03': return '연체 ' + man(e.overdueAmount) + ' · ' + e.overdueDays + '일 (' + e.stage + ')';\n    case 'S04': return '실적 전년 동월 ' + e.yoyPct + '%, 3개월 ' + e.ma3Pct + '%';\n    case 'S05': return '한도 사용률 ' + e.usagePct + '%';\n    case 'S06': return e.kind + ' 만기 ' + e.date + ' (D-' + e.dday + ')';\n    case 'S07': return '동시 ' + (e.rules || []).join('+');\n    default: return ''; } }\n\n  /** 회전율이 없을 때의 대체 그림: 전년 동월 대비 증감률 가로 막대(감소 상위 N + 증가 상위 n). 막대 하나 = 중도매인 한 명 */\n  function growthRankSvg(gr, link) {\n    var all = gr.points, N = Math.min(15, all.length), M = Math.min(5, Math.max(0, all.length - N));\n    var show = all.slice(0, N).concat(M ? all.slice(all.length - M).filter(function (p) { return p.x > 0; }) : []);\n    var W = 760, L = 150, R = 70, rowH = 22, T = 26, H = T + show.length * rowH + 12;\n    var m = 100;   // 가로 눈금은 ±100% 고정, 그 밖의 값은 끝에 붙이고 수치로만 표시\n    var X = function (v) { return L + (Math.max(-m, Math.min(m, v)) + m) / (2 * m) * (W - L - R); };\n    var svg = '<svg class=\"chart\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"전년 동월 대비 증감률 순위\">';\n    svg += '<line x1=\"' + X(0) + '\" x2=\"' + X(0) + '\" y1=\"' + (T - 10) + '\" y2=\"' + (H - 8) + '\" stroke=\"var(--text-2)\" stroke-dasharray=\"4 4\"/>';\n    [-m, -m / 2, 0, m / 2, m].forEach(function (v) { svg += '<text class=\"axis\" x=\"' + X(v) + '\" y=\"' + (T - 12) + '\" text-anchor=\"middle\">' + (v > 0 ? '+' : '') + v + '%</text>'; });\n    show.forEach(function (p, i) {\n      var y = T + i * rowH, x = X(p.x), neg = p.x < 0, w = Math.abs(x - X(0));\n      svg += '<g class=\"pt\" data-ws=\"' + h(p.wholesaler_id) + '\"><title>' + h(p.wholesaler_id + ' ' + p.name) + '\\n' + gr.ym + ' ' + won(p.lastMonth) + ' / 전년 동월 ' + won(p.prevYearMonth) + '</title>' +\n        '<text class=\"axis\" x=\"' + (L - 6) + '\" y=\"' + (y + 14) + '\" text-anchor=\"end\">' + h(p.wholesaler_id + ' ' + (p.name || '')) + '</text>' +\n        '<rect x=\"' + (neg ? x : X(0)) + '\" y=\"' + (y + 3) + '\" width=\"' + w + '\" height=\"' + (rowH - 6) + '\" rx=\"3\" fill=\"' + (neg ? (p.x <= -40 ? '#e34948' : '#eda100') : '#1baf7a') + '\" fill-opacity=\"0.8\"/>' +\n        '<text class=\"axis\" x=\"' + (neg ? x - 4 : x + 4) + '\" y=\"' + (y + 14) + '\" text-anchor=\"' + (neg ? 'end' : 'start') + '\">' + (p.x > 0 ? '+' : '') + p.x.toFixed(1) + '%</text></g>';\n    });\n    svg += '</svg>';\n    return '<div class=\"legend\"><span><i style=\"background:#e34948\"></i>40% 이상 감소</span><span><i style=\"background:#eda100\"></i>감소</span><span><i style=\"background:#1baf7a\"></i>증가</span><span>' + h(gr.ym) + ' 사업실적 기준 · 감소 ' + gr.decline + '명 / 비교 가능 ' + gr.total + '명 · 감소 상위 ' + N + '명' + (M ? '과 증가 상위' : '') + ' 표시</span></div>' + svg +\n      ((gr.idle || []).length ? '<details><summary class=\"muted\">전년 동월에는 거래가 있었으나 ' + h(gr.ym) + ' 거래가 없는 중도매인 ' + gr.idle.length + '명</summary><p class=\"muted\">' + gr.idle.map(function (p) { return h(p.wholesaler_id + ' ' + (p.name || '')); }).join(', ') + '</p></details>' : '') +\n      '<div class=\"note\">' + h(gr.note) + '</div>';\n  }\n\n  function matrixSvg(mx, link) {\n    var pts = mx.points || [];\n    if (!pts.length && mx.growthRank && mx.growthRank.points.length) return growthRankSvg(mx.growthRank, link);\n    if (!pts.length) return '<p class=\"muted\">분류할 점이 없습니다' + (mx.excluded && mx.excluded.length ? ' (제외 ' + mx.excluded.length + '명: ' + h(mx.excluded[0].reason) + ' 등)' : '') + '.</p>';\n    var W = 760, H = 420, L = 56, R = 16, T = 16, B = 40, growthMode = mx.xMode === '전년동월증감';\n    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });\n    var x0, x1, X;\n    if (growthMode) { var m = Math.max(30, Math.ceil(Math.max.apply(null, xs.map(Math.abs)) / 10) * 10); x0 = -m; x1 = m; X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }; }\n    else { var lx0 = Math.log10(Math.max(1, Math.min.apply(null, xs))) - 0.1, lx1 = Math.log10(Math.max.apply(null, xs)) + 0.1; X = function (v) { return L + (Math.log10(Math.max(v, 1)) - lx0) / (lx1 - lx0) * (W - L - R); }; }\n    var y1 = Math.max.apply(null, ys.concat([mx.boundaries.y || 0])) * 1.15 || 1, Y = function (v) { return T + (1 - v / y1) * (H - T - B); };\n    var smax = Math.max.apply(null, pts.map(function (p) { return p.size || 0; }).concat([1]));\n    var bx = X(mx.boundaries.x), by = Y(mx.boundaries.y);\n    var col = { HH: '#1baf7a', HL: '#e34948', LH: '#2a78d6', LL: '#eda100' };\n    var svg = '<svg class=\"chart\" viewBox=\"0 0 ' + W + ' ' + H + '\" role=\"img\" aria-label=\"거래·회수 4분면\">';\n    svg += '<line x1=\"' + bx + '\" x2=\"' + bx + '\" y1=\"' + T + '\" y2=\"' + (H - B) + '\" stroke=\"var(--text-2)\" stroke-dasharray=\"4 4\"/><line x1=\"' + L + '\" x2=\"' + (W - R) + '\" y1=\"' + by + '\" y2=\"' + by + '\" stroke=\"var(--text-2)\" stroke-dasharray=\"4 4\"/>';\n    var lab = function (x, y, t, a) { return '<text class=\"axis\" x=\"' + x + '\" y=\"' + y + '\" text-anchor=\"' + a + '\" font-weight=\"600\">' + h(t) + '</text>'; };\n    svg += lab(W - R - 4, T + 14, mx.quadrants.HH.label + ' ' + mx.counts.HH, 'end') + lab(W - R - 4, H - B - 6, mx.quadrants.HL.label + ' ' + mx.counts.HL, 'end') + lab(L + 4, T + 14, mx.quadrants.LH.label + ' ' + mx.counts.LH, 'start') + lab(L + 4, H - B - 6, mx.quadrants.LL.label + ' ' + mx.counts.LL, 'start');\n    if (growthMode) for (var v = x0; v <= x1; v += (x1 - x0) / 6) svg += '<text class=\"axis\" x=\"' + X(v) + '\" y=\"' + (H - B + 16) + '\" text-anchor=\"middle\">' + (v > 0 ? '+' : '') + Math.round(v) + '%</text>';\n    for (var k = 0; k <= 4; k++) { var yv = y1 * k / 4; svg += '<g class=\"grid\"><line x1=\"' + L + '\" x2=\"' + (W - R) + '\" y1=\"' + Y(yv) + '\" y2=\"' + Y(yv) + '\"/></g><text class=\"axis\" x=\"' + (L - 6) + '\" y=\"' + (Y(yv) + 4) + '\" text-anchor=\"end\">' + yv.toFixed(1) + '회</text>'; }\n    svg += '<text class=\"axis\" x=\"' + ((L + W - R) / 2) + '\" y=\"' + (H - 4) + '\" text-anchor=\"middle\">' + h(mx.axes.x) + ' · 경계 ' + h(mx.boundaries.xSource) + '</text>';\n    svg += '<text class=\"axis\" transform=\"translate(12,' + (H / 2) + ') rotate(-90)\" text-anchor=\"middle\">' + h(mx.axes.y) + ' · 경계 ' + (mx.boundaries.y === null ? '—' : mx.boundaries.y.toFixed(2)) + '회</text>';\n    var smaxAll = Math.max.apply(null, pts.map(function (p) { return Math.max(p.size || 0, p.prev && p.prev.size || 0); }).concat([1]));\n    var inRange = function (v) { return growthMode ? Math.max(x0, Math.min(x1, v)) : v; };\n    pts.forEach(function (p) {\n      var r = 5 + 13 * Math.sqrt((p.size || 0) / smaxAll), cx = X(p.x), cy = Y(p.y);\n      var prevSvg = '';\n      if (p.prev && p.prev.available) {\n        var pr = 5 + 13 * Math.sqrt((p.prev.size || 0) / smaxAll), px = X(inRange(p.prev.x)), py = Y(Math.min(p.prev.y, y1));\n        prevSvg = '<g class=\"prev\" data-prev=\"' + h(p.wholesaler_id) + '\" style=\"display:none\"><line x1=\"' + px + '\" y1=\"' + py + '\" x2=\"' + cx + '\" y2=\"' + cy + '\" stroke=\"' + col[p.quadrant] + '\" stroke-dasharray=\"3 3\"/><circle cx=\"' + px + '\" cy=\"' + py + '\" r=\"' + pr + '\" fill=\"none\" stroke=\"' + col[p.quadrant] + '\" stroke-width=\"2\" stroke-dasharray=\"5 4\"/><text class=\"axis\" x=\"' + (px + pr + 2) + '\" y=\"' + (py - 4) + '\">' + h(p.prev.ym) + ' (전년)</text></g>';\n      }\n      svg += prevSvg + '<g class=\"pt\" data-ws=\"' + h(p.wholesaler_id) + '\" style=\"cursor:pointer\"><circle cx=\"' + cx + '\" cy=\"' + cy + '\" r=\"' + r + '\" fill=\"' + col[p.quadrant] + '\" fill-opacity=\"0.75\" stroke=\"var(--surface)\" stroke-width=\"2\"><title>' + h(p.wholesaler_id + ' ' + p.name + ' · ' + p.quadrantLabel) + '\\n' + (growthMode ? '전년 동월 대비 ' + p.x.toFixed(1) + '% · 당월 ' + won(p.lastMonth) + (p.prevYearMonth !== null ? ' / 전년 동월 ' + won(p.prevYearMonth) : '') : '12개월 구매 ' + won(p.x)) + '\\n회전율 ' + p.y.toFixed(2) + '회 · 미수금 ' + won(p.balance) + (p.prev && p.prev.available ? '\\n클릭: 전년 동월 위치(점선) 보기' : (p.prev ? '\\n전년 위치 없음: ' + p.prev.reason : '')) + '</title></circle>' +\n        '<text class=\"axis\" x=\"' + (cx + r + 2) + '\" y=\"' + (cy + 3) + '\">' + h(p.wholesaler_id) + '</text></g>';\n    });\n    svg += '</svg>';\n    return '<div class=\"legend\"><span><i style=\"background:#1baf7a\"></i>' + h(mx.quadrants.HH.desc) + '</span><span><i style=\"background:#e34948\"></i>' + h(mx.quadrants.HL.desc) + '</span><span><i style=\"background:#2a78d6\"></i>' + h(mx.quadrants.LH.desc) + '</span><span><i style=\"background:#eda100\"></i>' + h(mx.quadrants.LL.desc) + '</span><span>크기: ' + h(mx.axes.size) + '</span><span>원 클릭 = 전년 동월 위치(점선)</span></div>' + svg +\n      '<details><summary>분류 표 (' + pts.length + '명, 제외 ' + (mx.excluded || []).length + '명)</summary>' + table([{ t: '중도매인', f: function (p) { return link.ws(p.wholesaler_id, p.name); } }, { t: '분류', f: function (p) { return '<span class=\"badge\" style=\"background:' + col[p.quadrant] + '22;color:' + col[p.quadrant] + '\">' + h(p.quadrantLabel) + '</span>'; } },\n        { t: growthMode ? '전년 동월 대비' : '12개월 구매', num: true, f: function (p) { return growthMode ? (p.x > 0 ? '+' : '') + p.x.toFixed(1) + '%' : won(p.x); } }, { t: '당월 실적', num: true, f: function (p) { return won(p.lastMonth); } }, { t: '회전율', num: true, f: function (p) { return p.y.toFixed(2); } }, { t: '미수금', num: true, f: function (p) { return won(p.balance); } }], pts.slice().sort(function (a, b) { return a.quadrant.localeCompare(b.quadrant) || b.y - a.y; })) +\n      (mx.excluded && mx.excluded.length ? table([{ t: '제외', f: function (p) { return link.ws(p.wholesaler_id, p.name); } }, { t: '사유', k: 'reason' }], mx.excluded) : '') + '</details>';\n  }\n\n  /**\n   * @param root DOM 요소\n   * @param d weeklySummary_ 결과\n   * @param opts { web: bool, onChecklist(caseId), onCase(caseId) }\n   */\n  function renderSummary(root, d, opts) {\n    opts = opts || {};\n    var link = {\n      ws: function (id, name) { return opts.web ? '<a href=\"#/ws/' + encodeURIComponent(id) + '\">' + h(id + ' ' + (name || '')) + '</a>' : '<a href=\"#ws-' + h(id) + '\">' + h(id + ' ' + (name || '')) + '</a>'; },\n      cs: function (id) { return id ? (opts.web ? '<a href=\"#/case/' + encodeURIComponent(id) + '\">' + h(id) + '</a>' : '<a href=\"#case-' + h(id) + '\">' + h(id) + '</a>') : '<span class=\"muted\">—</span>'; }\n    };\n    var k = d.kpis, st = d.status, flaggedHigh = k.flaggedHigh;\n    var html = '';\n    if (st.data_status && st.data_status !== '정상') html += '<div class=\"note bad\">데이터 상태 <b>' + h(st.data_status) + '</b> — ' + h(st.status_reasons || '') + ' 이 기간 수치는 판정 보류입니다.</div>';\n    if (st.ar_available === '아니오') html += '<div class=\"note warn\">미수잔액·입금 자료가 아직 없어 회전율·연체·미수금 증가 징후는 산출되지 않습니다. 실적 감소·담보 기한 징후만 표시됩니다.</div>';\n    // 체계 띠: 채권관리 → 동향관리 → 연체채권 조치\n    html += '<div class=\"flowband\"><span class=\"step\">① 채권관리<small>이상 징후 자동 탐지</small></span><span class=\"arr\">→</span><span class=\"step\">② 동향관리<small>현장 확인 체크리스트</small></span><span class=\"arr\">→</span><span class=\"step\">③ 연체채권 조치<small>매뉴얼 조항에 따른 대응</small></span><span class=\"goal\">목적: 중도매인 실적 관리로 분산 역량 강화</span></div>';\n    // 요약 3장\n    html += '<div class=\"sum3\">' +\n      '<a class=\"sumcard ' + (flaggedHigh ? 'bad' : (k.flagged ? 'warn' : 'ok')) + '\" href=\"#tab-signal\" data-tab=\"signal\"><div class=\"k\">① 채권관리 — 이상 징후</div><div class=\"v\">' + k.flagged + '<small>명</small></div><div class=\"s\">경고 이상 ' + flaggedHigh + '명 · 확인 대기 ' + k.trendWait + '건' + (k.trendLate ? ' · <b>지연 ' + k.trendLate + '</b>' : '') + '</div></a>' +\n      '<a class=\"sumcard ' + (k.trendLate ? 'bad' : (k.trendWait ? 'warn' : 'ok')) + '\" href=\"#tab-trend\" data-tab=\"trend\"><div class=\"k\">② 동향관리 — 현장 확인</div><div class=\"v\">' + k.trendsThisWeek + '<small>건/주</small></div><div class=\"s\">체크리스트 대기 ' + k.trendWait + '건 · 최근 제출 ' + d.recentTrends.length + '건</div></a>' +\n      '<a class=\"sumcard ' + (k.pendingApproval ? 'warn' : (k.openActions ? 'info' : 'ok')) + '\" href=\"#tab-action\" data-tab=\"action\"><div class=\"k\">③ 연체채권 조치</div><div class=\"v\">' + k.openActions + '<small>건 진행</small></div><div class=\"s\">승인 대기 ' + k.pendingApproval + ' · 재점검 ' + k.recheck + (k.recheckDue ? ' (도래 ' + k.recheckDue + ')' : '') + '</div></a></div>';\n    // 4분면\n    html += '<div class=\"card\"><h2>거래·회수 4분면 <span class=\"muted\" style=\"font-size:12px;font-weight:400\">세로 미수금 회전율 · 가로 ' + h(d.matrix.axes.x) + '</span></h2>' + matrixSvg(d.matrix, link) + '<div class=\"note\">' + h(d.matrix.disclaimer) + '</div></div>';\n    // 탭\n    html += '<div class=\"tabs\" id=\"sumTabs\"><button data-tab=\"signal\" class=\"on\">① 이상 징후 (' + k.flagged + ')</button><button data-tab=\"trend\">② 현장 확인 (' + (k.trendWait + d.recentTrends.length) + ')</button><button data-tab=\"action\">③ 조치 (' + (k.openActions + k.recheck) + ')</button><button data-tab=\"guide\">조치 안내·매뉴얼 근거</button></div>';\n    // ① 징후\n    html += '<section id=\"tab-signal\" class=\"tabpane\"><div class=\"card\">' + table([\n      { t: '등급', f: function (r) { return badge(r.severity); } }, { t: '중도매인', f: function (r) { return link.ws(r.wholesaler_id, r.name) + (r.assignee ? '<br><span class=\"muted\">' + h(r.assignee) + '</span>' : ''); } },\n      { t: '징후', wrap: true, f: function (r) { return r.signals.map(function (s) { return '<div><b>' + h(s.rule_id) + '</b> ' + h(s.label) + ' <span class=\"muted\">' + h(ev(s)) + '</span></div>'; }).join(''); } },\n      { t: '당월 실적(전년 동월 대비)', num: true, f: function (r) { return r.lastMonth ? won(r.lastMonth.amount) + '<br>' + pct(r.yoy) : '—'; } }, { t: '미수금 / 연체', num: true, f: function (r) { return man(r.balance) + '<br>' + (r.overdue ? '<span class=\"badge b-bad\">' + man(r.overdue) + ' ' + r.overdueDays + '일</span>' : '—'); } },\n      { t: '현장 확인 / 관리 건', f: function (r) { return (r.latest_trend ? h(r.latest_trend.checked_date) + ' ' + h(r.latest_trend.result_class) : (r.trend_due ? '확인 기한 ' + h(r.trend_due) : '<span class=\"muted\">—</span>')) + '<br>' + link.cs(r.case_id) + (r.case_status ? ' ' + badge(r.case_status) : ''); } },\n      { t: '조치 안내', wrap: true, f: function (r) { return (r.guides || []).map(function (g) { return g.first ? '<div><b>' + h(g.first.action) + '</b><br><span class=\"muted\">' + h(g.first.basis) + '</span></div>' : '<div class=\"muted\">' + h(g.label) + ': 확인 필요(조항 미등록)</div>'; }).join('') || '<span class=\"muted\">해당 상황 없음</span>'; } }\n    ], d.flagged, '현재 이상 징후 없음') + '</div></section>';\n    // ② 동향\n    html += '<section id=\"tab-trend\" class=\"tabpane hidden\"><div class=\"card\"><h2>현장 확인 대기 (체크리스트)</h2>' + table([\n      { t: '관리 건', f: function (r) { return link.cs(r.case_id); } }, { t: '중도매인', f: function (r) { return link.ws(r.wholesaler_id, r.name); } }, { t: '담당 경매사', k: 'auctioneer' }, { t: '징후', f: function (r) { return r.signals.join(', '); } },\n      { t: '확인 기한', f: function (r) { return h(r.trend_due) + (r.overdue ? ' ' + badge('지연') : ''); } }, { t: '', f: function (r) { return '<button data-ck=\"' + h(r.case_id) + '\">체크리스트' + (opts.web ? ' 입력·인쇄' : ' 인쇄') + '</button>'; } }\n    ], d.trendWait, '확인 대기 없음') + '<h2 style=\"margin-top:14px\">최근 제출된 동향보고</h2>' + table([\n      { t: '제출', f: function (t) { return h((t.submitted_at || '').substring(0, 10)); } }, { t: '중도매인', f: function (t) { return link.ws(t.wholesaler_id, t.name); } }, { t: '관리 건', f: function (t) { return link.cs(t.case_id); } }, { t: '확인', f: function (t) { return h(t.checked_date + ' ' + t.check_method); } },\n      { t: '확인된 사실', wrap: true, f: function (t) { return (t.facts || []).slice(0, 3).map(h).join('<br>') + (t.facts && t.facts.length > 3 ? '<br><span class=\"muted\">외 ' + (t.facts.length - 3) + '</span>' : ''); } }, { t: '결과', f: function (t) { return h(t.result_class); } }, { t: '작성', k: 'writer' }\n    ], d.recentTrends, '제출된 보고 없음') + '</div></section>';\n    // ③ 조치\n    html += '<section id=\"tab-action\" class=\"tabpane hidden\"><div class=\"card\"><h2>진행 중 조치</h2>' + table([\n      { t: '관리 건', f: function (a) { return link.cs(a.case_id); } }, { t: '중도매인', f: function (a) { return link.ws(a.wholesaler_id, a.name); } }, { t: '조치', k: 'action_type' }, { t: '내용', k: 'content', wrap: true }, { t: '담당', k: 'owner' }, { t: '기한', k: 'due_date' }, { t: '승인', f: function (a) { return badge(a.approval_status); } }\n    ], d.openActions, '진행 중 조치 없음') + '<h2 style=\"margin-top:14px\">재점검 예정</h2>' + table([\n      { t: '관리 건', f: function (r) { return link.cs(r.case_id); } }, { t: '중도매인', f: function (r) { return link.ws(r.wholesaler_id, r.name); } }, { t: '종결 사유', k: 'close_reason' }, { t: '재점검일', f: function (r) { return h(r.recheck_date) + (r.due ? ' ' + badge('도래') : ''); } }\n    ], d.recheck, '없음') + '<h2 style=\"margin-top:14px\">최근 완료</h2>' + table([\n      { t: '완료', k: 'done_date' }, { t: '관리 건', f: function (a) { return link.cs(a.case_id); } }, { t: '중도매인', f: function (a) { return link.ws(a.wholesaler_id, a.name); } }, { t: '조치', k: 'action_type' }, { t: '결과', k: 'result', wrap: true }\n    ], d.doneActions, '없음') + '</div></section>';\n    // 조치 안내\n    html += '<section id=\"tab-guide\" class=\"tabpane hidden\"><div class=\"card\"><div class=\"note\">상황별 조치 1줄과 매뉴얼 조항·호·목 근거입니다. 조항이 등록되지 않은 상황은 \"확인 필요\"로 표시하며 절차를 임의로 만들지 않습니다.</div>' + table([\n      { t: '상황', f: function (g) { return '<b>' + h(g.label) + '</b><br><span class=\"muted\">' + h((g.signals || []).join('+')) + (g.min_overdue_days ? ' · 연체 ' + h(g.min_overdue_days) + '일↑' : '') + (g.result_class ? ' · ' + h(g.result_class) : '') + '</span>'; } },\n      { t: '조치 (1줄)', wrap: true, f: function (g) { return g.steps.length ? g.steps.map(function (s) { return '<div>' + h(s.step_no) + '. ' + h(s.action) + '</div>'; }).join('') : badge('확인 필요'); } },\n      { t: '매뉴얼 근거 (조·항·호·목)', wrap: true, f: function (g) { return g.steps.length ? g.steps.map(function (s) { return '<div>' + h(s.basis) + ' <span class=\"muted\">(시행 ' + h(s.effective_from) + ')</span></div>'; }).join('') : ((g.candidates || []).length ? '<span class=\"muted\">근거 후보: ' + g.candidates.map(function (c) { return h(c.doc_name + ' ' + c.version); }).join(', ') + '</span>' : '<span class=\"muted\">등록 문서 없음</span>'); } },\n      { t: '필요 서식', f: function (g) { return g.steps.map(function (s) { return s.forms.map(h).join(', '); }).filter(Boolean).join('<br>') || '—'; } }\n    ], d.guides, '등록된 상황 없음') + '</div></section>';\n    root.innerHTML = html;\n    root.addEventListener('click', function (e) {   // 원 클릭 → 전년 동월 점선 원 토글\n      var g = e.target.closest('g.pt'); if (!g) return;\n      var prev = root.querySelector('g.prev[data-prev=\"' + g.getAttribute('data-ws') + '\"]');\n      if (prev) prev.style.display = prev.style.display === 'none' ? '' : 'none';\n    });\n    var tabs = root.querySelector('#sumTabs');\n    var show = function (t) { Array.prototype.forEach.call(tabs.children, function (b) { b.className = b.getAttribute('data-tab') === t ? 'on' : ''; }); Array.prototype.forEach.call(root.querySelectorAll('.tabpane'), function (p) { p.classList.toggle('hidden', p.id !== 'tab-' + t); }); };\n    tabs.onclick = function (e) { var t = e.target.getAttribute('data-tab'); if (t) show(t); };\n    Array.prototype.forEach.call(root.querySelectorAll('.sumcard'), function (a) { a.onclick = function (e) { e.preventDefault(); show(a.getAttribute('data-tab')); tabs.scrollIntoView({ block: 'start' }); }; });\n    root.addEventListener('click', function (e) { var b = e.target.closest('button[data-ck]'); if (b && opts.onChecklist) opts.onChecklist(b.getAttribute('data-ck')); });\n  }\n\n  /** 서면 체크리스트 인쇄용 HTML (관리 건 1개) */\n  function checklistHtml(ck, opts) {\n    var items = ck.items || [];\n    return '<div class=\"ck-sheet\" id=\"ck-' + h(ck.case_id) + '\"><h2>이상징후 현장 확인 체크리스트</h2>' +\n      '<table class=\"ck-head\"><tr><th>관리 건</th><td>' + h(ck.case_id) + '</td><th>중도매인</th><td>' + h(ck.wholesaler_id + ' ' + (ck.name || '')) + '</td></tr>' +\n      '<tr><th>발생 징후</th><td colspan=\"3\">' + h((ck.signals || []).join(', ') || '—') + '</td></tr>' +\n      '<tr><th>확인일</th><td>____년 __월 __일</td><th>확인 방법</th><td>□ 대면 □ 전화 □ 경매 현장 □ 기타</td></tr>' +\n      '<tr><th>확인자(경매사)</th><td>' + h(ck.auctioneer || '') + '</td><th>확인 상대방</th><td></td></tr></table>' +\n      '<table class=\"ck\"><thead><tr><th style=\"width:36px\">No</th><th style=\"width:70px\">구분</th><th>확인 항목</th><th style=\"width:40px\">예</th><th style=\"width:48px\">아니오</th><th style=\"width:48px\">미확인</th><th style=\"width:180px\">비고(사실만)</th></tr></thead><tbody>' +\n      items.map(function (it, i) { return '<tr><td>' + (i + 1) + '</td><td>' + h(it.category) + '</td><td>' + h(it.text) + (it.is_assumed ? ' <span class=\"muted\">(가정)</span>' : '') + '</td><td class=\"box\">☐</td><td class=\"box\">☐</td><td class=\"box\">☐</td><td></td></tr>'; }).join('') + '</tbody></table>' +\n      '<p class=\"muted\" style=\"font-size:12px\">확인된 사실만 체크하고, 의견은 아래 칸에 따로 적습니다. 체크 후 채권관리 담당자에게 전달하면 담당자가 결과를 전산에 입력합니다.</p>' +\n      '<table class=\"ck-head\"><tr><th>작성자 의견</th><td style=\"height:60px\"></td></tr><tr><th>결제계획·영업 상황</th><td style=\"height:40px\"></td></tr></table></div>';\n  }\n\n  global.SummaryView = { render: renderSummary, checklistHtml: checklistHtml, h: h };\n})(window);\n</script>\n<style>\n  .flowband { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 12px; font-size: 13.5px; }\n  .flowband .step { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; font-weight: 600; }\n  .flowband .step small { display: block; font-weight: 400; color: var(--text-2); font-size: 11.5px; }\n  .flowband .arr { color: var(--text-2); font-weight: 700; } .flowband .goal { margin-left: auto; color: var(--text-2); font-size: 12.5px; }\n  .sum3 { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 12px; }\n  .sumcard { display: block; background: var(--surface); border: 1px solid var(--border); border-left: 5px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); text-decoration: none; }\n  .sumcard:hover { text-decoration: none; background: var(--surface-2); }\n  .sumcard .k { font-size: 13px; color: var(--text-2); } .sumcard .v { font-size: 28px; font-weight: 700; line-height: 1.2; } .sumcard .v small { font-size: 13px; font-weight: 400; color: var(--text-2); margin-left: 4px; }\n  .sumcard .s { font-size: 12.5px; color: var(--text-2); }\n  .sumcard.bad { border-left-color: var(--bad); } .sumcard.warn { border-left-color: var(--warn); } .sumcard.ok { border-left-color: var(--ok); } .sumcard.info { border-left-color: var(--accent); }\n  .tabpane.hidden { display: none; }\n  .tabs button.on { background: var(--info-bg); font-weight: 600; }\n  .ck-sheet { background: #fff; color: #111; border: 1px solid #999; padding: 16px; margin: 12px 0; page-break-after: always; }\n  .ck-sheet h2 { margin: 0 0 8px; font-size: 17px; }\n  .ck-sheet table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin-bottom: 8px; }\n  .ck-sheet th, .ck-sheet td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; white-space: normal; color: #111; background: #fff; }\n  .ck-sheet th { background: #f0f0f0; font-weight: 600; width: 110px; }\n  .ck-sheet .ck th { width: auto; } .ck-sheet td.box { text-align: center; font-size: 16px; }\n  @media print { body * { visibility: hidden; } .ck-sheet, .ck-sheet * { visibility: visible; } .ck-sheet { position: absolute; left: 0; top: 0; width: 100%; } }\n</style>\n",
 "SnapshotTemplate": "<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>중도매인 채권관리 주간 현황</title>\n<!--STYLES-->\n<!--SUMMARYVIEW-->\n<style>\n  .shell { display: block; } main { max-width: 1100px; }\n  .topbar .statusbar { justify-content: flex-start; }\n  details > summary { cursor: pointer; font-weight: 600; margin: 6px 0; }\n</style>\n</head>\n<body>\n<header class=\"topbar\"><div class=\"brand\">중도매인 채권관리 주간 현황 <span class=\"ver\" id=\"snapFor\"></span></div><div class=\"statusbar\" id=\"statusbar\"></div><div class=\"who\">스냅샷 · 사내 공유용</div></header>\n<main id=\"view\"><p class=\"muted\">자료를 읽는 중…</p></main>\n<script>\nvar DATA = /*DATA*/null;\n(function () {\n  'use strict';\n  var h = SummaryView.h;\n  function wsName(id) { var w = (DATA.wholesalers || []).filter(function (x) { return x.wholesaler_id === id; })[0]; return w ? w.name : ''; }\n  var d = DATA, st = d.status;\n  document.getElementById('snapFor').textContent = d.for_user.name + ' (' + d.for_user.role + ') 용 · ' + d.generated_at + ' 생성';\n  document.getElementById('statusbar').innerHTML = '<span>기준일 <b>' + h(st.base_date) + '</b></span><span>집계기간 <b>' + h(d.meta.period12) + '</b></span><span>최종 갱신 <b>' + h(st.last_updated) + '</b></span><span>데이터 상태 <b>' + h(st.data_status || '자료없음') + '</b></span>';\n  var root = document.getElementById('view');\n  root.innerHTML = '<div class=\"note\">' + h(d.notes.privacy) + '</div><div id=\"summary\"></div><section id=\"checklists\"></section><section id=\"trendform\"></section><section id=\"wsdetail\"></section>';\n  SummaryView.render(document.getElementById('summary'), d, { web: false, onChecklist: function (caseId) { var el = document.getElementById('ck-' + caseId); if (el) { el.scrollIntoView(); } } });\n  // 체크리스트 인쇄 시트\n  var cks = document.getElementById('checklists');\n  cks.innerHTML = '<h1 style=\"font-size:18px\">현장 확인 체크리스트 (인쇄용)</h1>' + (d.checklists.length ? '<p class=\"muted\">브라우저 인쇄(Ctrl+P)로 출력해 경매사에게 전달하세요. 체크된 서면은 채권관리 담당자가 결과를 입력합니다.</p>' + d.checklists.map(function (ck) { return SummaryView.checklistHtml(ck); }).join('') : '<p class=\"muted\">현장 확인 대기 관리 건이 없습니다.</p>');\n  // 동향보고 파일 제출 폼(경매사용)\n  var openCases = d.cases.filter(function (c) { return c.status !== '종결' && c.status !== '재점검대기'; });\n  document.getElementById('trendform').innerHTML = '<h1 style=\"font-size:18px\">동향보고 파일 제출 (전산 입력 대신 파일로)</h1><div class=\"note\">작성 후 \"파일 만들기\"를 누르면 TREND_….json 파일이 내려옵니다. 사내 메일로 채권관리 담당자에게 보내면 다음 정기 처리 때 반영됩니다.</div>' +\n    '<form class=\"f\" id=\"tf\"><label>관리 건*<select name=\"case_id\" id=\"caseSel\">' + openCases.map(function (c) { return '<option value=\"' + h(c.case_id) + '\">' + h(c.case_id + ' ' + wsName(c.wholesaler_id)) + '</option>'; }).join('') + '</select></label>' +\n    '<label>작성자 이메일*<input name=\"writer_id\" value=\"' + h(d.for_user.user_id) + '\"></label><label>확인일*<input type=\"date\" name=\"checked_date\" required></label><label>확인 방법*<select name=\"check_method\">' + ['방문', '전화', '면담', '경매 현장', '기타'].map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></label>' +\n    '<label class=\"full\">확인된 사실* (한 줄에 하나, 의견은 쓰지 않음)<textarea name=\"facts\"></textarea></label><label>결제계획<input name=\"payment_plan\"></label><label>확인 결과 분류*<select name=\"result_class\"><option value=\"\">선택</option>' + d.resultClasses.map(function (r) { return '<option>' + h(r) + '</option>'; }).join('') + '</select></label><label>재점검일*<input type=\"date\" name=\"recheck_date\"></label>' +\n    '<label class=\"full\">작성자 의견 (사실과 별도)<textarea name=\"opinion\"></textarea></label><div class=\"full\"><button class=\"primary\" type=\"button\" id=\"mk\">파일 만들기</button> <span class=\"muted\" id=\"mkMsg\"></span></div></form>';\n  document.getElementById('mk').onclick = function () {\n    var f = document.getElementById('tf'), o = {};\n    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) o[el.name] = el.value; });\n    o.facts = String(o.facts || '').split('\\n').map(function (x) { return x.trim(); }).filter(Boolean);\n    var msg = document.getElementById('mkMsg');\n    if (!o.case_id || !o.checked_date || !o.facts.length || !o.result_class || !o.recheck_date) { msg.textContent = '관리 건·확인일·확인된 사실·결과 분류·재점검일은 필수입니다.'; return; }\n    o.submitted_at = new Date().toISOString(); o.snapshot_generated_at = d.generated_at;\n    var name = 'TREND_' + o.case_id + '_' + o.checked_date.replace(/-/g, '') + '.json';\n    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();\n    msg.textContent = name + ' 파일을 내려받았습니다.';\n  };\n  // 중도매인 상세(접기)\n  var won = function (n) { return n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('ko-KR') + '원'; };\n  var pct = function (g) { return !g ? '—' : g.status !== '정상' ? g.status : (g.value > 0 ? '+' : '') + (g.value * 100).toFixed(1) + '%'; };\n  document.getElementById('wsdetail').innerHTML = '<h1 style=\"font-size:18px\">중도매인별 현황 (' + d.wholesalers.length + '명)</h1>' + d.wholesalers.map(function (w) {\n    var all = w.byCategory['전체'];\n    return '<details id=\"ws-' + h(w.wholesaler_id) + '\"><summary>' + h(w.wholesaler_id + ' ' + w.name) + ' — 당월 ' + won(all.lastMonth.amount) + ' (전년 동월 대비 ' + h(pct(all.lastMonth.yoy)) + ') · 미수 ' + won(w.balance) + '</summary>' +\n      '<div class=\"scroll\"><table><thead><tr><th>부류</th><th class=\"num\">12개월 구매</th><th class=\"num\">당월(' + h(all.lastMonth.ym) + ')</th><th class=\"num\">전년 동월 대비</th><th class=\"num\">전년 누적 대비</th></tr></thead><tbody>' + Object.keys(w.byCategory).map(function (c) { var v = w.byCategory[c]; return '<tr><td>' + h(c) + '</td><td class=\"num\">' + won(v.amount12) + '</td><td class=\"num\">' + won(v.lastMonth.amount) + '</td><td class=\"num\">' + h(pct(v.lastMonth.yoy)) + '</td><td class=\"num\">' + h(pct(v.ytd.growth)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +\n      '<p class=\"muted\">한도: ' + (w.limits.map(function (l) { return h(l.limit_type) + ' ' + won(l.amount); }).join(' · ') || '없음') + ' / 담보: ' + (w.collaterals.map(function (c) { return h(c.type) + ' ' + won(c.set_amount) + (c.expiry_date ? '(만기 ' + h(c.expiry_date) + ')' : ''); }).join(' · ') || '없음') + ' / 연대보증: ' + h(w.guarantee ? w.guarantee.has : '—') + '</p></details>';\n  }).join('');\n  // 관리 건 앵커(요약표의 관리 건 링크용)\n  d.cases.forEach(function (c) { var a = document.createElement('div'); a.id = 'case-' + c.case_id; a.className = 'muted'; a.style.fontSize = '12px'; a.textContent = c.case_id + ' · ' + c.status + ' · ' + (c.auctioneer || ''); document.getElementById('wsdetail').appendChild(a); });\n})();\n</script>\n</body>\n</html>\n"
};
