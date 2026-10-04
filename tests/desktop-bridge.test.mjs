import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const source = fs
  .readFileSync(new URL("../src/desktop.js", import.meta.url), "utf8")
  .replace("__ORIGIN__", JSON.stringify("http://127.0.0.1:1234"))
  .replace("__NONCE__", JSON.stringify("test-nonce"));
function context(origin = "http://127.0.0.1:1234", iframe = false) {
  const events = new Map();
  const domEvents = new Map();
  let observer;
  const window = {
    addEventListener(name, callback) {
      events.set(name, callback);
    },
  };
  window.top = iframe ? {} : window;
  const timers = new Map();
  let id = 0;
  const sandbox = {
    window,
    location: { origin, href: "" },
    document: {
      title: "Paradise Code",
      head: { append() {}, appendChild() {} },
      createElement() {
        return {};
      },
      addEventListener(name, callback) {
        domEvents.set(name, callback);
      },
    },
    navigator: { platform: "MacIntel" },
    MutationObserver: class {
      constructor(callback) {
        observer = callback;
      }
      observe() {}
    },
    Map,
    URLSearchParams,
    Object,
    JSON,
    Element: class {},
    setTimeout(fn) {
      timers.set(++id, fn);
      return id;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
  };
  vm.runInNewContext(source, sandbox);
  return {
    ...sandbox,
    timers,
    events,
    domEvents,
    get observer() {
      return observer;
    },
  };
}
test("extension frames never receive the native bridge", () => {
  const c = context(undefined, true);
  assert.equal(c.window.paradiseDesktop, undefined);
  assert.equal(c.window.paradiseNative, undefined);
});
test("untrusted top-level origins never receive the bridge", () => {
  assert.equal(context("https://example.com").window.paradiseNative, undefined);
});
test("picker round trip carries safe encoded paths and resolves cancellation", async () => {
  const c = context();
  const result = c.window.paradiseDesktop.pick({
    folders: true,
    defaultPath: "/tmp/فارسی & files",
  });
  const url = new URL(c.location.href);
  assert.equal(url.searchParams.get("key"), "test-nonce");
  const payload = JSON.parse(url.searchParams.get("payload"));
  assert.equal(payload.defaultPath, "/tmp/فارسی & files");
  c.window.paradiseResolve(payload.id, null);
  assert.equal(await result, null);
  assert.equal(c.timers.size, 0);
});
test("picker timeout rejects and releases pending state", async () => {
  const c = context();
  const result = c.window.paradiseDesktop.pick({});
  const rejection = assert.rejects(result, /timed out/);
  [...c.timers.values()][0]();
  await rejection;
  c.window.paradiseResolve("1", ["/unrelated"]);
});
test("Mac Option-O uses the physical shortcut despite its alternate character", () => {
  const c = context();
  let command;
  let prevented = false;
  c.window.paradiseWorkbench = { executeCommand: (value) => (command = value) };
  c.events.get("keydown")({
    metaKey: true,
    altKey: true,
    key: "ø",
    code: "KeyO",
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {},
  });
  assert.equal(command, "workbench.action.files.openFolder");
  assert.equal(prevented, true);
});

test("native clipboard failures reject without leaving pending requests", async () => {
  const c = context();
  const result =
    c.window.paradiseDesktop.clipboard.writeText("فارسی & clipboard");
  const payload = JSON.parse(
    new URL(c.location.href).searchParams.get("payload"),
  );
  assert.equal(payload.operation, "writeText");
  assert.equal(payload.text, "فارسی & clipboard");
  c.window.paradiseResolve(payload.id, null, "Clipboard unavailable");
  await assert.rejects(result, /Clipboard unavailable/);
  assert.equal(c.timers.size, 0);
});
test("file paste keeps cut intent from the exact clipboard read", async () => {
  const c = context();
  const clipboard = c.window.paradiseDesktop.clipboard;
  let result = clipboard.readResources();
  let id = JSON.parse(new URL(c.location.href).searchParams.get("payload")).id;
  c.window.paradiseResolve(id, {
    paths: ["/tmp/فارسی & files"],
    moveFiles: true,
  });
  assert.deepEqual(Array.from(await result), ["/tmp/فارسی & files"]);
  assert.equal(clipboard.shouldMoveResources(), true);
  result = clipboard.readResources();
  id = JSON.parse(new URL(c.location.href).searchParams.get("payload")).id;
  c.window.paradiseResolve(id, {
    paths: ["/tmp/copied.txt"],
    moveFiles: false,
  });
  await result;
  assert.equal(clipboard.shouldMoveResources(), false);
});
test("Explorer copy is routed to the file command instead of browser text copy", () => {
  const c = context();
  let command;
  c.document.activeElement = {
    closest: (selector) => (selector === ".explorer-folders-view" ? {} : null),
  };
  c.window.paradiseWorkbench = {
    executeCommand(value) {
      command = value;
      return Promise.resolve();
    },
  };
  c.window.paradiseEdit("copy");
  assert.equal(command, "filesExplorer.copy");
});
test("renaming a file pastes text instead of moving clipboard files", () => {
  const c = context();
  let command;
  c.document.activeElement = {
    closest: (selector) => (selector.startsWith("input,") ? {} : null),
  };
  c.window.paradiseWorkbench = {
    executeCommand(value) {
      command = value;
      return Promise.resolve();
    },
  };
  c.window.paradiseEdit("paste");
  assert.equal(command, undefined);
  assert.equal(new URL(c.location.href).host, "edit-native");
  assert.equal(
    JSON.parse(new URL(c.location.href).searchParams.get("payload")),
    "paste",
  );
});
test("each native window follows the workbench title and dirty file changes", () => {
  const first = context(),
    second = context();
  first.document.title = "project فارسی — Paradise Code";
  second.document.title = "Second project — Paradise Code";
  first.domEvents.get("DOMContentLoaded")();
  second.domEvents.get("DOMContentLoaded")();
  assert.equal(
    JSON.parse(new URL(first.location.href).searchParams.get("payload")).title,
    first.document.title,
  );
  assert.equal(
    JSON.parse(new URL(second.location.href).searchParams.get("payload")).title,
    second.document.title,
  );
  const firstTitle = JSON.parse(
    new URL(first.location.href).searchParams.get("payload"),
  );
  first.window.paradiseResolve(firstTitle.id, null);
  first.document.title = "● test.ts — project فارسی — Paradise Code";
  first.observer();
  assert.equal(
    JSON.parse(new URL(first.location.href).searchParams.get("payload")).title,
    first.document.title,
  );
  assert.equal(
    JSON.parse(new URL(second.location.href).searchParams.get("payload")).title,
    second.document.title,
  );
});

test("concurrent clipboard requests are acknowledged in order, including after a failure", async () => {
  const c = context();
  const clipboard = c.window.paradiseDesktop.clipboard;
  const write = clipboard.writeText("first");
  const rejected = assert.rejects(write, /write failed/);
  const read = clipboard.readText();
  let payload = JSON.parse(
    new URL(c.location.href).searchParams.get("payload"),
  );
  assert.equal(payload.operation, "writeText");
  c.window.paradiseResolve(payload.id, null, "write failed");
  await rejected;
  payload = JSON.parse(new URL(c.location.href).searchParams.get("payload"));
  assert.equal(payload.operation, "readText");
  c.window.paradiseResolve(payload.id, "remaining text");
  assert.equal(await read, "remaining text");
  assert.equal(c.timers.size, 0);
});

test("native clipboard accelerators never also dispatch the browser file keybinding", () => {
  const c = context();
  const commands = [];
  c.document.activeElement = {
    closest: (selector) => (selector === ".explorer-folders-view" ? {} : null),
  };
  c.window.paradiseWorkbench = {
    executeCommand: (command) => {
      commands.push(command);
      return Promise.resolve();
    },
  };
  for (const code of ["KeyC", "KeyX", "KeyV"]) {
    let prevented = false,
      stopped = false;
    c.events.get("keydown")({
      metaKey: true,
      altKey: false,
      shiftKey: false,
      code,
      key: code.slice(-1).toLowerCase(),
      preventDefault() {
        prevented = true;
      },
      stopImmediatePropagation() {
        stopped = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(stopped, true);
  }
  assert.deepEqual(commands, [
    "filesExplorer.copy",
    "filesExplorer.cut",
    "filesExplorer.paste",
  ]);
  let stopped = false;
  c.events.get("keydown")({
    metaKey: true,
    altKey: false,
    shiftKey: true,
    code: "KeyC",
    key: "C",
    preventDefault() {},
    stopImmediatePropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, false);
});
test("an in-flight Explorer paste cannot start a second concurrent move", async () => {
  const c = context();
  let complete;
  let calls = 0;
  c.document.activeElement = {
    closest: (selector) => (selector === ".explorer-folders-view" ? {} : null),
  };
  c.window.paradiseWorkbench = {
    executeCommand: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  };
  c.window.paradiseEdit("paste");
  c.window.paradiseEdit("paste");
  assert.equal(calls, 1);
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  c.window.paradiseEdit("paste");
  assert.equal(calls, 2);
  complete();
});
test("editor shortcuts invoke Monaco clipboard actions, preserving its selection semantics", () => {
  const c = context();
  const commands = [];
  c.document.activeElement = {
    closest: (selector) =>
      selector === ".monaco-editor" || selector.startsWith("input,")
        ? {}
        : null,
  };
  c.window.paradiseWorkbench = {
    executeCommand: (command) => {
      commands.push(command);
      return Promise.resolve();
    },
  };
  for (const code of ["KeyC", "KeyX", "KeyV"]) {
    let prevented = false;
    c.events.get("keydown")({
      metaKey: true,
      code,
      key: code.slice(-1).toLowerCase(),
      preventDefault() {
        prevented = true;
      },
      stopImmediatePropagation() {},
    });
    assert.equal(prevented, true);
  }
  assert.deepEqual(commands, [
    "editor.action.clipboardCopyAction",
    "editor.action.clipboardCutAction",
    "editor.action.clipboardPasteAction",
  ]);
});
test("ordinary rename text shortcuts retain WKWebView default handling", () => {
  const c = context();
  c.document.activeElement = {
    closest: (selector) => (selector.startsWith("input,") ? {} : null),
  };
  for (const code of ["KeyC", "KeyX", "KeyV"]) {
    c.events.get("keydown")({
      metaKey: true,
      code,
      key: code.slice(-1).toLowerCase(),
      preventDefault() {
        assert.fail("Text clipboard default must not be cancelled");
      },
      stopImmediatePropagation() {
        assert.fail("Text clipboard event must propagate");
      },
    });
  }
});
