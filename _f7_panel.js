(function () {
  const p = document.querySelector('.pd-f7-panel');
  if (!p) return 'NO PANEL';
  const title = (p.querySelector('.pd-f7-title') || {}).textContent || '';
  const sel = document.querySelector('.pd-layer-btn.selected');
  const badges = Array.from(p.querySelectorAll('.pd-f7-badge')).map(function (b) { return b.textContent; });
  const props = Array.from(p.querySelectorAll('.pd-f7-props > div')).map(function (d) { return d.innerText.replace(/\n/g, ' '); });
  const statusBtns = Array.from(p.querySelectorAll('.pd-f7-status-btn')).map(function (b) { return b.textContent + (b.classList.contains('active') ? '*ACTIVE' : ''); });
  const noAuth = p.innerText.indexOf('Необходим вход') >= 0;
  return 'panel=' + title + ' | sel=' + (sel ? sel.title : 'none') + ' | badges=' + badges.join(',') + ' | props=' + props.join('; ') + ' | statusBtns=' + statusBtns.join(',') + ' | noAuth=' + noAuth;
})()
