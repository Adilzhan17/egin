# UX Capture Evidence

These files support [Part 8](../../PART-8-UX-PROTOTYPE.md). They are actual screenshots of the EGIN web interfaces with synthetic browser data, captured from fresh, commit-identified web builds.

## Provenance

- Capture time: **2026-10-23T17:12:27.705Z**, Chromium **153.0.8010.12**, Node.js **24.21.0**.
- Build source: `b0b0f46fc4c4c89422066317c4d550fc0bc25162`. Its application-source tree equals that of historical review commit `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`: both have `apps` tree `3c5eda79a3be6e2c00533ce5da288c5446987f92`.
- Source was extracted with `git archive` into an isolated temporary directory. Both web applications passed TypeScript checking and Vite production builds; mobile service-worker generation also passed.
- The earlier missing optional Rolldown binding was resolved in a copied dependency tree using `@rolldown/binding-linux-x64-gnu` **1.2.13** and `lightningcss-linux-x64-gnu` **1.33.0**. Shared dependencies were not modified. The web-build blocker is resolved for this recorded capture; historical backend-test failures were not rerun.
- [capture-metadata.json](capture-metadata.json) records commands, source identities, browser/runtime, URLs, index/service-worker hashes and screenshot hashes. [build-artifacts.json](build-artifacts.json) contains SHA256 fingerprints of all **72** generated files. [Execution record](../verification/2026-10-23-web-build-capture.txt) records the bounded build/capture run.
- All API requests were intercepted. Weather/news came from repository fixtures; plot, history and sensor records were synthetic guest records. External network requests were blocked; no live external forecast or cadastral response was used.
- The weather screenshot displays the historical fixture timestamp, not the capture date. The map screenshot intentionally shows an unavailable basemap and a retained synthetic contour.
- Service workers were blocked. No real authentication, synchronisation, export download, API-key issuance, native package or production data mutation occurred.
- Full-page captures preserve the application's fixed navigation at the viewport position. They show the complete scrollable page and are not representations of a single phone viewport's visible height.

## Reproduce

Use a separate checkout of the recorded commit or the submission tag and a compatible Node runtime. Install the lockfile dependencies with `pnpm install --frozen-lockfile`, including optional packages for the current platform, then run `pnpm build`. This builds only the web applications; do not run a native sync or package command for these captures.

The actual execution used the equivalent per-app commands below with `/opt/agent-studio-runtime/node` (v24.21.0), copied dependencies and the isolated glibc-package repair described above.

From `apps/mobile`:

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/generate-sw.mjs
```

From `apps/developers`:

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

After a successful build, record its source revision and commands in a build metadata JSON file. Do not reuse this metadata with an unrelated or previously generated bundle. For example, from the checkout root:

```bash
python3 - <<'PYMETA'
import datetime, json, subprocess
from pathlib import Path
metadata = {
    "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "sourceAppsTree": subprocess.check_output(["git", "rev-parse", "HEAD:apps"], text=True).strip(),
    "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "commands": [{"cwd": ".", "command": "pnpm build", "result": "passed"}]
}
Path("build-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
PYMETA
```

In separate terminals, from that checkout root:

```bash
python3 -m http.server 4947 --bind 127.0.0.1 --directory apps/mobile/dist
```

```bash
python3 -m http.server 4948 --bind 127.0.0.1 --directory apps/developers/dist
```

Then run:

```bash
EGIN_UX_BUILD_METADATA=build-metadata.json node docs/DIP/evidence/ux/capture.cjs
```

Recorded result:

```json
{"screenshots":9,"pageErrors":[],"browser":"153.0.8010.12"}
```

The script accepts `EGIN_UX_ROOT` for an isolated build tree, `EGIN_UX_OUTPUT` for a separate output directory, and `EGIN_UX_URL` / `EGIN_UX_PORTAL` for other local ports. It rejects non-local hosts. The recorded capture used ports 4957/4958 and temporary build/output directories; the exact invocation is in the metadata. Stop both HTTP servers after use. Without build metadata, the script correctly labels artifact provenance unverified rather than assuming that an arbitrary `dist` matches Git HEAD.

## Scope of the checks

The script checks visible screen states, model readiness, forecast-item count, absence of a manual event composer, pending sensor telemetry and an empty market state. These checks establish UI rendering under fixtures. They do not establish successful execution of the complete browser suite, live integrations, offline/PWA behaviour or user acceptance. Refer to [Part 9](../../PART-9-VERIFICATION-EVALUATION.md) for the broader verification plan and historical suite results.
