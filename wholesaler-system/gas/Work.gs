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
