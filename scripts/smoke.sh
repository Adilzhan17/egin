#!/usr/bin/env bash
# Read-only smoke test of a deployed Egin stack. Creates no data.
# Usage: scripts/smoke.sh [API_URL] [WEB_URL]
set -u
API="${1:-${API_URL:-https://egin-api.perricheno.com}}"
WEB="${2:-${WEB_URL:-https://egin.perricheno.com}}"
fail=0

check() { # name expected method url
  local name="$1" expected="$2" method="$3" url="$4" code
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X "$method" "$url")
  if [[ "$code" == "$expected" ]]; then printf 'ok   %-4s %-52s %s\n' "$method" "${url#"$API"}" "$code"
  else printf 'FAIL %-4s %-52s got %s, want %s (%s)\n' "$method" "${url#"$API"}" "$code" "$expected" "$name"; fail=1; fi
}

echo "== web ($WEB)"
check web-root 200 GET "$WEB/"

echo "== public API ($API)"
for p in / /health /api/health /crops /marketplace/listings /services /services/categories; do check public 200 GET "$API$p"; done
check unknown 404 GET "$API/definitely-not-a-route"

echo "== protected API must answer 401 without a token"
for p in /users/me /dashboard /dashboard/home /dashboard/notifications /dashboard/insights /farm-plots /farm-plots/mine \
  /marketplace/listings/my /orders/my /chats /chats/channels /services/mine /services/providers/me \
  /info-center/categories /info-center/feed /info-center/articles /api-usage/stats; do check auth 401 GET "$API$p"; done
check auth 401 POST "$API/orders"
check auth 401 POST "$API/farm-plots"
check auth 401 POST "$API/marketplace/listings"
check auth 401 POST "$API/crops"
check auth 401 PATCH "$API/crops/00000000-0000-4000-8000-000000000000"
check auth 401 POST "$API/api-usage/increment/google_maps"

echo "== /metrics must not be public"
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$API/metrics")
if [[ "$code" == 401 || "$code" == 404 ]]; then echo "ok   GET  /metrics -> $code"; else echo "FAIL GET  /metrics -> $code (must be 401/404)"; fail=1; fi

echo "== seeded admin credentials must be rejected"
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"phone":"+77777777777","password":"password123"}' "$API/auth/login")
[[ "$code" == 401 || "$code" == 429 ]] && echo "ok   POST /auth/login default admin -> $code" || { echo "FAIL POST /auth/login default admin -> $code"; fail=1; }

echo "== validation"
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$API/auth/login")
[[ "$code" == 400 ]] && echo "ok   POST /auth/login empty body -> 400" || { echo "FAIL POST /auth/login empty body -> $code"; fail=1; }

echo "== health payload"
body=$(curl -s -m 15 "$API/health")
[[ "$body" == *'"status":"ok"'* ]] && echo "ok   $body" || { echo "FAIL $body"; fail=1; }

exit $fail
