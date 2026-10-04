// Inserted only in the trusted, top-level local workbench. No Tauri IPC grants.
if (window === window.top && location.origin === __ORIGIN__) {
  const key = __NONCE__;
  const pending = new Map();
  const mac = /Mac/.test(navigator.platform);
  let sequence = 0;
  let resourcesShouldMove = false;
  const requests = [];
  let requesting = false;
  const nextRequest = () => {
    if (requesting || !requests.length) return;
    requesting = true;
    requests.shift()();
  };
  const send = (action, payload) => {
    const query = new URLSearchParams({ key });
    if (payload) query.set("payload", JSON.stringify(payload));
    location.href = `paradise-native://${action}?${query}`;
  };
  Object.defineProperty(window, "paradiseNative", { value: send });
  const request = (action, payload, timeout = 15000) =>
    new Promise((resolve, reject) => {
      // A second location change can cancel the first WKWebView navigation.
      // Wait for acknowledgement before sending another native request.
      requests.push(() => {
        const id = String(++sequence);
        const finish = (result, error) => {
          clearTimeout(timer);
          pending.delete(id);
          requesting = false;
          if (error) reject(new Error(error));
          else resolve(result);
          nextRequest();
        };
        const timer = setTimeout(
          () => finish(null, "The native request timed out. Please try again."),
          timeout,
        );
        pending.set(id, finish);
        send(action, { ...payload, id });
      });
      nextRequest();
    });
  Object.defineProperty(window, "paradiseDesktop", {
    value: Object.freeze({
      pick: (options) => request("picker", options, 300000),
      ...(mac
        ? {
            clipboard: Object.freeze({
              readText: () => request("clipboard", { operation: "readText" }),
              writeText: (text) =>
                request("clipboard", { operation: "writeText", text }),
              readResources: async () => {
                const result = await request("clipboard", {
                  operation: "readResources",
                });
                resourcesShouldMove = result.moveFiles === true;
                return result.paths;
              },
              shouldMoveResources: () => resourcesShouldMove,
              writeResources: (paths, moveFiles = false) =>
                request("clipboard", {
                  operation: "writeResources",
                  paths,
                  moveFiles,
                }),
            }),
          }
        : {}),
    }),
  });
  Object.defineProperty(window, "paradiseResolve", {
    value: (id, result, error) => {
      const resolve = pending.get(id);
      pending.delete(id);
      resolve?.(result, error);
    },
  });
  const editing = new Set();
  Object.defineProperty(window, "paradiseEdit", {
    value: (action) => {
      if (!["copy", "cut", "paste"].includes(action)) return;
      const active = document.activeElement;
      const textInput = active?.closest(
        'input,textarea,[contenteditable="true"],[role="textbox"]',
      );
      let command;
      if (
        !textInput &&
        active?.closest(".explorer-folders-view") &&
        window.paradiseWorkbench
      ) {
        command = `filesExplorer.${action}`;
      } else if (
        active?.closest(".monaco-editor") &&
        window.paradiseWorkbench
      ) {
        command = `editor.action.clipboard${action[0].toUpperCase() + action.slice(1)}Action`;
      }
      if (command) {
        if (editing.has(action)) return;
        editing.add(action);
        Promise.resolve(window.paradiseWorkbench.executeCommand(command))
          .catch(console.error)
          .finally(() => editing.delete(action));
      } else if (mac) {
        send("edit-native", action);
      } else {
        document.execCommand(action);
      }
    },
  });
  window.close = () => send("request-close");
  window.addEventListener(
    "keydown",
    (event) => {
      // Route DOM shortcuts through the same entry point as the native menu.
      // Cancel the upstream keybinding so a paste cannot run two file moves.
      if (
        mac &&
        event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        ["KeyC", "KeyX", "KeyV"].includes(event.code) &&
        ((!document.activeElement?.closest(
          'input,textarea,[contenteditable="true"],[role="textbox"]',
        ) &&
          document.activeElement?.closest(".explorer-folders-view")) ||
          document.activeElement?.closest(".monaco-editor"))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.paradiseEdit(
          { KeyC: "copy", KeyX: "cut", KeyV: "paste" }[event.code],
        );
        return;
      }
      if (
        event.metaKey &&
        event.altKey &&
        (event.code === "KeyO" || event.key.toLowerCase() === "o")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.paradiseWorkbench?.executeCommand(
          "workbench.action.files.openFolder",
        );
        return;
      }
      if (event.metaKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        event.stopImmediatePropagation();
        send("request-quit");
      }
    },
    true,
  );
  Object.defineProperty(window, "paradiseUpdateStatus", {
    value: (message) => {
      let status = document.getElementById("paradise-update-status");
      if (!message) {
        status?.remove();
        return;
      }
      if (!status) {
        status = document.createElement("div");
        status.id = "paradise-update-status";
        status.setAttribute("role", "status");
        status.style.cssText =
          "position:fixed;bottom:36px;right:20px;z-index:100000;padding:12px 18px;border-radius:8px;font:13px system-ui;background:var(--vscode-notifications-background,#25212d);color:var(--vscode-notifications-foreground,#fff);border:1px solid var(--vscode-widget-border,#625173);box-shadow:0 4px 16px #0004;pointer-events:none";
        document.body.append(status);
      }
      status.textContent = message;
    },
  });
  Object.defineProperty(window, "paradiseUpdateLock", {
    value: (locked) => {
      const workbench = document.querySelector(".monaco-workbench");
      if (workbench) workbench.inert = locked;
      window.paradiseUpdateStatus(
        locked ? "Work saved. Waiting to restart…" : null,
      );
    },
  });
  document.addEventListener("DOMContentLoaded", () => {
    let previousTitle;
    const updateTitle = () => {
      const title = document.title || "Paradise Code";
      if (title !== previousTitle) {
        previousTitle = title;
        request("title", { title }).catch(console.error);
      }
    };
    new MutationObserver(updateTitle).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    updateTitle();
    const style = document.createElement("style");
    style.textContent = `${mac ? ".monaco-workbench .part.titlebar > .titlebar-container { padding-left: 80px !important; box-sizing: border-box; } .monaco-workbench .part.titlebar .window-controls-container { display: none !important; }" : ""} .monaco-workbench .editor-group-watermark .letterpress { background-image: none !important; background-color: var(--vscode-editor-foreground); opacity: .06; mask: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 256 256%27%3E%3Cpath fill-rule=%27evenodd%27 d=%27M56%2058%20150%2034%20208%2070v68l-98%2028v60l-54-31V58Zm54%2040v31l60-17V81Z%27/%3E%3C/svg%3E") center / contain no-repeat; }`;
    document.head.append(style);
  });
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (
      !event.target.closest(".part.titlebar") ||
      event.target.closest(
        'a,button,input,[role="button"],.action-item,.command-center',
      )
    )
      return;
    if (event.detail === 2) send("zoom");
    else send("drag");
  });
}
