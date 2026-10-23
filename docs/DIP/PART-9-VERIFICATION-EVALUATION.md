# 9. Verification and Evaluation Plan

## 9.1 Purpose, scope and evidence conventions

Verification will establish whether the implemented software satisfies its stated requirements. Evaluation will examine whether the available workflows help agricultural users complete defined tasks more effectively than a comparable manual process. Automated checks alone cannot demonstrate agricultural benefit, usability or stakeholder acceptance.

The evaluation covers the website and PWA: parcel management, cadastral boundaries, forecast presentation, the event centre, retained records and reports, local storage and synchronisation, authentication, the 1C connector and the developer API. Requirements retain their identifiers from [Part 6](PART-6-REQUIREMENTS.md). The architecture combines a React/TypeScript client and IndexedDB with a Node.js/Express API and SQLite. Chat, marketplace, trade and business-platform modules additionally depend on PostgreSQL; semantic marketplace search also depends on an inference service. These additional modules have regression tests but remain outside the diploma core described in [Part 7](PART-7-ARCHITECTURE.md).

Sensor registration is evaluated as a registry, not as live telemetry. The 3D scene is evaluated as an illustrative interface, not as a validated crop model. eGov authentication, contractual cadastral integrations and unsupported third-party integrations remain outside the implemented scope. Native Android/iOS packaging and device certification are not part of this documentation exercise and require a separate explicit release request.

The following evidence levels are used throughout this section:

| Evidence level | Meaning |
|---|---|
| **Executed — passed** | A named command or observation completed successfully, with its conditions and result recorded. |
| **Executed — failed / blocked** | A command was attempted but did not complete successfully; the recorded reason limits what can be concluded. |
| **Inspected** | Source code, test definitions or configuration exist and were examined; execution is not implied. |
| **Planned** | A measurement or acceptance exercise remains to be conducted. No result is asserted. |

This audit uses source commit `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`, inspected on 23 October 2026. The repository had no published tags at the time of inspection; `pre-defense-1` is therefore not used as an evidence reference. An implementation label or a test filename in an earlier part is not, by itself, proof that its acceptance criteria have passed.

**Current scope correction.** The `/journal` route opens the event centre. The browser workspace test explicitly checks that the manual “New record” button is absent and seeds retained records through a test helper. Consequently, retained-entry display, storage and export can be verified, but manual diary creation through the current user interface must not be presented as an available scenario. `FR-REC-1` and the record-editing interpretation of `FR-SYNC-1` require reconciliation with this current product behaviour before final acceptance.

---

## 9.2 Verification already performed

### 9.2.1 Local execution

Existing dependencies and an existing Node.js 22.23.3 runtime with pnpm 10.32.1 were used. No dependency installation, production access, deployment or native build was performed. The API tests that could run used temporary stores and fixture servers. Database and inference service URLs were not configured.

| Check | Observed result | Interpretation |
|---|---|---|
| `pnpm typecheck` | Passed for both `@egin/mobile` and `@egin/developers`; exit code 0. | The current TypeScript source passes static checking. This does not establish browser correctness. |
| Mobile portion of `pnpm test` | **73 passed, 0 failed, 0 skipped.** | Executed unit coverage includes geometry, weather, event derivation, report escaping, sync-batch limits, QR parsing and chat presentation helpers. |
| API portion of `pnpm test` | **38 passed, 20 failed, 1 skipped** in 59 reported entries; overall command exit code 1. | All 20 failures occurred while importing `sharp`: its Linux x64 native runtime was unavailable in the existing dependency installation. Assertions in those test files did not execute. |
| Available API adapter tests | Passed cadastral privacy/geometry/transport tests, news parsing/cache tests, 1C transport tests and two marketplace-search helper tests. | These fixture-based tests establish bounded behaviour of the tested adapters, not current availability of live providers. |
| Real ONNX inference case | Explicitly skipped because `MARKET_TEST_INFERENCE_URL` was absent. | No semantic-search quality result was obtained. |
| PostgreSQL and media-dependent cases | Not exercised; several containing files failed to import before their conditional skips could be evaluated. | Real database concurrency, media processing and additional-module integration are not locally verified by this run. |
| UI fixture capture | **9 screenshots**, no reported page errors; Chromium `153.0.8010.12`. See [capture metadata](evidence/ux/capture-metadata.json). | Limited rendering checks completed against an existing `dist` bundle with unverified source revision. API responses were intercepted, and guest records were synthetic. This does not validate live authentication, synchronisation, export, service-worker behaviour or the backend. |

The condensed command transcript, exact failing file list and limitations are preserved in [local verification evidence](evidence/verification/2026-10-23-local-checks.txt). The API count combines individual tests with failed file-level entries; it must not be converted into a requirement-coverage percentage. The dependency failure is an environment problem observed during this run, but the overall test command remains **failed** until a reproducible rerun succeeds.

### 9.2.2 Continuous-integration evidence

The following GitHub Actions results were inspected for the same source commit at 15:55 UTC on 23 October 2026. These are remote execution records, distinct from the local results above.

| Workflow | Observed status | Evidence and limitation |
|---|---|---|
| Mobile checks | Success | [Run 39977774247](https://github.com/Adilzhan17/egin/actions/runs/39977774247). The `verify` job passed; `android` was skipped. The workflow defines typechecking, unit/API checks, web builds and browser scenarios. Retain its artifacts with the defence evidence. |
| Chat checks | Failure | [Run 39977774228](https://github.com/Adilzhan17/egin/actions/runs/39977774228). The failing step was “Real PostgreSQL, realtime, permissions and media validation”. Investigate it before making an additional-module readiness claim. |
| Trade, billing and video notes | Failure | [Run 39977774136](https://github.com/Adilzhan17/egin/actions/runs/39977774136). The failing step was “Cameras, offline outbox, admin controls and trade cards”. The workflow does not constitute completed additional-module acceptance. |
| Market checks | Cancelled | [Run 39977774255](https://github.com/Adilzhan17/egin/actions/runs/39977774255). The job was cancelled during installation of Chromium/WebKit dependencies. Cancellation is not a successful result or proof of an application defect. |

The inspected branch response reported `protected: false` for `main`. Therefore, the protected-branch acceptance criterion in `NFR-MNT-1` is not demonstrated. A successful Mobile workflow does not establish that all workflows are green or that merges are protected.

Browser capture evidence in [Part 8](PART-8-UX-PROTOTYPE.md) must be interpreted according to its own fixture and build-provenance notes. The capture used Node.js 24.21.0 and local static servers; it is separate from the Node.js 22 unit/API run above. Screenshots and limited screen assertions are not substitutes for the complete browser suite, live authentication or a usability study.

---

## 9.3 Functional and non-functional testing plan

Each test case below traces to Part 6. “Expected result” is an acceptance target, not a claimed observation. Test paths are relative to the repository root; mobile browser scripts are in `apps/mobile/tests/`, and API tests are in `apps/api/tests/`.

| Test Case | Objective | Method | Expected Result | Metric | Status |
|---|---|---|---|---|---|
| **TC-01 — Authentication and recovery** (`FR-AUTH-1…4`, `NFR-SEC-1`) | Prevent invalid authentication and account lockout. | Execute `api.test.mjs`, `qr-auth.test.mjs` and `auth.cjs` with an isolated account and virtual authenticator; add physical-device passkey checks. | Invalid challenge/origin/signature and reused recovery codes are rejected; last-passkey deletion is prevented; valid recovery rotates the code. | All enumerated positive and negative cases pass; zero unintended sessions. | API files blocked locally by `sharp`; browser scripts inspected; physical-device acceptance planned. Native iOS passkey configuration remains pending, as qualified in Part 6. |
| **TC-02 — Parcel acquisition and privacy** (`FR-FLD-1…3`, `NFR-SEC-7`, `NFR-PERF-4`) | Return only an exact, bounded, non-personal parcel result. | Execute cadastral adapter tests with valid, invalid, ambiguous, timeout and oversized fixtures; then `map-picker.cjs` on a controlled build. | Correct projected boundary; no broad search or silent ambiguity; no personal names or individual identifiers; saving requires confirmation. | Zero privacy leaks or false exact matches in fixtures; configured timeout/size limits enforced. | Adapter tests executed and passed; browser acceptance not rerun locally. |
| **TC-03 — GeoJSON and retained boundaries** (`FR-FLD-4…6`) | Preserve valid geometry and reject malformed imports. | `land.test.ts`, `land.test.mjs`; import/export round trip, denied geolocation and offline reload in browser. | Holes and geometry survive the round trip; invalid/oversized geometry is rejected; saved contours remain readable offline. | 100% valid-fixture round trips; zero accepted invalid fixtures; zero lost stored contours. | Mobile geometry tests passed; API file blocked; browser/device acceptance planned. |
| **TC-04 — Offline synchronisation** (`FR-SYNC-1…8`, `NFR-REL-1`) | Prevent silent loss, duplication and cross-profile leakage. | `sync-batches.test.ts`, `api.test.mjs`, `workspace.cjs`, `sync-ui.cjs`; two contexts, offline writes, reconnect, repeated payloads, deletion and conflict fixtures. | Every queued operation is acknowledged or remains explicitly pending/in conflict; profiles remain isolated; deleted records do not reappear. | Zero silent losses, duplicates or cross-owner records; convergence after explicit conflict resolution. | Batch tests passed; API blocked; full browser lifecycle planned. Retained-entry seeding does not prove a manual diary editor exists. |
| **TC-05 — Weather and external-source failure** (`FR-WTH-1…3`, `FR-HOME-4`, `NFR-REL-4`) | Preserve coordinate binding and honest freshness labels. | Weather unit tests, `news.test.mjs`, then `home-weather.cjs` and `news.cjs`; fresh/missing/stale/offline fixtures. | Correct selected-plot coordinates; missing values remain absent; cached forecasts/news are labelled and usable without fabricated warnings. | Zero cross-plot forecast substitutions or fabricated readings; all defined fallback cases pass. | Unit and news adapter tests passed; browser/provider validation planned. |
| **TC-06 — Events, reports and retained records** (`FR-EVT-1`, `FR-RPT-1`, retained-data part of `FR-REC-1`) | Produce traceable event summaries and safe local exports. | `events.test.ts`, `reports.test.ts`, then `events.cjs`, `reports.cjs`; seeded retained history and malicious text/formula fixtures. | Filters preserve relevant events; HTML/CSV/JSON match the selected dataset; HTML is escaped and CSV formulas neutralised. | Zero unsafe exports or unexplained omissions; expected field/record counts match all three formats. | Unit tests passed; download/media/browser acceptance planned. |
| **TC-07 — Honest product boundaries** (`FR-AUTH-5`, `FR-SNS-1…2`, `FR-HOME-3`) | Avoid presenting planned integrations or illustrative data as live services. | QR/parser and field-readiness tests; `readiness.cjs`; inspect eGov, sensor and 3D labels. | eGov remains “В разработке”; EGIN QR is identified correctly; a registered sensor does not imply telemetry; 3D assumptions are visible. | Zero misleading states in the agreed fixture matrix. | Relevant unit tests passed; remaining UI checks inspected/planned. |
| **TC-08 — Read-only 1C import** (`FR-INT-1…2`, `NFR-SEC-3…5`) | Preserve credentials, owner boundaries and existing edits. | `one-c-transport.test.mjs`, `one-c.test.mjs`, `one-c-flow.test.mjs`; local OData fixtures for pagination, repeat import, disconnect and conflicts. | Only allowed read requests; encrypted secrets; no duplicate imports, silent overwrites or credentials in responses. | Zero forbidden outbound requests, duplicate source records or exposed secrets; repeat import is idempotent. | Transport tests passed; full connector/flow files blocked locally; client-sandbox validation planned. |
| **TC-09 — Developer portal and API** (`FR-API-1…3`) | Enforce API contracts, scopes and the separate portal audience. | `developer.test.mjs`, including installed-route inventory; `developers.cjs`; expired/revoked/rotated keys, missing scopes and stale `If-Match`. | Required 401/403/412 responses; secret shown only on issue/rotation; no cross-audience session use; catalog matches installed routes. | Zero missing/extraneous catalog routes or unauthorised successful requests. | API file blocked locally; suite inspected and must be rerun. |
| **TC-10 — Responsive layout and accessibility** (`NFR-USE-1…3`, `FR-HOME-1`) | Make primary workflows usable on phones. | Chromium/WebKit viewport checks at 320/360/390/430/480 CSS px, physical safe-area checks, automated accessibility audit and manual keyboard/focus review. | No horizontal overflow or obscured controls; prominent 3D home view; text/icon active navigation; readable contrast and touch targets. | 0 overflow cases; contrast and target-size thresholds in 9.4; documented unresolved findings. | Test scripts inspected; complete accessibility and device measurements planned. |
| **TC-11 — Performance and renderer lifecycle** (`NFR-PERF-1…3`) | Measure load responsiveness and background work. | Fixed Lighthouse mobile profile; production web bundle; cold/warm runs; `scene-performance.cjs` and service-worker reload tests. | Load targets met; offline shell available after caching; hidden/off-screen scene stops requesting frames. | LCP ≤ 4.0 s, score ≥ 70; 0 requested idle frames over the specified 5 s window. | Planned; local test-command duration is not a performance result. |
| **TC-12 — Deployment, restore and environment isolation** (`NFR-REL-2…3,5`, `NFR-SEC-6`) | Establish recoverability without changing production during evaluation. | Controlled staging rehearsal of blue/green switching and rollback; restore test copy; inspect RP origins, volumes, assets and compatible schemas. | Gateway and both asset namespaces remain available; previous version operates with migrated data; restore is consistent; origins/stores remain separate. | No failed health probes during the measured interval; rollback ≤ 60 s; SQLite integrity check `ok`; restore contents match expected records. | Configuration inspected; measured rehearsal and recovery evidence planned. |
| **TC-13 — Quotas, privacy and secret handling** (`NFR-CAP-1`, `NFR-SEC-2…4,7`) | Reject excess data and unauthorised access without partial writes. | Boundary cases at/below/above quotas, cross-owner API calls, rate-limit cases, repository secret scan and log review. | Controlled 4xx responses; no partial writes, leaked secrets or retained personal cadastral fields. | Zero unauthorised reads/writes or secret findings; every agreed boundary case passes. | Cadastral privacy/rate cases passed; remaining quota/security checks planned or blocked with their API suite. |
| **TC-14 — PWA compatibility and update safety** (`NFR-CMP-1…2`, `NFR-MNT-2…3`) | Preserve local data across supported browser and PWA updates. | `app-update.cjs`, offline/reopen tests, Chromium and WebKit, physical Android browser/iPhone PWA; inspect shared sync engine and native job guard. | Updated shell preserves data/queue; unsupported background sync falls back on reopening; native jobs remain manually gated. | Zero lost queued records; recorded browser/device matrix; native job guard present. | Scripts/configuration inspected; physical-device and update measurements planned. No native packages built. |
| **TC-15 — Additional-module regression** (outside diploma core) | Prevent chat/market/business changes from being misrepresented as core acceptance. | Dedicated Chat, Market and Business workflows with isolated PostgreSQL, media tools and inference fixtures. | Relevant workflow assertions pass and failed cases have tracked owners. | Per-workflow passed/failed/skipped counts and artifact references. | Local dependency block and remote failures recorded in 9.2; not accepted by this document. |

---

## 9.4 Proposed outcome metrics and acceptance thresholds

The targets below are **prospective**. They define how outcomes will be judged and are not measured achievements. Targets already specified in Part 6 are retained; supplementary thresholds are explicitly proposed for the evaluation protocol.

| Metric | Definition and measurement | Target / decision rule | Requirement / interpretation |
|---|---|---|---|
| Task completion | Correct, unassisted completions divided by all assigned tasks; report numerator and denominator and also results per task. | Proposed target: ≥ 90% across the planned task set, with every failure described. | Practical usefulness; small-sample descriptive evidence, not population validation. |
| Parcel-addition time | Seconds from opening “Plots” to a correctly saved parcel; final geometry and selected identifier must match the reference. | Median ≤ 60 s and lower than the matched manual method. | `NFR-USE-4`; successful-only time is reported alongside failures/timeouts. |
| Workflow time improvement | For each participant and task: `(baseline time − EGIN time) / baseline time × 100%`; report paired values and median. | Proposed exploratory target: median improvement ≥ 20%, without a reduction in correctness. | A decision aid for iteration, not a promised gain or an already verified interview finding. |
| Critical transcription errors | Wrong parcel identifier, coordinates, area label, forecast location or required report content against a prepared answer key. | Proposed target: 0 critical errors; report all lesser omissions separately. | Correctness must not be traded for speed. |
| Offline data preservation | For a controlled batch, compare queued operation IDs and final content with server acknowledgements, explicit conflicts and pending errors. | 100% accounted for; 0 silent losses or duplicates across at least 20 interruption/reconnect cycles. | `NFR-REL-1`; includes unsuccessful cycles, not only successful demonstrations. |
| Reconnection recovery time | Time from network restoration to acknowledgement of a 50-record fixture batch without attachments or intended conflicts. | Proposed target: p95 ≤ 10 s on the specified controlled connection; failures remain counted. | Supplementary diagnostic metric; not a promise for weak networks or media uploads. |
| First-load performance | Lighthouse mobile measurements of the web production bundle under the frozen profile; retain every run. | Median LCP ≤ 4.0 s and Performance score ≥ 70; report all five run values and spread. | `NFR-PERF-1`: Slow 4G and 4× CPU throttling. |
| Layout, contrast and touch size | Measure all primary screens at specified widths; inspect representative physical safe areas; calculate contrast; inspect target bounding boxes. | 0 horizontal-overflow cases; normal text contrast ≥ 4.5:1; interactive targets ≥ 44×44 CSS px unless a documented exception is accepted. | `NFR-USE-1…3`; automated auditing does not replace manual review. |
| Deployment recovery | Timed staging rehearsal with health probes once per second throughout the switch; compare before/after data and asset availability. | No observed failed probes; rollback ≤ 60 s; valid restored database. | `NFR-REL-2…3`; 1 s sampling cannot prove absence of every shorter interruption. |
| Perceived task ease | After each task, a consistent 1–7 ease question, with optional comments and no interviewer coaching. | Proposed exploratory target: median ≥ 5/7. | Qualitative explanation of observed difficulty; no questionnaire result currently exists. |

Agricultural yield, profit, sensor accuracy, adoption and long-term retention are not evaluation claims at this stage. Demonstrating them would require separate longitudinal datasets and an appropriate study design.

---

## 9.5 Measurement conditions and reproducibility

1. **Freeze the candidate.** Record the Git SHA, lockfile, build command, browser/OS versions, device model, environment and fixture version. Rebuild both web apps from that SHA. A previously generated `dist` directory without verified source provenance must not be treated as a reproducible release artifact.
2. **Separate the test environments.** Use temporary data for automated tests and a dedicated staging dataset for acceptance sessions. Never use production personal records or real payment/partner operations as fixtures. Preserve separate production/staging volumes and passkey RP origins. Use HTTPS for actual passkey and PWA device checks.
3. **Use deterministic source data.** Prepare valid and invalid cadastral numbers, one polygon with a hole, one malformed import, two plot coordinate sets, a missing-data weather response, fresh and stale forecasts, retained history and safe/unsafe export strings. Record expected answers before the session. Test controlled failures with fixtures; run live-provider smoke checks separately and date their results.
4. **Fix the browser matrix.** Run automation in Chromium and WebKit; record their exact versions. Repeat essential flows on a physical Android browser and an iPhone Safari/installed PWA. Use 320, 360, 390, 430 and 480 CSS px for layout checks. An emulated browser viewport is not evidence of a native build or every physical device.
5. **Separate connection conditions.** Measure usability under one stable connection and one declared offline/reconnect scenario. For the proposed sync-latency metric use 10 Mbps downstream, 5 Mbps upstream and 100 ms added latency, a 50-record batch of approximately 1 KiB per record and no attachments. Capture the exact shaping tool/settings. Do not mix these timings with the Lighthouse Slow 4G/4× CPU experiment.
6. **Control cache and state.** Distinguish cold loads from warm/offline reloads. Clear browser state for cold measurements; preserve the specified account and cached dataset for offline trials. Use a built service worker for PWA/update tests; a development server is insufficient evidence for those claims.
7. **Retain repetitions and exceptions.** Collect five performance runs and at least 20 sync interruption cycles. Record each failure, timeout, retry and missing observation. Reset the dataset between repetitions and do not silently remove slow runs.
8. **Capture auditable evidence.** Store timestamped command logs, CI links, screenshots, task sheets, anonymised timing records and defect IDs. Separate synthetic fixtures, self-reported stakeholder feedback and directly observed measurements. Restrict interview recordings and personal data according to participants' consent.

The current local `sharp` import failure must be resolved in a reproducible test environment before rerunning the blocked API checks. The environment repair and a subsequent successful run must have their own evidence; this document does not assume that repair has occurred.

---

## 9.6 Baseline comparison and user study

The proposed baseline is a **manual workflow using separate tools**: a public cadastral map or supplied parcel source, a weather page and a spreadsheet or document template. This is a candidate comparator derived from the problem definition, not a claim that every interviewed farmer uses exactly this combination. Confirm its realism with participants and document the exact tools, versions and starting materials before evaluation.

| Task | Baseline workflow | EGIN workflow | Common success criterion |
|---|---|---|---|
| **B1 — Identify and save a parcel** | Find the supplied cadastral identifier; transfer its boundary/location and labelled area into the supplied record template. For the specific manual-drawing hypothesis, digitise the same reference boundary using an agreed map tool. | Search by cadastral number, inspect the boundary and confirm addition. | Correct parcel and consistent boundary/location; registered and calculated areas are not confused. |
| **B2 — Obtain plot-specific weather** | Use the same coordinates with the chosen weather source and record the requested forecast facts and timestamp. | Select the plot and read the corresponding forecast. | Correct coordinates, forecast period, units and freshness interpretation. |
| **B3 — Find an event requiring action** | Locate the relevant item among supplied separate weather/history/sync notes and identify the next action. | Filter the event centre and follow its action link. | Correct event, source, timestamp and next action; no historical item mistaken for a new alert. |
| **B4 — Prepare a parcel report** | Populate an agreed template from the supplied boundary, metadata and retained-history dataset. | Select the parcel/period and export the equivalent report. | Required information is complete and correct; both methods use the same reference dataset. |

Two comparisons must remain distinct: the practical cadastral-number workflow against a realistic scattered-tool process, and the narrower manual-boundary-drawing hypothesis in `NFR-USE-4`. A participant must not be forced to draw a boundary when their normal baseline already provides an equivalent downloadable contour; report that alternative separately.

Recruit a target of **five potential users**, including farmers and agronomists, with a minimum of three completed sessions for the limited `NFR-USE-4` pilot. This is a proposed sample, not the number already tested. Previous discussions reported in Part 2 do not automatically count as usability sessions. Record participants' relevant role, device familiarity and consent using anonymised identifiers.

Use a within-participant design: every participant tries both methods. Counterbalance the order as evenly as possible between baseline-first and EGIN-first, and use different but comparable parcel datasets to reduce memorisation. Provide equal training and practice time. Use the same device and connection for both methods where practical; if real workflows require different equipment, record that difference and avoid attributing all timing differences to the software.

Start timing at the same task instruction and stop only after the common success criterion is met. Predeclare a three-minute limit for B1–B3 and a five-minute limit for B4; record timeouts as unsuccessful attempts. Report completion rates over all attempts, successful-task times separately, and a sensitivity view that includes timeout limits. Record assistance and critical errors rather than quietly converting coached completions into successes. Report paired differences, medians and ranges. A small convenience sample supports prototype refinement and descriptive evidence, not a general statistical claim about all farmers in Kazakhstan.

The study does not include manual diary creation, live sensor monitoring or eGov login as user tasks because those are not available user flows in the audited scope. Unsupported tasks cannot be used to claim a product benefit.

---

## 9.7 Acceptance decision and remaining evidence

Achievement of the project aim will be assessed through a combined evidence chain: a confirmed user need from Part 2, a supported interaction in Part 8, an explicit requirement in Part 6, a reproducible verification case and a measured user outcome. No single successful build or screenshot is sufficient.

Before the final defence, the team must:

1. Reconcile requirement status with current routing and retained-record behaviour; preserve stable IDs and record any accepted scope change.
2. Repair the isolated test environment and rerun the blocked API and browser checks, including route inventory, authentication, sync conflicts, API scopes and 1C import.
3. Review failed/incomplete CI workflows and retain the final results; separately decide and document whether to enable required checks and branch protection.
4. Build a traceable web candidate and complete the physical-device, accessibility, performance and staging recovery measurements.
5. Conduct the counterbalanced user sessions, preserve consented evidence and calculate the predeclared outcome metrics.
6. Maintain an acceptance register linking requirement ID → test case → evidence → result → defect or scope decision. A failing or unmeasured Must criterion stays open; any revision requires a documented scope decision and updated acceptance criterion.

The present evidence supports the existence of a substantial implementation and several successful local/remote checks. It does not yet establish that all Must requirements, operational recovery targets or usability hypotheses have been validated.
