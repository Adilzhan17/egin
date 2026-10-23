# UX Capture Evidence

These files support [Part 8](../../PART-8-UX-PROTOTYPE.md). They are actual screenshots of the EGIN web interfaces with synthetic browser data. They are not AI-generated mockups or photographs of user trials.

## Provenance

- Capture date: 23 October 2026; exact UTC timestamp and browser version are in [capture-metadata.json](capture-metadata.json).
- Source audit: commit `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`.
- Served artifacts: pre-existing `apps/mobile/dist` and `apps/developers/dist`, with filesystem modification dates of 14 October 2026. Their original source commit is unverified. Artifact fingerprints are recorded in the metadata.
- Current-source Vite launch was attempted with Node 24.21.0 and failed because the optional `@rolldown/binding-linux-x64-gnu` package was unavailable. The capture used the existing bundles; it did not create a fresh build.
- All API requests were intercepted. Weather/news came from the repository's fixtures; the plot, history and sensor records were synthetic guest records. External network requests were blocked; no live external forecast or cadastral response was used.
- The weather screenshot displays the historical fixture timestamp, not the capture date. The map screenshot intentionally shows an unavailable basemap and a retained synthetic contour.
- Service workers were blocked. No real authentication, synchronisation, export download, API-key issuance, native package or production data mutation occurred.
- Full-page captures preserve the application's fixed navigation at the viewport position. They show the complete scrollable page and are not representations of a single phone viewport's visible height.

## Reproduce

Use a compatible installed Node runtime and the repository's installed Playwright dependency/browser. No new dependency installation is performed by the script. In separate terminals, from the repository root:

```bash
python3 -m http.server 4947 --bind 127.0.0.1 --directory apps/mobile/dist
```

```bash
python3 -m http.server 4948 --bind 127.0.0.1 --directory apps/developers/dist
```

Then run:

```bash
node docs/DIP/evidence/ux/capture.cjs
```

The runtime actually used for the recorded capture was:

```bash
/opt/agent-studio-runtime/node docs/DIP/evidence/ux/capture.cjs
```

Final result:

```json
{"screenshots":9,"pageErrors":[],"browser":"153.0.8010.12"}
```

The script allows `EGIN_UX_URL` and `EGIN_UX_PORTAL` overrides for other local ports, rejects non-local hosts, and overwrites the screenshots/metadata in this directory. Stop both HTTP servers after use. Reproduction against another bundle may change the UI and must be accompanied by updated provenance; do not infer that an arbitrary pre-existing `dist` matches Git HEAD.

## Scope of the checks

The script checks visible screen states, model readiness, forecast-item count, absence of a manual event composer, pending sensor telemetry and an empty market state. These checks establish reproducible UI rendering under fixtures. Refer to [Part 9](../../PART-9-VERIFICATION-EVALUATION.md) for the broader verification plan and actual suite results.
