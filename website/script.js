const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const index = tabs.indexOf(tab);
    const destination = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (destination >= 0) { event.preventDefault(); selectTab(tabs[destination], true); }
  });
}
// Only published, same-repository release links may become direct downloads.
fetch('/release.json').then(response => {
  if (!response.ok) throw new Error('Release metadata unavailable');
  return response.json();
}).then(release => {
  if (!release.published || !/^\d+\.\d+\.\d+$/.test(release.version)) return;
  const valid = value => {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === 'github.com' && url.pathname.startsWith('/alimortazavi-pr/paradise-code/releases/');
  };
  if (![release.download, release.checksum, release.notes].every(valid)) return;
  for (const element of document.querySelectorAll('[data-version]')) element.textContent = release.version;
  const link = document.getElementById('download-app');
  link.href = release.download;
  link.querySelector('span').textContent = 'Download for Apple Silicon';
  document.getElementById('checksum').href = release.checksum;
  document.getElementById('release-notes').href = release.notes;
}).catch(() => { /* A working releases page remains available without JavaScript or metadata. */ });
