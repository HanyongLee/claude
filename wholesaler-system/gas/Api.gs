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
    return readTable_('DB_MASTER', 'M_USER').filter(function (u) { return !u.is_deleted; }).map(stripInternal_);
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
    var market = marketGrowth_(daily, calendar, active, base), counts = {}, perWs = [];
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
