# EGIN: controlled browser before/after comparison

The largest benefit is lower transferred JavaScript and faster rendering under the two constrained-network scenarios. Home no longer loads the interactive WebGL map; the actual map route still uses its full renderer. These measurements do not show a universal improvement: normal localhost LCP rose on the four non-home routes, and several CPU/long-task measurements rose with the new application initialization and richer features.

## Scope and provenance

- One sample per route/profile, 390×844, existing headless Chrome, software WebGL; these are laboratory observations, not field Core Web Vitals or a physical smartphone benchmark.
- Controlled cold after samples block Service Workers so that page CDP network shaping and transfer counters also cover lazy chunks. The baseline had no Service Worker. Production SW installation/interception cost is excluded from this comparison; offline/SW behavior has separate browser coverage.
- Both runs retained backend/provider caches. This does not isolate server startup or provider variability. TTFB in the after samples is 9–13 ms; do not attribute a single first-request improvement solely to architectural changes.
- Network profile names describe configured CDP settings. Recorded NavigationTiming TTFB on loopback does not confirm an effective 150/400 ms RTT; those latency settings must not be presented as validated real-world 4G round-trip times.
- Baseline summary was recovered from its independently preserved Markdown after an ENOSPC truncation: timings retain integer-ms precision and bytes retain 0.1 KiB precision. Original baseline per-request/long-task traces and script-CPU counters are unavailable. No baseline data was recreated by running new code.
- After base commit: `4644067f43d7cc59de2ba969bb38464c788d4567`; working tree dirty: **true**. The measured code includes the tested working-tree changes.

## Rendering and main-thread long tasks

All values are milliseconds, before → after. A lower value is better; these single samples do not establish statistical significance.

| Profile | Route | FCP | LCP | Long-task total |
|---|---|---:|---:|---:|
| normal | / | 512 → 84 | 2188 → 480 | 1034 → 197 |
| normal | /map | 64 → 84 | 284 → 776 | 592 → 717 |
| normal | /assistant | 72 → 88 | 392 → 780 | 59 → 168 |
| normal | /community | 52 → 80 | 264 → 672 | 78 → 95 |
| normal | /market | 56 → 76 | 260 → 640 | 75 → 95 |
| fast4g-cpu4 | / | 2012 → 688 | 8036 → 2624 | 1791 → 822 |
| fast4g-cpu4 | /map | 2040 → 720 | 4780 → 2636 | 1887 → 2210 |
| fast4g-cpu4 | /assistant | 2036 → 704 | 5508 → 3188 | 656 → 1244 |
| fast4g-cpu4 | /community | 2036 → 720 | 4752 → 2792 | 515 → 740 |
| fast4g-cpu4 | /market | 2060 → 712 | 4808 → 2660 | 865 → 865 |
| slow4g-cpu4 | / | 6432 → 1940 | 17612 → 5984 | 1617 → 812 |
| slow4g-cpu4 | /map | 6436 → 1932 | 13788 → 6292 | 1899 → 2183 |
| slow4g-cpu4 | /assistant | 6428 → 1948 | 15752 → 7416 | 583 → 1124 |
| slow4g-cpu4 | /community | 6416 → 1916 | 13748 → 6756 | 461 → 750 |
| slow4g-cpu4 | /market | 6452 → 1936 | 13764 → 6460 | 730 → 907 |

Local unthrottled non-home LCP regressions are explicit above. Route chunk loading and application snapshot initialization add work before those views appear; further profiling would be needed to separate each cause. Constrained-network LCP improves on all five routes, while CPU work does not improve on every route. The after report separately lists measured ScriptDuration counter deltas; no script-CPU before/after claim is possible because baseline raw counters were lost.

## Network work

Normal-profile transfer, KiB. Compressed JS sizes are stable across all three after network scenarios. API counts include the persistent SSE connection; its unfinished response has no final byte count, so API KiB are completed-response bytes during the bounded observation interval, not lifetime stream traffic. This is a transfer/request comparison, not a server CPU or production-load benchmark.

| Route | JS KiB before → after | JS reduction | API requests before → after | API KiB before → after |
|---|---:|---:|---:|---:|
| / | 2425.2 → 182.7 | 92.5% | 6 → 2 | 117.1 → 5.6 |
| /map | 2425.2 → 671.5 | 72.3% | 4 → 4 | 5.7 → 7.5 |
| /assistant | 638.7 → 187.6 | 70.6% | 4 → 4 | 31.2 → 13.0 |
| /community | 638.7 → 192.5 | 69.9% | 2 → 3 | 3.3 → 6.1 |
| /market | 638.7 → 189.1 | 70.4% | 3 → 4 | 19.6 → 9.0 |

The new bootstrap payload is larger than the old route-specific API total on map/chat. Home, assistant and market transfer fewer completed API bytes. Chat also now has presence, membership and richer message data; those features should not be described as a zero-cost speedup.

## Map initialization

First observed WebGL draw, not complete tile arrival or final map usability. Home has no WebGL initialization after the change, so its old decorative-map timing is not reported as an artificial zero-ms renderer improvement.

| Profile | Before ms | After ms | Reduction |
|---|---:|---:|---:|
| normal | 522 | 861 | -65.0% |
| fast4g-cpu4 | 15079 | 6097 | 59.6% |
| slow4g-cpu4 | 46241 | 16367 | 64.6% |

## Interaction and repeat visits

Field INP is **unavailable**. The after report records a trusted menu click to two animation frames and separate PerformanceEventTiming entries. Across these cold samples, maximum reported single-menu Event Timing is 104 ms; this is a synthetic interaction observation, not INP.

Warm home results are recorded separately in `performance-after-warm-home.json/.md` with the actual Service Worker, IndexedDB and browser caches. They must not be substituted into this cold comparison. Worker Resource Timing supplements page transfer accounting; page CDP network shaping is not guaranteed to cover worker cache misses.

## Artifacts and reproduction

- `performance-before.json/.md`: honest recovered baseline summary.
- `performance-after.json/.md`: all 15 controlled cold samples, requests, long tasks, CPU counters and Event Timing entries.
- `performance-after-warm-home.json/.md`: three independent warm-home samples.
- `chat-browser-verification.json`: actual two-account SSE delivery, duplicate/replay, chat feature checks and store-processing/render timings.

Run `PROFILE_LABEL=after PROFILE_SW=block PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs`, then `PROFILE_LABEL=after node scripts/profile-report.mjs`. For warm home use `PROFILE_LABEL=after-warm-home PROFILE_CACHE=warm PROFILE_SW=allow PROFILE_ROUTES=/ PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs` and the matching report label. Regenerate this comparison with `node scripts/profile-compare.mjs`.
