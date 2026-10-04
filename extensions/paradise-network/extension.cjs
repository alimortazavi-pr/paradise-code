const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const service = require("./service.cjs");
function activate(context) {
  const data = path.join(context.globalStorageUri.fsPath, "history");
  fs.mkdirSync(data, { recursive: true });
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    20,
  );
  status.command = "paradise.network.open";
  status.name = "Paradise Network";
  context.subscriptions.push(status);
  let panel, timer, range;
  let recent = [];
  function readStatus() {
    try {
      return JSON.parse(fs.readFileSync(path.join(data, "status.json")));
    } catch {
      return null;
    }
  }
  function bytes(n) {
    if (!Number.isFinite(n)) return "—";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let i = 0;
    while (n >= 1024 && i < 4) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  }
  function localDate(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  let cachedHistory = null;
  function summary(state, from, to, includeRows = false) {
    const files = fs
      .readdirSync(data)
      .filter(
        (f) =>
          /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) &&
          f.slice(0, 10) >= from &&
          f.slice(0, 10) <= to,
      );
    const signature =
      from +
      to +
      files
        .map((f) => f + ":" + fs.statSync(path.join(data, f)).size)
        .join(",");
    if (cachedHistory?.signature !== signature) {
      const rows = [];
      let rx = 0,
        tx = 0,
        observedSeconds = 0,
        gaps = 0;
      const days = {};
      for (const file of files)
        for (const line of fs
          .readFileSync(path.join(data, file), "utf8")
          .split("\n")) {
          if (!line) continue;
          let row;
          try {
            row = JSON.parse(line);
          } catch {
            throw new Error(
              "A history file is incomplete. Export your history before repairing it.",
            );
          }
          if (
            row.date !== file.slice(0, 10) ||
            ![row.time, row.rx, row.tx, row.observedSeconds, row.gaps].every(
              (n) => Number.isFinite(n) && n >= 0,
            )
          )
            throw new Error(
              "Invalid history sample. Original files are preserved.",
            );
          rows.push(row);
          rx += row.rx;
          tx += row.tx;
          observedSeconds += row.observedSeconds;
          gaps += row.gaps;
          days[row.date] ??= { date: row.date, rx: 0, tx: 0 };
          days[row.date].rx += row.rx;
          days[row.date].tx += row.tx;
        }
      cachedHistory = { signature, rows, rx, tx, observedSeconds, gaps, days };
    }
    const result = {
      rx: cachedHistory.rx,
      tx: cachedHistory.tx,
      observedSeconds: cachedHistory.observedSeconds,
      gaps: cachedHistory.gaps,
      rowCount: cachedHistory.rows.length,
    };
    const days = Object.fromEntries(
      Object.entries(cachedHistory.days).map(([date, day]) => [
        date,
        { ...day },
      ]),
    );
    const current =
      state?.current?.date >= from &&
      state.current.date <= to &&
      cachedHistory.rows.at(-1)?.time !== state.current.time
        ? state.current
        : null;
    if (current) {
      result.rx += current.rx;
      result.tx += current.tx;
      result.observedSeconds += current.observedSeconds;
      result.gaps += current.gaps;
      result.rowCount++;
      days[current.date] ??= { date: current.date, rx: 0, tx: 0 };
      days[current.date].rx += current.rx;
      days[current.date].tx += current.tx;
    }
    result.days = Object.values(days).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (includeRows)
      result.rows = current
        ? [...cachedHistory.rows, current]
        : cachedHistory.rows;
    return result;
  }
  async function render() {
    const state = readStatus(),
      enabled = fs.existsSync(service.plistPath(data)),
      running =
        enabled &&
        state &&
        !state.error &&
        Date.now() - state.updatedAt < Math.max(15000, state.interval * 5000);
    status.text = running
      ? `$(arrow-down) ${bytes(state.rxRate)}/s  $(arrow-up) ${bytes(state.txRate)}/s`
      : "$(pulse) Network";
    status.tooltip = running
      ? "Paradise Network · physical interface traffic"
      : "Open network usage and recording controls";
    if (process.platform === "darwin") status.show();
    if (!panel) return;
    const today = localDate(Date.now());
    range ??= { from: today, to: today };
    if (running && recent.at(-1)?.time !== state.updatedAt) {
      recent.push({
        time: state.updatedAt,
        rx: state.rxRate,
        tx: state.txRate,
      });
      recent = recent.slice(-60);
    }
    try {
      const stats = summary(state, range.from, range.to);
      await panel.webview.postMessage({
        type: "state",
        supported: process.platform === "darwin",
        running,
        enabled,
        state,
        range,
        stats,
        recent,
      });
    } catch (error) {
      await panel.webview.postMessage({
        type: "error",
        message: error.message,
      });
    }
  }
  const busy = { value: false };
  async function action(message) {
    if (!message || typeof message !== "object") return;
    try {
      if (message.type === "ready") return render();
      if (message.type === "range") {
        const { validateRange } = await import("./core.mjs");
        validateRange(message.from, message.to);
        range = { from: message.from, to: message.to };
        return render();
      }
      if (
        !["enable", "disable", "export", "folder"].includes(message.type) ||
        busy.value
      )
        return;
      busy.value = true;
      if (message.type === "enable") {
        fs.writeFileSync(
          path.join(data, "config.json"),
          JSON.stringify({
            interval: vscode.workspace
              .getConfiguration("paradise.network")
              .get("sampleSeconds", 2),
          }),
          { mode: 0o600 },
        );
        await service.enable(data, context.extensionPath);
        vscode.window.showInformationMessage(
          "Network recording started. It continues while Paradise Code is closed. Stop it here at any time.",
        );
      } else if (message.type === "disable") {
        await service.disable(data);
        vscode.window.showInformationMessage(
          "Recording stopped. Your history is preserved.",
        );
      } else if (message.type === "folder")
        await vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(data),
        );
      else {
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(data, "network-history.csv")),
          filters: { CSV: ["csv"] },
        });
        if (uri) {
          const rows = summary(readStatus(), range.from, range.to, true).rows;
          const csv =
            "time,date,received_bytes,sent_bytes,observed_seconds,gaps\n" +
            rows
              .map((r) =>
                [
                  new Date(r.time).toISOString(),
                  r.date,
                  r.rx,
                  r.tx,
                  r.observedSeconds,
                  r.gaps,
                ].join(","),
              )
              .join("\n");
          await vscode.workspace.fs.writeFile(uri, Buffer.from(csv));
          vscode.window.showInformationMessage("Network history exported.");
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(error.message);
      panel?.webview.postMessage({ type: "error", message: error.message });
    } finally {
      busy.value = false;
      render();
    }
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("paradise.network.open", () => {
      if (panel) {
        panel.reveal();
        return;
      }
      panel = vscode.window.createWebviewPanel(
        "paradiseNetwork",
        "Network Usage",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, "media")),
          ],
        },
      );
      const nonce = crypto.randomBytes(24).toString("base64");
      const media = panel.webview.asWebviewUri(
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
      panel.webview.onDidReceiveMessage(
        action,
        undefined,
        context.subscriptions,
      );
      panel.onDidDispose(
        () => {
          panel = null;
        },
        undefined,
        context.subscriptions,
      );
    }),
    vscode.commands.registerCommand("paradise.network.stop", () =>
      action({ type: "disable" }),
    ),
  );
  timer = setInterval(render, 2000);
  context.subscriptions.push({
    dispose() {
      clearInterval(timer);
    },
  });
  render();
  // Keep the collector's path valid after an editor update, but only if the user enabled it.
  if (process.platform === "darwin" && fs.existsSync(service.plistPath(data)))
    service
      .enable(data, context.extensionPath)
      .catch((e) =>
        vscode.window.showWarningMessage(
          `Network recording could not resume: ${e.message}`,
        ),
      );
  return {
    open: () => vscode.commands.executeCommand("paradise.network.open"),
    dataFolder: data,
  };
}
module.exports = { activate };
