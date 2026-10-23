# 10. Project Management and Risks

This section distinguishes **repository evidence**, **documented team responsibilities**, and **proposed management activities**. A source file or test suite demonstrates that an artefact exists; it does not, by itself, demonstrate acceptance by users or a successful test run. The evaluation evidence and outstanding measurements are specified in [Part 9](PART-9-VERIFICATION-EVALUATION.md).

## 10.1 Repository and current project state

The project repository is [Adilzhan17/egin](https://github.com/Adilzhan17/egin). The inspection baseline for this report is commit [`8cc0ca3`](https://github.com/Adilzhan17/egin/commit/8cc0ca3f73052b030dcddb990b8a5460be9ddcdf), before the addition of Parts 2, 8, 9 and 10. This identifies the implementation examined. The later [`prob-period-1`](https://github.com/Adilzhan17/egin/tree/prob-period-1) tag identifies the report-submission package. The table below preserves the historical repository observations from 23 October 2026; it is not a fresh inspection of the tagged submission.

| Item | Observed evidence | Interpretation / limitation |
|---|---|---|
| Default development line | Local `main`, `origin/main` and the authenticated GitHub branch response resolve to `8cc0ca3f73052b030dcddb990b8a5460be9ddcdf`; `origin/HEAD` points to `origin/main`. | The report can refer to a reproducible source baseline. Record the final submission SHA separately. |
| History | 174 commits are reachable from the inspected `main`. Representative changes are linked below. | Commit history demonstrates development activity, not hours worked or equal contribution. |
| Branches | The remote reference query returns one branch, `main`. The working copy also contains a local archive branch and a tracking reference for an upstream repository. | Local archival/tracking references are not additional active GitHub project branches. |
| Tags | No tags were returned by the remote reference query or authenticated GitHub inspection at the historical baseline. | The subsequent `prob-period-1` tag packages the submission; implementation inspection and executed test evidence retain their recorded commit references. |
| Application structure | [`apps/mobile`](../../apps/mobile/), [`apps/developers`](../../apps/developers/), [`apps/api`](../../apps/api/) and [`deploy`](../../deploy/) contain the user application, developer portal, server and deployment tooling. | The current implementation includes the original land-management core and later chat, marketplace and business/trade extensions. |
| Automated checks | [`checks.yml`](../../.github/workflows/checks.yml), [`chat.yml`](../../.github/workflows/chat.yml), [`market.yml`](../../.github/workflows/market.yml) and [`business.yml`](../../.github/workflows/business.yml) define automated checks. | At `8cc0ca3`, the authenticated GitHub snapshot at **2026-10-23T15:55:27Z** reported [Mobile checks: success](https://github.com/Adilzhan17/egin/actions/runs/39977774247) (`verify` succeeded; Android packaging was skipped), [Chat checks: failure](https://github.com/Adilzhan17/egin/actions/runs/39977774228) at “Real PostgreSQL, realtime, permissions and media validation”, [Trade/billing/video: failure](https://github.com/Adilzhan17/egin/actions/runs/39977774136) at “Cameras, offline outbox, admin controls and trade cards”, and [Market: cancelled](https://github.com/Adilzhan17/egin/actions/runs/39977774255) during Playwright browser installation. Step locations identify where the runs stopped; they do not establish the underlying cause or successful completion of skipped scenarios. |
| Branch protection | The authenticated GitHub response reports `protected: false` for `main`. | Mandatory passing checks before merge are a proposed control, not an enforced property demonstrated by the current repository. |
| Task-management records | [`EGIN3-IMPLEMENTATION.md`](../EGIN3-IMPLEMENTATION.md), [`EGIN3-REPORT.md`](../EGIN3-REPORT.md) and feature documentation record implementation work and remaining boundaries. | These are useful engineering records, but do not establish that a YouTrack project or a historical issue workflow exists. |

The history has been rewritten to correct commit co-author attribution. Accordingly, links and evidence should use the **current commit identifiers**. An old screenshot or link using a superseded identifier needs to be re-associated with the current revision. Git author names and account aliases are not sufficient to independently establish each student's contribution; responsibility should also be supported by task records, reviews and an explanation of the relevant implementation.

## 10.2 Allocation of responsibilities

The allocation below is recorded in [Part 1](PART-1-PROPOSAL.md). It is a **documented allocation**, not an independently verified attribution of every commit.

| Team member | Documented responsibilities | Representative implementation evidence |
|---|---|---|
| **Rustam Seitzhan** — Full-Stack Developer | Offline synchronisation engine; WebAuthn and Capacitor passkeys; cross-device QR sign-in; security; CI/CD and blue/green deployment. | [`sync-engine.js`](../../apps/mobile/src/entities/workspace/sync-engine.js), [`server.mjs`](../../apps/api/src/server.mjs), [`qr-auth.mjs`](../../apps/api/src/qr-auth.mjs), [`manage.py`](../../deploy/manage.py), automated workflows and their tests. |
| **Adilzhan Amangeldi** — Full-Stack Developer | EGKN cadastral adapter and coordinate reprojection; 3D crop scene and weather module; 1C OData connector; external API and developer portal. | [`cadastre.mjs`](../../apps/api/src/cadastre.mjs), [`features/home`](../../apps/mobile/src/features/home/), [`features/weather`](../../apps/mobile/src/features/weather/), [`one-c.mjs`](../../apps/api/src/one-c.mjs), [`developer.mjs`](../../apps/api/src/developer.mjs), [`apps/developers`](../../apps/developers/). |

The proposal identifies **Shuteyeva Gulnur Serikovna** as the supervisor. This does not imply that the supervisor implements features or administers the repository.

Ownership of user-research records, task-management records, final evaluation and the newer chat/marketplace/business modules is not allocated by the proposal. These responsibilities require explicit agreement between the two documented team members. They remain **unassigned in this report** rather than being inferred from Git aliases. For cross-cutting changes, the proposed process is to name one responsible implementer and have the other team member review the change.

## 10.3 Work register and task-management approach

GitHub history, code, workflow runs and the engineering documents are the project's primary available management evidence. No YouTrack project URL, exported board or integration configuration was found in the inspected tracked documentation and configuration. The commit prefix `DIP-1` is visible in Git history, but a prefix alone does not prove that a corresponding YouTrack issue exists. The project owner considers a separate YouTrack project optional. Consequently, this report proposes traceability through GitHub and the work register below; if the assessor requires the named YouTrack artefact in the rubric literally, its acceptance or substitution should be clarified before the defense.

The following is a **proposed local work register**. Identifiers beginning with `PM-` are report-local references, not existing YouTrack issue keys. “Implemented” means that code and related artefacts are present; it does not imply that all evaluation gates have passed. Historical implementation records should retain their actual evidence and must not be backdated when imported into a tracker.

| Local ID | Work item | State and evidence | Responsible role / next ownership decision |
|---|---|---|---|
| PM-01 | Offline workspace, authentication and cross-device sign-in | Implemented: [`0688142`](https://github.com/Adilzhan17/egin/commit/0688142) and [`a19cfe3`](https://github.com/Adilzhan17/egin/commit/a19cfe3); workspace, API and QR test suites exist. Evaluation status is recorded separately in Part 9. | Rustam, according to the proposal. |
| PM-02 | Cadastral plot lookup and offline parcel snapshots | Implemented: [`0b64472`](https://github.com/Adilzhan17/egin/commit/0b64472) and [`79468ce`](https://github.com/Adilzhan17/egin/commit/79468ce); cadastral modules and tests are present. Live upstream availability remains a dependency. | Adilzhan, according to the proposal. |
| PM-03 | Weather, 3D home, 1C import and developer API | Implemented artefacts: home/weather features, [`4f7f88a`](https://github.com/Adilzhan17/egin/commit/4f7f88a) for 1C and [`7614495`](https://github.com/Adilzhan17/egin/commit/7614495) for the portal. Sensor telemetry and eGov are excluded. | Adilzhan, according to the proposal. |
| PM-04 | Website deployment and operational safeguards | Implemented tooling: [`deploy/manage.py`](../../deploy/manage.py), compatibility tests and environment-specific data configuration. A current backup/restore and rollback demonstration is still required for the evaluation evidence. | Rustam, according to the proposal. |
| PM-05 | Chat, marketplace and business/trade extensions | Code and implementation records are present: [`8b916fd`](https://github.com/Adilzhan17/egin/commit/8b916fd), [`fe25f2d`](https://github.com/Adilzhan17/egin/commit/fe25f2d), [`9338b8a`](https://github.com/Adilzhan17/egin/commit/9338b8a), [`865e4e6`](https://github.com/Adilzhan17/egin/commit/865e4e6). The defense scope and ownership of these extensions require confirmation. | Unassigned in the proposal. |
| PM-06 | Prepare assessment documentation | Parts 1 and 3–7 were added in [`8cc0ca3`](https://github.com/Adilzhan17/egin/commit/8cc0ca3); Parts 2, 8, 9 and 10 were completed in [`b0b0f46`](https://github.com/Adilzhan17/egin/commit/b0b0f46fc4c4c89422066317c4d550fc0bc25162). The combined report and updated capture evidence are packaged under `prob-period-1`. Outstanding user-research and acceptance evidence remains explicitly identified in the relevant parts. | Documentation owner to be agreed. |
| PM-07 | Substantiate the user-research evidence | Pending: attach anonymised records of 3–5 substantive discussions or a real client agreement; distinguish reported meetings from verified requirements as specified in Part 2. | Research coordinator to be agreed; participants must approve any attributed material. |
| PM-08 | Consolidate task traceability | Planned: assign owners and link the work register or actual GitHub issues/PRs to requirements, changes and verification records. A YouTrack mirror is optional, subject to the assessor's interpretation of the rubric. | Management-record owner to be agreed. |
| PM-09 | Investigate failed or incomplete CI runs and record reproducible verification | Open: inspect the failed Chat and Trade/billing/video steps and complete the cancelled Market run, then execute any relevant Part 9 checks with stated dependencies. Save results and distinguish defects, setup failures, cancellations and skipped tests. | Rustam for core security/deployment and Adilzhan for integrations; owners for extension failures and overall test coordination to be agreed. |
| PM-10 | Conduct outcome and physical-device evaluation | Planned: usability/baseline comparison, mobile performance, real-device permissions and recovery checks, using the conditions in Part 9. | Evaluation owner and participant appointments to be agreed. |
| PM-11 | Freeze and rehearse the defense package | Planned: select the final commit, repair stale claims/links, collect screenshots and measurement records, and rehearse the agreed scenarios. | Both team members; final sign-off process to be agreed with the supervisor. |
| PM-12 | Release native packages or enable external commercial integrations | Deferred: requires a separate scope decision, explicit native-release instruction where applicable, provider access and validation. | Relevant implementation owner after the scope is approved. |

If a board is adopted in GitHub or YouTrack, the proposed states are **Backlog → Ready → In Progress → Review → Verification → Done**, with a separate **Blocked** state and a recorded reason. Each issue or work-register entry should include its requirement IDs from Part 6, objective, acceptance criteria, assignee, dependency, risk reference where relevant, implementation link and verification evidence. Link any actual issue identifiers to the local `PM-` references; do not present local IDs as proof of an existing external board.

## 10.4 Milestones and acceptance gates

No approved calendar schedule or dated milestone commitments were supplied. The milestones below are therefore **ordered acceptance gates**, not invented deadlines. Dates should be added only after the team confirms the academic submission date, available participants and testing resources.

| Milestone | Current position | Exit evidence | Dependency |
|---|---|---|---|
| M1 — Define and substantiate the problem | Proposal and literature analysis exist; user discussions are reported by the team. | Reviewed proposal; anonymised discussion records; evidence-to-requirement mapping; assumptions explicitly labelled. | Access to original notes and participant permission; PM-07. |
| M2 — Establish requirements and design | Parts 6 and 7 exist; the implementation has subsequently expanded. | Requirements and diagrams reconciled with the selected defense scope and actual current behavior; acceptance criteria remain measurable. | M1 and scope review of later extensions. |
| M3 — Deliver the functional website prototype | Source modules and deployment tooling are present. | Reproducible web build and demonstration of the Part 8 scenarios at a recorded revision, with screenshots and visible limitations. | M2; a test environment and suitable test accounts/data. |
| M4 — Demonstrate functional and security verification | Automated suites and historical reports exist; current CI includes failures requiring investigation. | Current run logs, environment description, requirement-to-test mapping, and reviewed failures/skips; no unsupported “all tests passed” claim. | M3; isolated SQLite/PostgreSQL and required media tools; PM-09. |
| M5 — Evaluate the project aim | Measurement plan prepared; completed outcome measurements are not assumed. | Baseline comparison, usability results, performance data, real-device checks and operational recovery evidence. | M4; representative participants and devices; PM-10. |
| M6 — Complete management and defense evidence | In preparation. | GitHub/work-register evidence, named owners, task-to-commit-to-test links, risk review, final source SHA and rehearsed presentation. A YouTrack artefact is added only if required by the assessor. | PM-08; M1–M5 evidence or explicitly disclosed unresolved items. |
| M7 — Optional native/commercial release | Outside the current documentation task. | Explicit owner release request, signing/provider configuration and separate release acceptance. | Required accounts/agreements and validation; no automatic native build on push or PR. |

## 10.5 Risk assessment

Probability and impact are **qualitative planning judgements**, not measured probabilities. *High impact* denotes possible data exposure/loss, failure of a core user scenario or failure to substantiate an assessment criterion; *medium impact* denotes limited functional degradation or rework. Risk owners should be confirmed when the corresponding work items are assigned.

| Risk | Probability | Impact | Mitigation Strategy |
|---|---|---|---|
| R1 — Reported interviews cannot be substantiated or are interpreted as validated feature demand. | Medium | High | Preserve original notes and consent; use anonymised participant IDs; distinguish direct evidence, team reports and hypotheses. Obtain 3–5 substantive discussion records without inventing quotations or retrospective dates. |
| R2 — Task ownership or the assessor's expected management artefact is unclear. | Medium | Medium | Assign owners and demonstrate the GitHub/work-register task-to-commit-to-test chain. Clarify whether the named YouTrack artefact is required; provide it only if needed, without inventing historical issues. |
| R3 — Public EGKN, map tiles, weather or news services change or become unavailable. | Medium | High for cadastral lookup; Medium for secondary feeds | Keep bounded requests, controlled errors and tested fixtures; demonstrate GeoJSON/geolocation fallbacks and labelled cached data. Review upstream terms and access before broader operation. |
| R4 — Offline retries, concurrent edits or interrupted updates lose or duplicate user data. | Medium | High | Test idempotent retries, record versions, tombstones, conflict resolution, user isolation and service-worker updates. Retain exports/backups and demonstrate recovery with disposable test records. |
| R5 — Passkey, portal-session, API-scope or organisation-membership errors expose private data or lock out users. | Medium | High | Maintain negative ownership/scope/origin tests, QR audience separation and recovery-code tests; store only hashed API secrets; review permission changes and avoid production credentials in evidence. |
| R6 — Deployment or schema changes make rollback unsafe or damage retained data/assets. | Medium | High | Deploy to staging first, validate and promote the same images. Keep the permanent gateway, environment-specific volumes, `deploy/state/`, both asset namespaces and SQLite/PostgreSQL backups. Require backward-compatible migrations and retain the existing privacy/demo compatibility guards. |
| R7 — Browser automation is mistaken for physical Android/iPhone validation. | Medium | High | Record browser/OS versions and test actual devices for permissions, passkeys, media and installation. Keep native packaging separate and trigger it only after the explicit release instruction. |
| R8 — Expanding chat, marketplace and business scope prevents completion of the core evaluation. | High | High | Agree the defense scope, prioritise Part 6 Must requirements and the evidence gates, and defer optional extensions/integrations. Track new scope as a separate issue with an explicit acceptance criterion. |
| R9 — Documentation, commit links and test results refer to different revisions after history changes. | High until reconciled | Medium | Use current SHAs, record the final submission revision, validate links, remove unsupported tag/status claims and attach run metadata. Retain historical reports as historical evidence. |
| R10 — Provider access, commercial settings, signing accounts or test participants are unavailable. | Medium | High for affected milestones | Record blockers and owners early; use explicit fixtures and test accounts for technical verification; distinguish these from live-provider or user validation. Do not claim eGov, banking, EDS or sensor integration without the required access. |
| R11 — Synthetic plots, private trade demos or a 3D example are mistaken for measured agricultural outcomes. | Medium | High | Preserve visible demo/source labels and isolation; explain that 3D is illustrative until real analytics exists. Show no invented sensor readings, growth phase, commercial transactions or interview outcomes. |
| R12 — Insufficient coordination between two developers leaves cross-cutting work unreviewed. | Medium | Medium | Confirm one owner per issue, use peer review and short risk/blocker reviews, and record handover notes. Schedule work against confirmed availability rather than assumed dates. |
| R13 — Failing CI remains unexplained and `main` permits changes without mandatory passing checks. | High while unresolved | High | Investigate the actual failed run logs, track corrective work and re-run affected suites. Agree appropriate protection or review controls before the final baseline; do not equate a successful Mobile job with success of all workflows. |

## 10.6 Technical and organisational dependencies

| Dependency | Purpose and effect if unavailable | Management action |
|---|---|---|
| Node.js, pnpm and web tooling | The repository pins pnpm in [`package.json`](../../package.json); CI uses Node 22. A mismatched environment can invalidate reproduction. | Record actual versions and use the lockfile; build both web applications. |
| SQLite, PostgreSQL and private file storage | SQLite supports identity/workspace data; later marketplace, chat, platform and trade modules use PostgreSQL. Media and documents also depend on stored files. | Provide isolated test databases and document backup/restore coverage for all required stores; do not describe the complete current application as SQLite-only. |
| Docker, Nginx, DNS/TLS and deployment state | Required for the documented website deployment and origin separation. Loss of persistent volumes or state affects recovery. | Preserve the permanent gateway and deploy state; validate main-app and portal origins in each environment. |
| Media-processing and browser-test dependencies | Some integration scenarios need PostgreSQL, ffmpeg/qpdf and installed Playwright browsers. A default test run can skip dependency-bound suites. | Record setup, execute the applicable suites explicitly and disclose every skipped test. |
| External data providers and customer 1C | Cadastral/weather/news features and live OData import depend on provider behavior and valid customer access. | Separate fixture coverage from live validation; use read-only 1C credentials and document fallback scenarios. |
| Representative users and permission to use evidence | Needed to substantiate relevance and conduct outcome measurements. | Agree participation, anonymise records and preserve consent; public support for promotion is not an official partnership or contract. |
| GitHub review access and, if required, a YouTrack project | Needed to demonstrate traceability and review private repository evidence. | Arrange authorised access to the GitHub evidence. Confirm whether a separate tracker is necessary; avoid publishing credentials or participant data to make the assessment easier. |
| Supervisor feedback and confirmed submission schedule | Needed to settle scope, milestone dates and presentation requirements. | Confirm the scope and dates before committing to a calendar plan; record the resulting decisions. |
| Physical devices and optional release credentials | Needed for device acceptance; Android/iOS packaging additionally depends on release authorisation and signing configuration. | Reserve devices for website/PWA checks. Keep native release work deferred until explicitly requested; iOS trust/signing readiness requires separate verification. |

## 10.7 Traceability and change-control workflow

The proposed traceability chain is:

**Evidence in Part 2 → requirement in Part 6 → work item / actual GitHub issue → reviewed code change/current Git SHA → test or measurement record in Part 9 → milestone acceptance.**

1. Record the user need or engineering problem, identify its source and distinguish verified facts from assumptions.
2. Record a work item or create an actual GitHub issue with a named owner, requirement IDs, scope, acceptance criteria and dependencies. If YouTrack is used, link its real issue key without replacing or fabricating historical evidence.
3. Implement the agreed change in a working branch and request peer review. Include the actual work-item/issue reference in the commit or PR; historical commits may be linked from a new issue without claiming an earlier tracker history.
4. Run checks appropriate to the change and attach their actual results. Inspect failed/skipped checks and agree required branch-protection controls; `main` was unprotected at this review. A workflow file alone is not proof that merging is blocked on failure.
5. For a website release, use `python3 deploy/manage.py deploy staging`, validate both web applications, then promote with `python3 deploy/manage.py deploy production --reuse-images TAG`. Production rollback must preserve data and respect compatibility guards. Native packages are not built during routine website changes.
6. Move the issue to Done only when its acceptance evidence is attached. Update the risk register and milestone state; keep incomplete provider/device/user validation visible as separate open work.

This is a recommended process for the remaining work. The repository inspection does not establish that every past change followed it.

## 10.8 Evidence to show at the defense

| Evidence | Availability at this review | What to present / prepare |
|---|---|---|
| Repository, implementation and current history | Available. | Open the project tree, selected current commits and the final submission SHA; explain the role of each application and the current scope. |
| Responsibility allocation | Documented in Part 1. | Present the two named roles and obtain agreement on the currently unassigned research, tracker and evaluation responsibilities. Demonstrate individual understanding of relevant code. |
| Automated test and deployment configuration | Available; results must be tied to actual runs. | Show workflow files, the selected CI run and relevant local/integration logs, including failures and skips. Demonstrate backup/restore separately from the existence of backup code. |
| Task and implementation notes | Available in engineering documentation. | Show representative completed artefacts and explain the difference between implementation status and evaluation acceptance. |
| Actual YouTrack project and board | Not evidenced; optional under the owner's stated approach. | If required by the assessor, provide a real project URL, members/assignees and linked issues. Otherwise demonstrate the agreed GitHub/work-register substitute and disclose the absence of YouTrack. |
| Milestones and risks | Proposed in this section. | Confirm owners and dates, review dependencies and show how at least one unresolved risk leads to a concrete task. |
| User-research and outcome evidence | Required additions are specified in Parts 2 and 9. | Attach consented/anonymised discussion records, measurement data and baseline results; identify outstanding work candidly. |

The project has substantial implementation and version-control evidence. Remaining management work consists of confirming ownership, linking milestone acceptance to actual verification results and resolving the failed CI runs. A separate YouTrack project is an optional addition unless the assessor requires the named tool explicitly.
