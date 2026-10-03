// Inserted only in the trusted, top-level local workbench. No Tauri IPC grants.
if (window === window.top && location.origin === __ORIGIN__) {
  const key = __NONCE__;
  const pending = new Map();
  let sequence = 0;
  const send = (action, payload) => {
    const query = new URLSearchParams({ key });
    if (payload) query.set('payload', JSON.stringify(payload));
    location.href = `paradise-native://${action}?${query}`;
  };
  Object.defineProperty(window, 'paradiseNative', { value: send });
  Object.defineProperty(window, 'paradiseDesktop', { value: Object.freeze({
    pick: options => new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('The file dialog timed out. Please try again.')); }, 300000);
      pending.set(id, result => { clearTimeout(timer); resolve(result); });
      send('picker', { ...options, id });
    })
  }) });
  Object.defineProperty(window, 'paradiseResolve', { value: (id, result) => {
    const resolve = pending.get(id); pending.delete(id); resolve?.(result);
  } });
  window.close = () => send('request-close');
  window.addEventListener('keydown', event => {
    if (event.metaKey && event.altKey && (event.code === 'KeyO' || event.key.toLowerCase() === 'o')) {
      event.preventDefault(); event.stopImmediatePropagation();
      window.paradiseWorkbench?.executeCommand('workbench.action.files.openFolder');
      return;
    }
    if (event.metaKey && event.key.toLowerCase() === 'q') {
      event.preventDefault(); event.stopImmediatePropagation(); send('request-quit');
    }
  }, true);
  Object.defineProperty(window, 'paradiseUpdateStatus', { value: message => {
    let status = document.getElementById('paradise-update-status');
    if (!message) { status?.remove(); return; }
    if (!status) {
      status = document.createElement('div'); status.id = 'paradise-update-status';
      status.setAttribute('role', 'status');
      status.style.cssText = 'position:fixed;bottom:36px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;font:13px system-ui;background:var(--vscode-notifications-background,#25212d);color:var(--vscode-notifications-foreground,#fff);border:1px solid var(--vscode-widget-border,#625173);box-shadow:0 4px 16px #0004;pointer-events:none';
      document.body.append(status);
    }
    status.textContent = message;
  } });
  Object.defineProperty(window, 'paradiseUpdateLock', { value: locked => {
    const workbench = document.querySelector('.monaco-workbench');
    if (workbench) workbench.inert = locked;
    window.paradiseUpdateStatus(locked ? 'Work saved. Waiting to restart…' : null);
  } });
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `.monaco-workbench .part.titlebar > .titlebar-container { padding-left: 80px !important; box-sizing: border-box; } .monaco-workbench .part.titlebar .window-controls-container { display: none !important; } .monaco-workbench .editor-group-watermark .letterpress { background-image: none !important; background-color: var(--vscode-editor-foreground); opacity: .06; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 256 256%27%3E%3Cpath fill-rule=%27evenodd%27 d=%27M56%2058%20150%2034%20208%2070v68l-98%2028v60l-54-31V58Zm54%2040v31l60-17V81Z%27/%3E%3C/svg%3E") center / contain no-repeat; }`;
    document.head.append(style);
  });
  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest('.part.titlebar') || event.target.closest('a,button,input,[role="button"],.action-item,.command-center')) return;
    if (event.detail === 2) send('zoom'); else send('drag');
  });
}
