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
      'attach_ids:text', 'situation_code:text'].concat(AUDIT_COLS)
      .concat(['dunning_round:num', 'sent_method:text', 'sent_date:date']),   // 독촉 이력(끝에 추가해 기존 시트 자동 이관)
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
/** 독촉 발송 방법과 단계 안내 — [확인 필요] 내부 규정의 독촉 절차·서식으로 교체 */
var DUNNING = {
  METHODS: ['전화', '문자·카톡', '우편(일반)', '내용증명', '대면'],
  ESCALATION_NOTE: '[가정] 1차 일반 독촉 → 2차 재독촉 → 3차 내용증명. 3차 이후에도 미이행 시 법적 조치 검토(매뉴얼 조항 근거 확인).'
};

var ACTION_TYPES = [   // [확인 필요] 내부 조치 유형 목록으로 교체. needsApproval 은 거래제한·한도변경은 항상 true
  { type: '결제 독려', needsApproval: false },
  { type: '결제계획 확인', needsApproval: false },
  { type: '독촉장 발송', needsApproval: false, dunning: true },   // 차수·발송 방법·발송일을 구조화해 기록
  { type: '추가 담보 요청', needsApproval: true },
  { type: '한도 조정 요청', needsApproval: true },
  { type: '거래 조건 변경 요청', needsApproval: true },
  { type: '거래 제한 요청', needsApproval: true },
  { type: '기타', needsApproval: false }
];
