import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { SERVICES, TESTS, DASH_PORT, AUTO_RUN_INTERVAL_MS } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Auth config ───────────────────────────────────────────────────────────────
const DASH_SECRET = process.env.DASH_SECRET || "changeme";
const COOKIE_NAME = "egin_dash_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

if (DASH_SECRET === "changeme") {
  console.warn("[WARN] DASH_SECRET is default. Set env DASH_SECRET=<strong_password>!");
}

// ── Signed cookie helpers ─────────────────────────────────────────────────────
function signSession(payload) {
  const data = JSON.stringify(payload);
  const b64 = Buffer.from(data).toString("base64");
  const sig = createHmac("sha256", DASH_SECRET).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

function verifySession(raw) {
  if (!raw) return null;
  const [b64, sig] = raw.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", DASH_SECRET).update(b64).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64").toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((c) => c.trim().split("=").map(decodeURIComponent))
  );
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies[COOKIE_NAME]);
  if (session) return next();
  // Allow WebSocket upgrade without redirect
  if (req.headers.upgrade === "websocket") return next();
  res.redirect("/login");
}

// ── Cloudflare IP passthrough (trust CF-Connecting-IP) ───────────────────────
function clientIp(req) {
  return req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Login routes (public) ─────────────────────────────────────────────────────
app.get("/login", (_req, res) => {
  res.sendFile(join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { password } = req.body;
  const ip = clientIp(req);

  // Constant-time comparison
  let ok = false;
  try {
    ok = timingSafeEqual(
      Buffer.from(password || ""),
      Buffer.from(DASH_SECRET)
    );
  } catch {
    ok = false;
  }

  if (!ok) {
    console.log(`[AUTH] Failed login attempt from ${ip}`);
    return res.redirect("/login?error=1");
  }

  const token = signSession({ sub: "admin", exp: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}; Path=/`
  );
  console.log(`[AUTH] Login success from ${ip}`);
  res.redirect("/");
});

app.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Max-Age=0; Path=/`);
  res.redirect("/login");
});

// ── Static + protected routes ─────────────────────────────────────────────────
app.use(requireAuth);
app.use(express.static(join(__dirname, "public")));

// ── Manual trigger ────────────────────────────────────────────────────────────
app.post("/api/run", async (_req, res) => {
  const result = await runAllTests();
  broadcast({ type: "run_complete", result });
  res.json({ ok: true, runId: result.runId });
});

// ── Get last result ───────────────────────────────────────────────────────────
app.get("/api/last", (_req, res) => {
  res.json(lastResult || { ok: false, message: "No run yet" });
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set();
wss.on("connection", (ws, req) => {
  // Auth check for WS
  const cookies = parseCookies(req.headers.cookie || "");
  if (!verifySession(cookies[COOKIE_NAME])) {
    ws.close(4401, "Unauthorized");
    return;
  }
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  // Send last result immediately on connect
  if (lastResult) ws.send(JSON.stringify({ type: "run_complete", result: lastResult }));
  ws.send(JSON.stringify({ type: "log", entries: logBuffer }));
});

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(raw);
  }
}

// ── Logger ────────────────────────────────────────────────────────────────────
const logBuffer = [];
const MAX_LOG = 500;

function log(level, msg, data) {
  const entry = { ts: new Date().toISOString(), level, msg, data: data ?? null };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG) logBuffer.shift();
  broadcast({ type: "log_entry", entry });
  const prefix = level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[32m";
  console.log(`${prefix}[${level}]\x1b[0m ${entry.ts} ${msg}`);
}

// ── Test runner ───────────────────────────────────────────────────────────────
let lastResult = null;

async function runTest(test, serviceUrl, token) {
  const url = `${serviceUrl}${test.path}`;
  const start = Date.now();

  const headers = {
    "Content-Type": "application/json",
    ...(test.headers || {}),
  };
  if (token && test.auth !== false) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let status = 0;
  let body = null;
  let responseHeaders = {};
  let error = null;

  try {
    const res = await fetch(url, {
      method: test.method,
      headers,
      body: test.body ? JSON.stringify(test.body) : undefined,
      signal: AbortSignal.timeout(test.expect.maxMs || 8000),
    });
    status = res.status;
    responseHeaders = Object.fromEntries(res.headers.entries());
    try {
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch { body = null; }
  } catch (err) {
    error = err.message || String(err);
  }

  const duration = Date.now() - start;

  // Evaluate pass/fail
  const expectedStatuses = Array.isArray(test.expect.status)
    ? test.expect.status
    : [test.expect.status];

  let status_result = "FAIL";
  if (error) {
    status_result = "FAIL";
  } else if (expectedStatuses.includes(status)) {
    status_result = "PASS";
  } else {
    status_result = "FAIL";
  }

  // Timing warning
  if (status_result === "PASS" && test.expect.maxMs && duration > test.expect.maxMs * 0.8) {
    status_result = "WARN";
  }

  // Special CORS check
  let corsNote = null;
  if (test.id === "cors_preflight") {
    const acao = responseHeaders["access-control-allow-origin"];
    if (!acao) {
      status_result = "FAIL";
      corsNote = "Missing Access-Control-Allow-Origin header";
    } else {
      corsNote = `Access-Control-Allow-Origin: ${acao}`;
    }
  }

  return {
    id: test.id,
    name: test.name,
    group: test.group,
    status: status_result,
    duration,
    request: { method: test.method, url, body: test.body ?? null, headers },
    response: { status, body, headers: responseHeaders },
    expected: { status: expectedStatuses },
    error,
    note: corsNote || test.note || null,
  };
}

async function runAllTests() {
  const runId = randomBytes(4).toString("hex");
  const startedAt = new Date().toISOString();
  log("INFO", `▶ Run started [${runId}]`);
  broadcast({ type: "run_start", runId });

  // Step 1: resolve service URLs (test prod URL, fallback to local)
  const resolvedUrls = {};
  for (const [key, svc] of Object.entries(SERVICES)) {
    try {
      const r = await fetch(svc.url + "/", { signal: AbortSignal.timeout(3000) });
      resolvedUrls[key] = { url: svc.url, reachable: r.ok || r.status < 500 };
    } catch {
      // fallback to local
      try {
        const r2 = await fetch(svc.localUrl + "/", { signal: AbortSignal.timeout(2000) });
        resolvedUrls[key] = { url: svc.localUrl, reachable: r2.ok || r2.status < 500 };
        log("WARN", `${svc.name}: prod unreachable, using local ${svc.localUrl}`);
      } catch {
        resolvedUrls[key] = { url: svc.url, reachable: false };
        log("WARN", `${svc.name}: completely unreachable`);
      }
    }
  }
  broadcast({ type: "services_status", services: resolvedUrls });

  // Step 2: try to get a real token with test credentials
  let token = null;
  const backendUrl = resolvedUrls.backend?.url || SERVICES.backend.url;
  try {
    const { TEST_PHONE, TEST_PASSWORD } = await import("./config.js");
    if (TEST_PHONE && TEST_PASSWORD) {
      const r = await fetch(`${backendUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const d = await r.json();
        token = d?.data?.access_token || d?.access_token || null;
        if (token) log("INFO", "✓ Test token obtained for authenticated tests");
      }
    }
  } catch {
    log("WARN", "Could not obtain test token — authenticated tests will run without token");
  }

  // Step 3: run all tests
  const results = [];
  for (const test of TESTS) {
    const serviceInfo = resolvedUrls[test.service];
    const serviceUrl = serviceInfo?.url || SERVICES[test.service]?.url || "";

    let result;
    if (!serviceInfo?.reachable) {
      result = {
        id: test.id,
        name: test.name,
        group: test.group,
        status: "SKIP",
        duration: 0,
        request: { method: test.method, url: serviceUrl + test.path, body: null, headers: {} },
        response: { status: 0, body: null, headers: {} },
        expected: { status: Array.isArray(test.expect.status) ? test.expect.status : [test.expect.status] },
        error: "Service unreachable",
        note: null,
      };
    } else {
      result = await runTest(test, serviceUrl, token);
    }

    results.push(result);
    broadcast({ type: "test_result", result });
    log(
      result.status === "PASS" ? "INFO" : result.status === "WARN" ? "WARN" : "ERROR",
      `${result.status.padEnd(4)} [${result.duration}ms] ${result.name}`,
      result.error || null
    );
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    warn: results.filter((r) => r.status === "WARN").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    skip: results.filter((r) => r.status === "SKIP").length,
  };

  const finishedAt = new Date().toISOString();
  log(
    summary.fail > 0 ? "ERROR" : "INFO",
    `■ Run [${runId}] done — PASS:${summary.pass} WARN:${summary.warn} FAIL:${summary.fail} SKIP:${summary.skip}`
  );

  lastResult = {
    runId,
    startedAt,
    finishedAt,
    durationMs: Date.now() - new Date(startedAt).getTime(),
    services: resolvedUrls,
    summary,
    tests: results,
  };

  return lastResult;
}

// ── Auto-run ──────────────────────────────────────────────────────────────────
if (AUTO_RUN_INTERVAL_MS > 0) {
  // Initial run after 2s (let server settle)
  setTimeout(() => runAllTests(), 2000);
  setInterval(() => runAllTests(), AUTO_RUN_INTERVAL_MS);
  log("INFO", `Auto-run every ${AUTO_RUN_INTERVAL_MS / 1000}s`);
}

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(DASH_PORT, () => {
  console.log(`\x1b[32m╔══════════════════════════════════════════╗`);
  console.log(`║   EGIN DASH  →  http://localhost:${DASH_PORT}  ║`);
  console.log(`╚══════════════════════════════════════════╝\x1b[0m`);
  console.log(`   Auth: DASH_SECRET env var (currently ${DASH_SECRET === "changeme" ? "\x1b[31mDEFAULT — CHANGE IT\x1b[0m" : "\x1b[32mset\x1b[0m"})`);
});
