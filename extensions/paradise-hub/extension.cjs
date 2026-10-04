const vscode = require("vscode"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const run = promisify(execFile);
const { CATALOG_URL, validateCatalog } = require("./catalog.cjs");
function activate(context) {
  const output = vscode.window.createOutputChannel("Paradise Extensions");
  context.subscriptions.push(output);
  let panel,
    entries = [],
    offline = false,
    busy = false;
  const commands = [
    ["paradise.hub.open", open],
    ["paradise.hub.create", create],
    ["paradise.hub.package", () => pack()],
  ];
  for (const [id, handler] of commands)
    context.subscriptions.push(
      vscode.commands.registerCommand(id, (...args) =>
        invoke(() => handler(...args)),
      ),
    );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("paradise.extensions", {
      getTreeItem: (item) => item,
      getChildren: () => [],
    }),
  );
  async function invoke(handler) {
    try {
      return await handler();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(error.stack || message);
      vscode.window.showErrorMessage(message);
      await panel?.webview.postMessage({ type: "error", message });
    }
  }
  async function refresh() {
    try {
      const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
      entries = validateCatalog(await response.json());
      offline = false;
    } catch (error) {
      entries = validateCatalog(
        JSON.parse(
          fs.readFileSync(path.join(context.extensionPath, "catalog.json")),
        ),
      );
      offline = true;
      output.appendLine(`Using bundled catalog: ${error.message}`);
    }
    await state();
  }
  async function state() {
    if (!panel) return;
    await panel.webview.postMessage({
      type: "state",
      offline,
      busy,
      platform: process.platform,
      entries: entries.map((item) => {
        const installed = vscode.extensions.getExtension(item.id);
        return { ...item, installed: installed?.packageJSON.version || null };
      }),
    });
  }
  function open() {
    if (panel) {
      panel.reveal();
      return;
    }
    panel = vscode.window.createWebviewPanel(
      "paradiseHub",
      "Paradise Extensions",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
      },
    );
    const nonce = crypto.randomBytes(24).toString("base64"),
      media = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      );
    panel.webview.html = fs
      .readFileSync(
        path.join(context.extensionPath, "media/index.html"),
        "utf8",
      )
      .replaceAll("__CSP__", panel.webview.cspSource)
      .replaceAll("__NONCE__", nonce)
      .replaceAll("__MEDIA__", media.toString());
    panel.onDidDispose(
      () => {
        panel = null;
      },
      undefined,
      context.subscriptions,
    );
    panel.webview.onDidReceiveMessage(
      async (m) => {
        if (!m || typeof m !== "object") return;
        if (m.type === "ready" || m.type === "refresh") {
          await refresh();
          return;
        }
        if (m.type === "create") {
          await invoke(create);
          return;
        }
        if (m.type === "package") {
          await invoke(() => pack());
          return;
        }
        if (m.type === "open-vsx") {
          await vscode.commands.executeCommand("workbench.view.extensions");
          return;
        }
        const entry = entries.find((e) => e.id === m.id);
        if (!entry || busy) return;
        busy = true;
        await state();
        try {
          if (m.type === "install") await install(entry);
          else if (m.type === "remove") {
            if (
              entry.id === "paradise.network" &&
              process.platform === "darwin"
            ) {
              const service = require("./network-service.cjs");
              const data = path.join(
                path.dirname(context.globalStorageUri.fsPath),
                "paradise.network/history",
              );
              if (fs.existsSync(service.plistPath(data)))
                await service.disable(data);
            }
            await vscode.commands.executeCommand(
              "workbench.extensions.uninstallExtension",
              entry.id,
            );
          } else if (m.type === "open" && entry.id === "paradise.network")
            await vscode.commands.executeCommand("paradise.network.open");
        } catch (error) {
          output.appendLine(error.stack || error.message);
          vscode.window.showErrorMessage(error.message);
          panel?.webview.postMessage({ type: "error", message: error.message });
        } finally {
          busy = false;
          await state();
        }
      },
      undefined,
      context.subscriptions,
    );
  }
  async function install(entry) {
    if (!entry.platforms.includes(process.platform))
      throw new Error(
        "This extension does not support your operating system yet.",
      );
    const bundled = path.join(
      context.extensionPath,
      "packages",
      `${entry.id}-${entry.version}.vsix`,
    );
    let bytes;
    if (
      fs.existsSync(bundled) &&
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(bundled))
        .digest("hex") === entry.sha256
    )
      bytes = fs.readFileSync(bundled);
    else {
      const response = await fetch(entry.download, {
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new Error(`Download failed: HTTP ${response.status}`);
      // GitHub assets redirect only to its own CDN. Never accept an arbitrary final host.
      if (
        ![
          "github.com",
          "release-assets.githubusercontent.com",
          "objects.githubusercontent.com",
        ].includes(new URL(response.url).host)
      )
        throw new Error("Untrusted extension redirect.");
      if (Number(response.headers.get("content-length")) > 32 * 1024 * 1024)
        throw new Error("The extension package is too large.");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024)
          throw new Error("The extension package is too large.");
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    }
    if (
      crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw new Error(
        "Extension checksum verification failed. Nothing was installed.",
      );
    const cache = path.join(context.globalStorageUri.fsPath, "packages");
    fs.mkdirSync(cache, { recursive: true });
    const file = path.join(cache, `${entry.id}-${entry.version}.vsix`);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    try {
      await vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        vscode.Uri.file(file),
      );
      vscode.window
        .showInformationMessage(`${entry.name} installed.`, "Open")
        .then((choice) => {
          if (choice === "Open" && entry.id === "paradise.network")
            vscode.commands.executeCommand("paradise.network.open");
        });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }
  async function create() {
    const name = await vscode.window.showInputBox({
      title: "Create a Paradise extension",
      prompt: "A short extension name, such as focus-timer",
      validateInput: (value) =>
        /^[a-z][a-z0-9-]{1,50}$/.test(value)
          ? null
          : "Use 2–51 lowercase letters, numbers or hyphens.",
    });
    if (!name) return;
    const parent = await vscode.window.showOpenDialog({
      title: "Where should the extension live?",
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    if (!parent) return;
    const root = path.join(parent[0].fsPath, name);
    if (fs.existsSync(root))
      throw new Error(
        "That folder already exists. Choose a new extension name.",
      );
    fs.mkdirSync(root);
    const command = `local.${name}.hello`;
    const manifest = {
      name,
      publisher: "local",
      version: "0.1.0",
      displayName: name,
      description: "My Paradise Code extension",
      license: "MIT",
      engines: { vscode: "^1.140.0" },
      main: "extension.cjs",
      extensionKind: ["workspace"],
      contributes: { commands: [{ command, title: `${name}: Hello` }] },
    };
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    fs.copyFileSync(
      path.join(context.extensionPath, "sdk/index.cjs"),
      path.join(root, "paradise-sdk.cjs"),
    );
    fs.copyFileSync(
      path.join(context.extensionPath, "sdk/index.d.ts"),
      path.join(root, "paradise-sdk.d.ts"),
    );
    fs.writeFileSync(
      path.join(root, "extension.cjs"),
      `const { defineExtension } = require('./paradise-sdk.cjs');\nmodule.exports = defineExtension(api => {\n  api.command('${command}', () => api.notify('Hello from ${name}!'));\n  api.status('$(sparkle) ${name}', '${command}');\n});\n`,
    );
    fs.writeFileSync(
      path.join(root, "README.md"),
      `# ${name}\n\nA local Paradise Code extension. Use Paradise: Package and Install Extension to run it.\n`,
    );
    fs.writeFileSync(
      path.join(root, ".vscodeignore"),
      ".git/**\n*.vsix\nnode_modules/**\n",
    );
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(root),
    );
    vscode.window.showInformationMessage(
      "Your extension is ready to edit. Run Paradise: Package and Install Extension to try it.",
    );
  }
  async function pack(directory) {
    if (!vscode.workspace.isTrusted)
      throw new Error(
        "Trust the extension project before packaging: prepublish scripts can execute local code.",
      );
    const selected =
      directory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!selected) throw new Error("Open an extension folder first.");
    let manifest;
    try {
      manifest = JSON.parse(
        fs.readFileSync(path.join(selected, "package.json")),
      );
    } catch {
      throw new Error("The open folder is not an extension project.");
    }
    if (
      !manifest.engines?.vscode ||
      !manifest.main ||
      !/^[a-z0-9][a-z0-9-]*$/.test(manifest.publisher || "") ||
      !/^[a-z0-9][a-z0-9-]*$/.test(manifest.name || "") ||
      !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version || "")
    )
      throw new Error("This package is missing its extension manifest fields.");
    const file = path.join(
      selected,
      `${manifest.name}-${manifest.version}.vsix`,
    );
    // Use the official VSIX packager. Bundled Node/npm run it; first use downloads it.
    const npm = path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Packaging your extension (first use downloads the VSIX tool)…",
      },
      async () => {
        try {
          const result = await run(
            process.execPath,
            [
              npm,
              "exec",
              "--yes",
              "--package=@vscode/vsce@4.0.0",
              "--",
              "vsce",
              "package",
              "--allow-missing-repository",
              "--skip-license",
              "--no-dependencies",
              "--out",
              file,
            ],
            { cwd: selected, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
          );
          output.appendLine(result.stdout);
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            vscode.Uri.file(file),
          );
          vscode.window.showInformationMessage(
            `${manifest.displayName || manifest.name} installed. Run its command from the Command Palette.`,
          );
        } catch (error) {
          output.appendLine(error.stderr || error.message);
          output.show();
          throw new Error(
            "Packaging failed. See Paradise Extensions output. First use requires internet; installed packager dependencies are cached.",
          );
        }
      },
    );
  }
  let cleanupTimer;
  async function cleanupNetwork() {
    if (
      process.platform !== "darwin" ||
      vscode.extensions.getExtension("paradise.network")
    )
      return;
    const service = require("./network-service.cjs");
    const data = path.join(
      path.dirname(context.globalStorageUri.fsPath),
      "paradise.network/history",
    );
    if (fs.existsSync(service.plistPath(data))) await service.disable(data);
  }
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      state();
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(
        () =>
          cleanupNetwork().catch((error) => output.appendLine(error.message)),
        2000,
      );
    }),
    {
      dispose() {
        clearTimeout(cleanupTimer);
      },
    },
  );
  cleanupNetwork().catch((error) => output.appendLine(error.message));
  return { refresh, install, create, pack };
}
module.exports = { activate };
