const api = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
let running = false,
  enabled = false;
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
$("record").onclick = () => {
  api.postMessage({ type: enabled ? "disable" : "enable" });
  $("record").disabled = true;
};
$("range").onsubmit = (e) => {
  e.preventDefault();
  api.postMessage({ type: "range", from: $("from").value, to: $("to").value });
};
$("export").onclick = () => api.postMessage({ type: "export" });
$("folder").onclick = () => api.postMessage({ type: "folder" });
window.addEventListener("message", ({ data: m }) => {
  if (m.type === "error") {
    $("error").textContent = m.message;
    $("error").hidden = false;
    $("record").disabled = false;
    return;
  }
  if (m.type !== "state") return;
  $("error").hidden = true;
  running = m.running;
  enabled = m.enabled;
  $("record").disabled = !m.supported;
  $("record").textContent = enabled ? "Stop recording" : "Start recording";
  $("status").textContent = !m.supported
    ? "macOS required"
    : running
      ? "Recording"
      : enabled
        ? "Reconnecting…"
        : "Not recording";
  $("rx").textContent = running ? bytes(m.state.rxRate) : "—";
  $("tx").textContent = running ? bytes(m.state.txRate) : "—";
  $("record-note").textContent = !m.supported
    ? "This extension currently reads macOS network counters."
    : "Runs locally, including while the editor is closed. No usage data is uploaded.";
  if (document.activeElement !== $("from")) $("from").value = m.range.from;
  if (document.activeElement !== $("to")) $("to").value = m.range.to;
  $("total-rx").textContent = bytes(m.stats.rx);
  $("total-tx").textContent = bytes(m.stats.tx);
  $("observed").textContent =
    m.stats.observedSeconds >= 3600
      ? `${Math.floor(m.stats.observedSeconds / 3600)}h ${Math.floor((m.stats.observedSeconds % 3600) / 60)}m`
      : `${Math.floor(m.stats.observedSeconds / 60)}m ${Math.floor(m.stats.observedSeconds % 60)}s`;
  $("export").disabled = !m.stats.rowCount;
  $("empty").hidden = !!m.stats.days.length;
  $("days").hidden = !m.stats.days.length;
  const tbody = $("days").querySelector("tbody");
  tbody.replaceChildren();
  const max = Math.max(1, ...m.stats.days.map((d) => d.rx + d.tx));
  for (const day of m.stats.days) {
    const tr = document.createElement("tr");
    for (const value of [day.date, bytes(day.rx), bytes(day.tx)]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    const td = document.createElement("td"),
      bar = document.createElement("span");
    bar.className = "bar";
    bar.style.width = `${((day.rx + day.tx) / max) * 100}%`;
    td.append(bar);
    tr.append(td);
    tbody.append(tr);
  }
  const peak = Math.max(1, ...m.recent.flatMap((p) => [p.rx, p.tx]));
  for (const key of ["rx", "tx"])
    $(key + "-line").setAttribute(
      "d",
      m.recent
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${(i / Math.max(1, m.recent.length - 1)) * 600},${115 - (p[key] / peak) * 105}`,
        )
        .join(" "),
    );
  $("scale").textContent = m.recent.length
    ? `${bytes(peak)}/s peak · last ${m.recent.length * (m.state?.interval || 2)}s`
    : "Waiting for samples";
  $("coverage").textContent = m.state?.interfaces?.length
    ? `Interfaces: ${m.state.interfaces.join(", ")} · ${m.state.interval}s samples · ${m.stats.gaps} recorded interruptions`
    : "No samples recorded yet.";
  $("first").textContent = m.state?.firstObserved
    ? `First recorded: ${new Date(m.state.firstObserved).toLocaleString()} · Dates use this Mac’s local time zone.`
    : "";
  if (m.state?.error) {
    $("error").textContent = m.state.error;
    $("error").hidden = false;
  }
});
api.postMessage({ type: "ready" });
