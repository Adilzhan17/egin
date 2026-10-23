# 9. Verification and Evaluation Plan

Verification checks requirements; evaluation tests whether users complete useful tasks more effectively. Evidence below separates historical execution at `8cc0ca3` from subsequent web builds at `b0b0f46`. Their application-source trees are identical. Neither screenshots nor an implemented test file demonstrate complete acceptance.

| Check | Recorded result and interpretation |
|---|---|
| Historical TypeScript/unit checks | Both web apps passed typechecking. Mobile unit results: **73 passed, 0 failed, 0 skipped**. Coverage includes geometry, weather, events, exports and synchronisation helpers. |
| Historical API run | **38 passed, 20 failed, 1 skipped**; overall command failed. All 20 failures arose during `sharp` native-runtime import, before affected assertions executed. Counts combine tests and failed file-level entries; they are not requirement coverage. |
| Historical CI snapshot | Mobile checks succeeded, with Android packaging skipped. Chat and Trade/billing/video workflows failed; Market was cancelled during browser installation. These outcomes remain unresolved in this evidence set. |
| Subsequent fresh web builds | Mobile and developer TypeScript/Vite builds passed; mobile service-worker generation passed. Missing build dependencies were supplied in an isolated copy. This did not repair or rerun the blocked API suite. |
| Subsequent UI capture | **9 screenshots, 0 reported page errors**, Chromium 153.0.8010.12, 23 October 2026. Synthetic guest records and intercepted APIs establish rendering, not live authentication, synchronisation, downloads or service-worker behaviour. |

Evidence is retained in the [local verification record](../../evidence/verification/2026-10-23-local-checks.txt), [fresh-build record](../../evidence/verification/2026-10-23-web-build-capture.txt), [capture metadata](../../evidence/ux/capture-metadata.json) and [detailed evaluation/CI register](../../PART-9-VERIFICATION-EVALUATION.md). Database/inference-dependent scenarios and physical-device certification are not established by these runs.

**Planned outcome evaluation — all three targets remain unmeasured:**

1. **Task completion:** at least 90% correct, unassisted completions across the defined task set; report counts and every failure.
2. **Parcel-addition time:** median ≤60 seconds and lower than a matched manual workflow; retain failures and timeouts alongside successful timings.
3. **Offline preservation:** 100% of queued operations accounted for, with zero silent losses or duplicates across at least 20 interruption/reconnection cycles.

Freeze the candidate revision, devices, fixtures and network conditions. Compare equivalent tasks using separate cadastral/weather tools and a record template; retain consented observations and counterbalance task order. First rerun blocked API/browser checks, then complete physical-device, accessibility and recovery checks. Native release readiness, yield improvements, adoption and user satisfaction are not claimed.
