// ── Target service URLs ───────────────────────────────────────────────────────
export const SERVICES = {
  backend: {
    name: "Backend API",
    url: process.env.BACKEND_URL || "https://egin-api.perricheno.ru",
    localUrl: "http://localhost:3000",
  },
  frontend: {
    name: "Frontend",
    url: process.env.FRONTEND_URL || "https://egin.perricheno.ru",
    localUrl: "http://localhost:3001",
  },
  gis: {
    name: "GIS Service",
    url: process.env.GIS_URL || "http://localhost:8080",
    localUrl: "http://localhost:8080",
  },
};

// ── Dashboard port ────────────────────────────────────────────────────────────
export const DASH_PORT = Number(process.env.DASH_PORT) || 4999;

// ── Auto-run interval (ms). 0 = disabled ─────────────────────────────────────
export const AUTO_RUN_INTERVAL_MS = Number(process.env.AUTO_RUN_MS) || 60_000;

// ── Test token (optional). Set in env to enable authenticated tests ───────────
export const TEST_TOKEN = process.env.TEST_TOKEN || null;

// ── Test credentials (for auth flow test) ────────────────────────────────────
export const TEST_PHONE = process.env.TEST_PHONE || "+77000000001";
export const TEST_PASSWORD = process.env.TEST_PASSWORD || "test_pass_egin";

// ── Test definitions ──────────────────────────────────────────────────────────
// Each test: { id, name, group, service, method, path, body?, headers?, expect }
// expect.status: number | number[]  — acceptable HTTP status codes
// expect.bodyContains: string[]     — strings that must appear in response body
// expect.maxMs: number              — max acceptable response time
//
export const TESTS = [
  // ── Infrastructure ──────────────────────────────────────────────────────────
  {
    id: "backend_root",
    name: "Backend / root",
    group: "Infrastructure",
    service: "backend",
    method: "GET",
    path: "/",
    expect: { status: [200, 204, 301, 302], maxMs: 3000 },
  },
  {
    id: "backend_health",
    name: "Backend /health",
    group: "Infrastructure",
    service: "backend",
    method: "GET",
    path: "/health",
    expect: { status: [200, 204], maxMs: 3000 },
  },
  {
    id: "frontend_root",
    name: "Frontend /",
    group: "Infrastructure",
    service: "frontend",
    method: "GET",
    path: "/",
    expect: { status: [200, 301, 302], maxMs: 5000 },
  },
  {
    id: "gis_overpass",
    name: "GIS /api/overpass (bbox test)",
    group: "Infrastructure",
    service: "gis",
    method: "GET",
    path: "/api/overpass?s=43.2&w=76.8&n=43.4&e=77.0",
    expect: { status: [200, 504], maxMs: 10000 },
  },

  // ── Auth ────────────────────────────────────────────────────────────────────
  {
    id: "auth_login_invalid",
    name: "POST /auth/login — wrong creds → 401",
    group: "Auth",
    service: "backend",
    method: "POST",
    path: "/auth/login",
    body: { phone: "+70000000000", password: "wrongpassword" },
    expect: { status: 401, maxMs: 4000 },
  },
  {
    id: "auth_login_no_body",
    name: "POST /auth/login — empty body → 400",
    group: "Auth",
    service: "backend",
    method: "POST",
    path: "/auth/login",
    body: {},
    expect: { status: 400, maxMs: 3000 },
  },
  {
    id: "auth_register_short_pw",
    name: "POST /auth/register — short password → 400",
    group: "Auth",
    service: "backend",
    method: "POST",
    path: "/auth/register",
    body: { phone: "+77001112233", password: "123", fullName: "Test User", region: "A", district: "B", role: "farmer" },
    expect: { status: 400, maxMs: 3000 },
  },

  // ── Auth (with test credentials, if TEST_TOKEN set) ────────────────────────
  {
    id: "auth_login_real",
    name: "POST /auth/login — test credentials",
    group: "Auth",
    service: "backend",
    method: "POST",
    path: "/auth/login",
    body: { phone: TEST_PHONE, password: TEST_PASSWORD },
    expect: { status: [200, 401], maxMs: 5000 },
    note: "201 = success, 401 = creds not in DB",
  },

  // ── Protected endpoints (no auth → 401) ────────────────────────────────────
  {
    id: "users_me_unauth",
    name: "GET /users/me — no auth → 401",
    group: "Users",
    service: "backend",
    method: "GET",
    path: "/users/me",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "farm_plots_unauth",
    name: "GET /farm-plots — no auth → 401",
    group: "Farm Plots",
    service: "backend",
    method: "GET",
    path: "/farm-plots",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "farm_plots_mine_unauth",
    name: "GET /farm-plots/mine — no auth → 401",
    group: "Farm Plots",
    service: "backend",
    method: "GET",
    path: "/farm-plots/mine",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "farm_plots_post_unauth",
    name: "POST /farm-plots — no auth → 401",
    group: "Farm Plots",
    service: "backend",
    method: "POST",
    path: "/farm-plots",
    body: { title: "Test" },
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "dashboard_home_unauth",
    name: "GET /dashboard/home — no auth → 401",
    group: "Dashboard",
    service: "backend",
    method: "GET",
    path: "/dashboard/home",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "dashboard_notifications_unauth",
    name: "GET /dashboard/notifications — no auth → 401",
    group: "Dashboard",
    service: "backend",
    method: "GET",
    path: "/dashboard/notifications",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "analytics_overproduction_unauth",
    name: "GET /analytics/overproduction-risk — no auth → 401",
    group: "Analytics",
    service: "backend",
    method: "GET",
    path: "/analytics/overproduction-risk",
    expect: { status: [401, 404], maxMs: 3000 },
  },
  {
    id: "analytics_crop_density_unauth",
    name: "GET /analytics/crop-density — no auth → 401",
    group: "Analytics",
    service: "backend",
    method: "GET",
    path: "/analytics/crop-density",
    expect: { status: [401, 404], maxMs: 3000 },
  },
  {
    id: "orders_my_unauth",
    name: "GET /orders/my — no auth → 401",
    group: "Orders",
    service: "backend",
    method: "GET",
    path: "/orders/my",
    expect: { status: 401, maxMs: 3000 },
  },
  {
    id: "services_list",
    name: "GET /services — public list",
    group: "Services",
    service: "backend",
    method: "GET",
    path: "/services",
    expect: { status: [200, 401], maxMs: 4000 },
  },
  {
    id: "services_categories",
    name: "GET /services/categories",
    group: "Services",
    service: "backend",
    method: "GET",
    path: "/services/categories",
    expect: { status: [200, 401], maxMs: 4000 },
  },
  {
    id: "info_center_unauth",
    name: "GET /info-center — public or 401",
    group: "Info Center",
    service: "backend",
    method: "GET",
    path: "/info-center",
    expect: { status: [200, 401, 404], maxMs: 4000 },
  },

  // ── CORS preflight ──────────────────────────────────────────────────────────
  {
    id: "cors_preflight",
    name: "OPTIONS /farm-plots — CORS preflight",
    group: "CORS",
    service: "backend",
    method: "OPTIONS",
    path: "/farm-plots",
    headers: {
      Origin: "https://egin.perricheno.ru",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization",
    },
    expect: { status: [200, 204], maxMs: 2000 },
    note: "Response must include Access-Control-Allow-Origin header",
  },
];
