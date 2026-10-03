# Testing EGIN

Start the complete product with `docker compose up --build -d --wait`.
Migrations, administrative-boundary import, idempotent demo seed and missing model artifact creation run in CORE's entrypoint.

- `pnpm typecheck`, `pnpm lint`: web checks after frozen pnpm installation.
- `docker compose build web`: production Next build in Node 22.
- `docker compose exec -T core pytest -q`: API integration suite. The fixture creates a random `egin_test_*` database, verifies the pool points there, then drops only that database. Production data is never used by these tests.
- `pnpm test:e2e`: actual running product in Chrome, no network mocks. Set `CHROME_PATH` when Chrome is not at `/opt/google/chrome/chrome`; `EGIN_WEB_URL` defaults to localhost:3000. Tests cover login, registration, polygon draw/edit/undo/save/history, field analysis, listings, tasks/notes, two-user WebSocket delivery, and real LLM SSE tool calling/history. A downloaded local model or configured remote provider is required for the live LLM test.

The LLM protocol unit test uses a labelled test provider; it does not establish live model availability. The browser test observes the real fetch stream and checks a model-origin weather tool event, token events, completion and persisted text. Chromium's response-body buffer cannot reliably return SSE bodies, so the test observes a cloned browser response without changing the application's stream.

CI builds the same three-container topology with local Ollama excluded, runs strict web checks and isolated API tests, and does not deploy. Live LLM and upstream environmental availability checks run separately on the local installed product. See `VERIFICATION.md` for measured results and limitations.

For manual QA use 390×844, 430×932, 820×1180 and 1440×1000. Inspect home, map, field, AI, marketplace, community; verify overflow, map controls, modal scrolling, keyboard focus and the bottom navigation. Browser viewport resizing approximates mobile layout, not physical-device keyboard behavior.
