/**
 * Config.gs — 전역 설정과 시트 스키마 정의
 * 이 파일은 Google 서비스를 호출하지 않는다(테스트 환경에서도 그대로 로드 가능).
 */

var APP = {
  NAME: '중도매인 통합관리',
  VERSION: '0.3.0-phase2',
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
  CATEGORIES: ['과일', '채소'],
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
  BACKUP: '90_백업'
};

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
    M_USER: ['user_id:text', 'name:text', 'role:text', 'status:text'].concat(AUDIT_COLS),
    M_CALENDAR: ['date:date', 'is_auction_day:bool', 'note:text'],
    // 운영 기준값. 회사 내부 기준은 이 시트(드라이브)에만 두고 코드에는 가정값만 둔다. is_assumed=true 면 '가정값' 표시
    M_SETTING: ['key:text', 'value:text', 'label:text', 'unit:text', 'is_assumed:bool', 'note:text'].concat(AUDIT_COLS),
    M_DOC: ['doc_id:text', 'doc_name:text', 'doc_type:text', 'owner_dept:text', 'note:text'].concat(AUDIT_COLS),
    M_DOC_VER: ['doc_id:text', 'version:text', 'effective_from:date', 'effective_to:date', 'file_id:text', 'file_hash:text',
      'note:text'].concat(AUDIT_COLS),
    M_SITUATION: ['situation_code:text', 'label:text', 'condition_json:json', 'note:text'].concat(AUDIT_COLS),
    M_PROCEDURE: ['proc_step_id:text', 'situation_code:text', 'step_no:num', 'content:text', 'checks:text', 'doc_id:text',
      'doc_version:text', 'article:text', 'page:text'].concat(AUDIT_COLS),
    M_PROC_FORM: ['proc_step_id:text', 'form_doc_id:text', 'required:bool'].concat(AUDIT_COLS)
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
    A_STATUS: ['key:text', 'value:text', 'updated_at:datetime']
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
  ['APPROVER_ROLE', 'ADMIN', '조치·종결 승인 역할(ADMIN | CREDIT_LEAD 등 사용자 역할)', '']
];

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
