/**
 * Config.gs — 전역 설정과 시트 스키마 정의
 * 이 파일은 Google 서비스를 호출하지 않는다(테스트 환경에서도 그대로 로드 가능).
 */

var APP = {
  NAME: '중도매인 통합관리',
  VERSION: '0.2.0-phase1',
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
    M_CALENDAR: ['date:date', 'is_auction_day:bool', 'note:text']
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
    A_STATUS: ['key:text', 'value:text', 'updated_at:datetime']
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
