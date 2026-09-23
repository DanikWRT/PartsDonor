(function () {
  var p = document.querySelector('.pd-f7-panel');
  if (!p) return 'NO PANEL';
  var badge = p.querySelector('.pd-f7-badge') ? p.querySelector('.pd-f7-badge').textContent : 'none';
  var notice = p.querySelector('.pd-f7-notice') ? p.querySelector('.pd-f7-notice').textContent : 'no-notice';
  var active = (p.querySelector('.pd-f7-status-btn.active') || {}).textContent || 'none';
  return 'badge=' + badge + ' | activeBtn=' + active + ' | notice=' + notice;
})()
