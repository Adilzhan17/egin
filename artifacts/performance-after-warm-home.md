# EGIN browser performance: after-warm-home

Measured 2026-10-04T17:45:52.187Z, 147.0.7727.101, localhost production build. JSON contains individual network requests and long tasks.

This is one laboratory sample per route/profile at 390×844, with warm browser/Service Worker/IndexedDB caches after an unthrottled warmup, and retained server/provider caches. It is not Lighthouse, field Core Web Vitals, or measurement on a physical smartphone. CPU throttling is relative to the current machine. Maps use headless Chrome software WebGL (SwiftShader). External tile/provider timing varies. LCP is observed until a bounded post-ready interval, not an unconstrained page lifetime.

Network profiles are explicitly configured in the harness: normal unthrottled / CPU 1×; Fast4G 1.6 Mbit/s down, 750 Kbit/s up, 150 ms latency / CPU 4×; Slow4G 500 Kbit/s down/up, 400 ms latency / CPU 4×. These are named test scenarios, not a claim to reproduce all real 4G networks.

| Profile | Route | TTFB ms | FCP ms | LCP ms | UI ready ms | JS transfer KiB | API count/KiB | Long-task total ms | Menu click→paint ms | First WebGL draw ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| normal | / | 27 | 100 | 252 | 325 | 0.0 | 2/5.6 | 0 | 23 | — |
| fast4g-cpu4 | / | 22 | 332 | 788 | 1047 | 0.0 | 2/5.6 | 355 | 56 | — |
| slow4g-cpu4 | / | 21 | 252 | 772 | 983 | 0.0 | 2/5.6 | 412 | 52 | — |

The menu measurement records a real trusted browser click to completion of two animation frames. It is an observed local interaction sample, **not INP**. Full field INP requires real user monitoring. First WebGL draw measures renderer initialization and does not guarantee all remote map tiles have arrived. Transfer sizes include response headers; requests still open at collection time have a null byte count.

Checks: No page JavaScript exceptions or HTTP API failures were observed.

## Reproduce

Run the existing production containers, then:

```sh
node scripts/profile-browser.mjs
node scripts/profile-report.mjs
```

Uses the already installed Playwright and Chrome; installs nothing. Login is restricted to localhost by default. The script logs in with the demo account, loads authenticated pages, and opens a navigation menu. It does not send messages, mutate product records, invoke LLM generation, or alter deployment state.

After changes use `PROFILE_LABEL=after node scripts/profile-browser.mjs` and the same label for the report command. If the home no longer initializes WebGL, set `PROFILE_MAP_ROUTES=/map`. To rerun selected cases without replacing others use `PROFILE_RESUME=1 PROFILE_MODES=fast4g-cpu4,slow4g-cpu4 PROFILE_ROUTES=/ node scripts/profile-browser.mjs`.

Source provenance: base commit `4644067f43d7cc59de2ba969bb38464c788d4567`; working tree dirty: **true**. A dirty measurement describes the tested working tree, not an unchanged checkout of that commit.

Network shaping caveat: the profile names describe configured CDP bandwidth/latency/CPU settings. Recorded NavigationTiming TTFB on loopback stayed well below the configured 150/400 ms latency in both runs; it does not demonstrate an effective 150/400 ms RTT. These are controlled configured-CDP scenarios, not validated real-world 4G RTT measurements.

Warm measurement retains the actual Service Worker. Its Resource Timing entries are recorded separately and their JS transfer sizes supplement page CDP counters; warmup entries are cleared before navigation. Page CDP throttling is not guaranteed to cover a Service Worker cache miss, so warm figures characterize cached visits, not an uncached network path.

## Supplementary laboratory timings

Field INP: **unavailable**. The Event Timing values below are the maximum observed duration from a single synthetic, trusted menu interaction; they are not a field INP result. Event Timing durations are rounded by the browser and entries below its reporting threshold can be absent. Script CPU and main-thread task time are CDP counter deltas over the measured navigation and bounded observation window, excluding warmup counters.

| Profile | Route | Script CPU ms | Main-thread task ms | Menu Event Timing ms |
|---|---|---:|---:|---:|
| normal | / | 95 | 359 | 24 |
| fast4g-cpu4 | / | 304 | 1293 | 72 |
| slow4g-cpu4 | / | 303 | 1245 | 72 |

For an independent warm-home measurement: `PROFILE_LABEL=after-warm-home PROFILE_CACHE=warm PROFILE_ROUTES=/ PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs`. Warm results are not a cold-to-cold comparison.
