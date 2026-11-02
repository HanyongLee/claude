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
