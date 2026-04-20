// ── State ─────────────────────────────────────────────────────────────────────
let lastResult = null;
let activeTestId = null;
let runInProgress = false;
let testStates = {}; // id -> result (partial during run)

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws = null;
let wsReconnectTimer = null;

function connectWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    setWsDot("connected");
    clearTimeout(wsReconnectTimer);
  };

  ws.onclose = () => {
    setWsDot("error");
    wsReconnectTimer = setTimeout(connectWs, 3000);
  };

  ws.onerror = () => setWsDot("error");

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  };
}

function setWsDot(state) {
  const el = document.getElementById("ws-dot");
  el.className = "ws-dot";
  if (state === "connected") el.classList.add("connected");
  if (state === "error") el.classList.add("error");
}

// ── Message handler ───────────────────────────────────────────────────────────
function handleMessage(msg) {
  if (msg.type === "run_start") {
    runInProgress = true;
    testStates = {};
    setProgress(5);
    setBtn(true);
    appendLog({ ts: new Date().toISOString(), level: "INFO", msg: `▶ Run started [${msg.runId}]` });
  }

  if (msg.type === "services_status") {
    renderServices(msg.services);
  }

  if (msg.type === "test_result") {
    testStates[msg.result.id] = msg.result;
    const done = Object.keys(testStates).length;
    const total = document.querySelectorAll(".test-row").length || done;
    setProgress(Math.min(95, 5 + (done / Math.max(total, 1)) * 90));
    updateTestRow(msg.result);
    if (activeTestId === msg.result.id) renderDetail(msg.result);
  }

  if (msg.type === "run_complete") {
    runInProgress = false;
    lastResult = msg.result;
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
    setBtn(false);
    renderAll(msg.result);
    setLastRun(msg.result.finishedAt, msg.result.summary);
  }

  if (msg.type === "log_entry") {
    appendLog(msg.entry);
  }

  if (msg.type === "log") {
    (msg.entries || []).forEach(appendLog);
  }
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll(result) {
  renderServices(result.services);
  renderSummary(result.summary);
  renderTestList(result.tests);
  if (activeTestId) {
    const t = result.tests.find((t) => t.id === activeTestId);
    if (t) renderDetail(t);
  }
}

// ── Services ──────────────────────────────────────────────────────────────────
function renderServices(services) {
  const el = document.getElementById("services-strip");
  el.innerHTML = Object.entries(services).map(([key, svc]) => {
    const up = svc.reachable;
    return `<div class="service-card">
      <div class="svc-dot ${up ? "up" : "down"}"></div>
      <div class="svc-info">
        <div class="svc-name">${key === "backend" ? "Backend API" : key === "frontend" ? "Frontend" : "GIS Service"}</div>
        <div class="svc-url" title="${svc.url}">${svc.url}</div>
      </div>
      <div class="svc-latency">${up ? "↑" : "↓"}</div>
    </div>`;
  }).join("");
}

// ── Summary ───────────────────────────────────────────────────────────────────
function renderSummary(s) {
  document.getElementById("s-pass").textContent = s.pass;
  document.getElementById("s-warn").textContent = s.warn;
  document.getElementById("s-fail").textContent = s.fail;
  document.getElementById("s-skip").textContent = s.skip;
}

// ── Test list ─────────────────────────────────────────────────────────────────
function renderTestList(tests) {
  const groups = {};
  for (const t of tests) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }

  const el = document.getElementById("test-list");
  el.innerHTML = Object.entries(groups).map(([group, items]) => {
    const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
    items.forEach((i) => counts[i.status] = (counts[i.status] || 0) + 1);

    const pills = [
      counts.PASS ? `<span class="pill pill-pass">${counts.PASS} pass</span>` : "",
      counts.FAIL ? `<span class="pill pill-fail">${counts.FAIL} fail</span>` : "",
      counts.WARN ? `<span class="pill pill-warn">${counts.WARN} warn</span>` : "",
      counts.SKIP ? `<span class="pill pill-skip">${counts.SKIP} skip</span>` : "",
    ].filter(Boolean).join("");

    const rows = items.map((t) => testRowHtml(t)).join("");
    return `<div class="group-section">
      <div class="group-header">${group}<div class="group-counts">${pills}</div></div>
      ${rows}
    </div>`;
  }).join("");
}

function testRowHtml(t) {
  const active = activeTestId === t.id ? " active" : "";
  const ms = t.duration > 0 ? `${t.duration}ms` : "";
  return `<div class="test-row${active}" id="row-${t.id}" onclick="selectTest('${t.id}')">
    <div class="test-status s-${t.status}">${t.status}</div>
    <div class="test-name" title="${t.name}">${t.name}</div>
    <div class="test-ms">${ms}</div>
  </div>`;
}

function updateTestRow(t) {
  const el = document.getElementById(`row-${t.id}`);
  if (!el) return;
  el.querySelector(".test-status").className = `test-status s-${t.status}`;
  el.querySelector(".test-status").textContent = t.status;
  el.querySelector(".test-ms").textContent = t.duration > 0 ? `${t.duration}ms` : "";
}

// ── Detail pane ───────────────────────────────────────────────────────────────
function selectTest(id) {
  activeTestId = id;
  document.querySelectorAll(".test-row").forEach((r) => r.classList.remove("active"));
  const row = document.getElementById(`row-${id}`);
  if (row) row.classList.add("active");

  const t = lastResult?.tests?.find((t) => t.id === id) || testStates[id];
  if (t) renderDetail(t);
}

function renderDetail(t) {
  const statusColor = { PASS: "var(--green)", FAIL: "var(--red)", WARN: "var(--yellow)", SKIP: "var(--muted)" };

  const reqBody = t.request.body ? JSON.stringify(t.request.body, null, 2) : "(none)";
  const sanitizedReqBody = reqBody.replace(/"password"\s*:\s*"[^"]*"/g, '"password": "***"');

  const resBody = t.response.body === null
    ? "(no response)"
    : typeof t.response.body === "string"
    ? t.response.body
    : JSON.stringify(t.response.body, null, 2);

  const resHeaders = Object.entries(t.response.headers || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const el = document.getElementById("detail-pane");
  el.innerHTML = `
    <div class="detail-title">
      <div class="test-status s-${t.status}" style="width:auto;padding:0 8px">${t.status}</div>
      ${escHtml(t.name)}
    </div>
    <div class="detail-meta">
      <span>ID: ${t.id}</span>
      <span>Группа: ${t.group}</span>
      ${t.duration ? `<span>${t.duration}ms</span>` : ""}
      ${t.response.status ? `<span>HTTP ${t.response.status}</span>` : ""}
      <span>Ожидался: ${t.expected.status.join(" | ")}</span>
    </div>

    ${t.note ? `<div class="note-box">ℹ ${escHtml(t.note)}</div>` : ""}
    ${t.error ? `<div class="error-box">✕ ${escHtml(t.error)}</div>` : ""}

    <div class="detail-section">
      <div class="detail-section-title">Запрос</div>
      <div class="code-block">${escHtml(t.request.method)} ${escHtml(t.request.url)}\n\n${escHtml(sanitizedReqBody)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Ответ — тело</div>
      <div class="code-block">${escHtml(resBody.slice(0, 4000))}${resBody.length > 4000 ? "\n… (truncated)" : ""}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Ответ — заголовки</div>
      <div class="code-block">${escHtml(resHeaders || "(none)")}</div>
    </div>
  `;
}

// ── Log pane ──────────────────────────────────────────────────────────────────
let autoScroll = true;
const logScroll = document.getElementById("log-scroll");

logScroll.addEventListener("scroll", () => {
  const { scrollTop, scrollHeight, clientHeight } = logScroll;
  autoScroll = scrollHeight - scrollTop - clientHeight < 40;
});

function appendLog(entry) {
  const el = document.createElement("div");
  el.className = "log-line";
  el.innerHTML = `
    <span class="log-ts">${entry.ts.replace("T", " ").replace("Z", "")}</span>
    <span class="log-level ${entry.level}">${entry.level}</span>
    <span class="log-msg">${escHtml(entry.msg)}${entry.data ? ` — ${escHtml(String(entry.data))}` : ""}</span>
  `;
  logScroll.appendChild(el);
  if (autoScroll) logScroll.scrollTop = logScroll.scrollHeight;
  // Keep max 300 log lines in DOM
  while (logScroll.children.length > 300) logScroll.removeChild(logScroll.firstChild);
}

function clearLogs() {
  logScroll.innerHTML = "";
}

// ── Progress ──────────────────────────────────────────────────────────────────
function setProgress(pct) {
  document.getElementById("progress").style.width = pct + "%";
}

function setBtn(disabled) {
  const btn = document.getElementById("btn-run");
  btn.disabled = disabled;
  btn.textContent = disabled ? "Выполняется…" : "▶ Запустить тесты";
}

function setLastRun(ts, summary) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("ru-RU");
  const icon = summary.fail > 0 ? "✕" : summary.warn > 0 ? "!" : "✓";
  document.getElementById("last-run").textContent =
    `${icon} Последний прогон: ${time} | ${summary.pass}✓ ${summary.fail ? summary.fail + "✗" : ""}`;
}

// ── Trigger run ───────────────────────────────────────────────────────────────
async function triggerRun() {
  if (runInProgress) return;
  await fetch("/api/run", { method: "POST" });
}

// ── Export modal ──────────────────────────────────────────────────────────────
function openExport() {
  if (!lastResult) {
    alert("Нет данных. Сначала запустите тесты.");
    return;
  }
  const text = buildExportText(lastResult);
  document.getElementById("export-text").value = text;
  document.getElementById("modal").classList.add("open");
}

function closeExport() {
  document.getElementById("modal").classList.remove("open");
}

function copyExport() {
  const ta = document.getElementById("export-text");
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.querySelector(".modal-actions .btn-primary");
    btn.textContent = "Скопировано ✓";
    setTimeout(() => { btn.textContent = "Копировать"; }, 2000);
  });
}

// Builds a compact, Claude-friendly report
function buildExportText(result) {
  const lines = [
    "=== EGIN MONITOR — ОТЧЁТ О ТЕСТИРОВАНИИ ===",
    `Запуск: ${result.runId}`,
    `Начало: ${result.startedAt}`,
    `Конец:  ${result.finishedAt}`,
    `Итого:  ${result.durationMs}ms`,
    "",
    "── СВОДКА ──",
    `PASS: ${result.summary.pass}  WARN: ${result.summary.warn}  FAIL: ${result.summary.fail}  SKIP: ${result.summary.skip}`,
    "",
    "── СЕРВИСЫ ──",
    ...Object.entries(result.services).map(([k, v]) =>
      `${k.padEnd(10)} ${v.reachable ? "UP  " : "DOWN"} ${v.url}`
    ),
    "",
    "── ТЕСТЫ ──",
  ];

  const byGroup = {};
  for (const t of result.tests) {
    if (!byGroup[t.group]) byGroup[t.group] = [];
    byGroup[t.group].push(t);
  }

  for (const [group, tests] of Object.entries(byGroup)) {
    lines.push(`\n[${group}]`);
    for (const t of tests) {
      lines.push(`  ${t.status.padEnd(5)} ${String(t.duration || 0).padStart(5)}ms  HTTP ${t.response.status || "---"}  ${t.name}`);
      if (t.status === "FAIL" || t.status === "WARN") {
        if (t.error) lines.push(`         error: ${t.error}`);
        if (t.note) lines.push(`         note: ${t.note}`);
        if (t.response.status && !t.expected.status.includes(t.response.status)) {
          lines.push(`         expected: ${t.expected.status.join("|")}  got: ${t.response.status}`);
        }
        if (t.response.body && typeof t.response.body === "object") {
          const snippet = JSON.stringify(t.response.body).slice(0, 300);
          lines.push(`         body: ${snippet}`);
        }
      }
    }
  }

  lines.push("\n── КОНЕЦ ОТЧЁТА ──");
  return lines.join("\n");
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Close modal on overlay click
document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this) closeExport();
});

// ── Init ──────────────────────────────────────────────────────────────────────
connectWs();

// Fetch last result on load
fetch("/api/last")
  .then((r) => r.json())
  .then((data) => {
    if (data.runId) {
      lastResult = data;
      renderAll(data);
      setLastRun(data.finishedAt, data.summary);
    }
  })
  .catch(() => {});
