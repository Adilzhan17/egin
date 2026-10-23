# EGIN — Defense Preparation

This guide accompanies [Parts 2, 8, 9 and 10](README.md). It summarises the inspected implementation and provides English presentation material. Its source baseline is `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`, reviewed on 23 October 2026; subsequent report edits do not establish a new runtime release.

## Project overview

EGIN is a phone-first web application for managing agricultural plots in Kazakhstan. Its core combines plot boundaries and public cadastral information, coordinate-based weather, locally retained data, an event centre, a sensor registry and report export. A Node.js API supports identity, synchronisation and integrations; a separate developer portal provides controlled external API access. The same client codebase includes Capacitor configuration, while the present review concerns the website and its existing web artifacts.

The current repository also contains chat, marketplace, trade and business-account modules. These extend the original land-management proposal and introduce PostgreSQL, private media and additional operational dependencies. The team should explicitly identify which of these extensions it intends to defend, rather than silently treating every source module as an accepted diploma requirement.

## Current implementation status

| Area | Evidence-supported status | Boundary to state at the defense |
|---|---|---|
| Phone-first interface and crop scene | Implemented source and captured web interface; see [Part 8](PART-8-UX-PROTOTYPE.md). | The crop visualisation is illustrative, not a validated digital twin or a yield prediction. Screenshots use a pre-existing build and controlled fixtures. |
| Plots and public cadastre | Source supports lookup/preview, GeoJSON, selected plots and retained parcel information. | Public EGKN access is distinct from an approved contractual government integration. Live source availability must be checked separately. |
| Weather and news | Coordinate-based forecasts, freshness handling and a news feed are implemented. | A forecast is not a field sensor measurement; external-data fixtures do not establish live provider availability. |
| Local storage and synchronisation | IndexedDB, queues, record versions, tombstones and conflict mechanics are implemented. | Offline data mechanics must be distinguished from the currently exposed screens and from a complete field trial. |
| Event centre and previous records | `/events` and `/journal` display the event centre and existing record information. | The active router does not expose the legacy manual diary composer. FR-REC-1 and the manual-record portion of FR-SYNC-1 remain partial. |
| Sensors and reports | Sensor registration and local report-export code exist. | Registering a device does not connect telemetry. Reports use available records, not invented observations. |
| Authentication and developer portal | Web passkey, recovery, QR and scoped API-key implementations exist. | EGIN QR is not eGov QR; portal/main-app origins remain separate. Native iOS passkey configuration is pending, and real-device/native acceptance requires separate evidence. |
| 1C and other integrations | A read-only 1C OData connector is implemented. | A customer test instance and permission are needed to demonstrate a real import. eGov, sensor telemetry and other unconnected providers remain pending. |
| Chat, market and trade/business | Implemented source and dedicated automated suites exist. | Some CI workflows are failing. Do not present the existence of modules as proof that every extended scenario has passed. Banking and document confirmations are not automatic acquiring or electronic digital signatures. |
| Native delivery | Capacitor configuration is present. | No Android/iOS build, native sync or new native release was performed for this documentation task. |

## Evidence checklist and missing requirements

| Criterion | Available evidence | Still needed for a complete, defensible claim |
|---|---|---|
| **2 — Relevance** | Team account of discussions with approximately 10–15 potential users; the reported Dairabayev meeting; [official stakeholder background](https://www.parlam.kz/kk/blogs/dayrabaev); explicit hypotheses and a participant-record template. | At least 3–5 attributable discussion records, meeting-specific materials and evidence-to-requirement decisions. No interview quotations, signed partnership or measured adoption are assumed. |
| **8 — UX / Prototype** | Route/source inventory, scenario descriptions and actual UI screenshots with fixture/build provenance. | A reproducible current-source build, an agreed demonstration dataset, completion of the chosen end-to-end scenarios and real-device checks. Decide whether to restore manual diary entry or revise the corresponding acceptance scope. |
| **9 — Verification / Evaluation** | Both web typechecks passed; 73 mobile unit tests passed. The local API run reported 38 passes, 20 import failures caused by unavailable `sharp` runtime support, and one skipped test. Current CI and retained logs are detailed in Part 9. | Repair the test environment, investigate failed CI, execute dependency-bound tests and conduct the proposed usability, performance, operational and baseline measurements. No outcome KPI has been met merely by proposing a target. |
| **10 — Management / Risks** | Current Git history, documented allocation of two developer roles, a proposed work register, milestone gates and risk/dependency tables. | Confirm remaining owners and acceptance responsibilities; link work items to evidence; record the final defense revision and dates. A separate YouTrack project is optional under the owner's approach and must be disclosed as absent unless actually adopted. |

Historical test reports are useful background, but their counts must not be substituted for a new execution result. Chromium/WebKit automation is also distinct from a physical phone test. The detailed status and reproducibility information in [Part 9](PART-9-VERIFICATION-EVALUATION.md) take precedence over a short presentation summary.

## Short defense speeches

### Part 2 — Evidence of the Relevance

> We discussed the EGIN idea with approximately ten to fifteen potential users, including farmers and agronomists in Kazakhstan. Some participants managed substantial agricultural land holdings. We also met with Zhiguli Dairabayev, and our team reports that he supported promoting the project. We distinguish this engagement from a formal partnership or a signed client agreement. Our current evidence supports further investigation, but we do not claim specific interview findings that we cannot document. We are organising discussion records and linking them to testable requirements. The public profile in our report identifies the stakeholder; it is not proof of our particular meeting.

### Part 8 — UX / Prototype

> EGIN has an implemented phone-first web interface. The main demonstration follows a user who opens the home screen, selects a plot, checks its weather, reviews events and exports available information. The report also shows authentication, sensor registration and the developer portal. Our screenshots are real captures of an existing web build with clearly identified demonstration data. They are not evidence of live external integrations. We explain the current limitations: sensor registration does not provide telemetry, the crop scene is illustrative, and the active event centre does not include the old manual diary editor.

### Part 9 — Verification and Evaluation Plan

> We separate implementation checks from evaluation of user benefit. We have executed type checking and mobile unit tests, and we disclose the API environment failures and skipped checks. Our plan covers functional behavior, security, offline recovery, performance and real-device operation. To evaluate usefulness, we will compare EGIN with the same participants' existing workflow using the same plot and information. We will record task completion, time, errors and assistance. These are planned measurements, not achieved results. We will use the recorded revision, device and network conditions to make the comparison reproducible.

### Part 10 — Project Management and Risks

> GitHub provides our current implementation and version-control evidence. The proposal assigns synchronisation, authentication and deployment to Rustam, and cadastral, weather, 1C and developer API work to Adilzhan. We distinguish this documented allocation from an assumption based on commit counts. Our work register identifies completed implementation and remaining evidence tasks, while milestones use acceptance gates instead of invented deadlines. We track risks involving external services, data integrity, scope and test readiness. GitHub and this register are our current management basis; we do not claim an existing YouTrack board. Remaining owners and final acceptance evidence must still be confirmed.

## Professor questions and suggested answers

| Question | Evidence-based answer |
|---|---|
| How do you know farmers need this system? | We have the team's account of exploratory discussions and a documented literature rationale. We still need traceable individual records and task-level evaluation before treating feature demand or adoption as verified. |
| Did every participant ask for cadastral lookup or offline work? | We cannot claim that without the original notes. Those are explicitly labelled hypotheses and engineering choices. Follow-up records will show which participants confirm, reject or qualify them. |
| Does the Dairabayev meeting mean you have an official partner? | No. The team reports support for promotion. We have not presented a signed partnership, procurement commitment or formal client acceptance. The public profile provides background only. |
| Why include managers of large farms if the proposal targets small farms? | Their experience can inform exploration, but the groups are not interchangeable. The evaluation should record farm context and include representatives of the proposed primary user segment. |
| Is the 3D plant a digital twin? | No. It is an illustrative interface element. There is no validated sensor-fed growth model or demonstrated yield prediction in this scope. |
| Does offline operation mean every screen works without a network? | No. Retained local data and supported local changes are distinct from online map tiles, server sessions, fresh external data and extended business workflows. The protocol states which operations are evaluated. |
| Can a user create a diary entry in the current interface? | The active `/journal` route opens the event centre. The legacy editor source exists, but it is not exposed by that route. We mark the affected end-user requirements partial rather than presenting seeded records as user-created evidence. |
| Are all tests passing? | No. Both typechecks and 73 mobile unit tests passed locally. The API execution encountered missing `sharp` runtime support, and some CI workflows also failed. We record failures, environment issues and skips separately and do not claim complete acceptance. |
| How will you prove improvement over the baseline? | Use the same representative tasks, plots and information for EGIN and the participant's existing workflow. Counterbalance order, record success/time/errors and report unsuccessful trials as well as completed ones. No gain is claimed before measurement. |
| Why is there no YouTrack board? | The owner currently treats it as optional. We demonstrate GitHub and the report work register, and disclose the absence of YouTrack. If the assessor requires that named artifact, the team will agree the requirement rather than present a fictitious board. |
| How can you prove individual contribution? | Use the documented responsibility allocation, concrete implementation explanations, actual commits and future task/review records. Commit counts or account aliases alone are not a measure of individual effort. |
| What must be completed before final acceptance? | Attach stakeholder evidence, reconcile the manual-diary scope, establish a reproducible test/build environment, resolve relevant CI failures, execute outcome and physical-device checks, and link the final revision to the acceptance evidence. |

## Action plan

These are proposed next steps, not completed work or committed calendar dates. The team must confirm owners for research, documentation and evaluation as described in Part 10.

| Order | Action | Completion evidence |
|---|---|---|
| 1 | Recover and approve 3–5 discussion records and the available meeting materials. | Dated, anonymised records with clear source, consent and links to the Part 2 hypotheses. |
| 2 | Agree the defense scope and resolve the manual-diary mismatch. | An explicit requirement decision; either revised acceptance scope or a separately requested and tested implementation change. |
| 3 | Assign the remaining work-register owners and confirm the management evidence format with the supervisor. | Named responsibilities and real links to GitHub work items or the agreed register; YouTrack only if adopted. |
| 4 | Reproduce the current source build and tests in a correctly provisioned environment. | Runtime/dependency versions, a build tied to a Git SHA, test results, and an explanation of every failure or skip. |
| 5 | Resolve applicable failed CI runs and verify core/extension boundaries. | Passing relevant runs or explicitly accepted exclusions; no blanket success claim while failures remain. |
| 6 | Execute the chosen user tasks and baseline comparison. | Raw anonymised results, task protocol, device/network conditions and a report of successes and failures. |
| 7 | Complete the agreed physical-device and operational checks. | Device records, passkey/media/installation observations, performance data and a safe staging restore/rollback record. |
| 8 | Freeze the evidence package and rehearse the selected flows. | Final Git SHA, accessible report links, approved screenshots, remaining limitations and concise answers consistent with the evidence. |

This plan uses the existing system. It does not require a new native release, new provider integrations or a new task-management platform merely to complete the documentation.
