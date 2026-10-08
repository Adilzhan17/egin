# EGIN browser performance: before

Measured 2026-10-04T16:41:02.934Z, 147.0.7727.101, localhost production build. **Recovered baseline summary:** an ENOSPC disk-full error truncated the detailed JSON. The 15 table rows were preserved independently and restored to JSON with their displayed precision; individual request/long-task traces are unavailable. These are the original measurements, not a rerun against changed code.

This is one laboratory sample per route/profile at 390×844, with a cold browser cache and retained server/provider caches. It is not Lighthouse, field Core Web Vitals, or measurement on a physical smartphone. CPU throttling is relative to the current machine. Maps use headless Chrome software WebGL (SwiftShader). External tile/provider timing varies. LCP is observed until a bounded post-ready interval, not an unconstrained page lifetime.

Network profiles are explicitly configured in the harness: normal unthrottled / CPU 1×; Fast4G 1.6 Mbit/s down, 750 Kbit/s up, 150 ms latency / CPU 4×; Slow4G 500 Kbit/s down/up, 400 ms latency / CPU 4×. These are named test scenarios, not a claim to reproduce all real 4G networks.

| Profile | Route | TTFB ms | FCP ms | LCP ms | UI ready ms | JS transfer KiB | API count/KiB | Long-task total ms | Menu click→paint ms | First WebGL draw ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| normal | / | 292 | 512 | 2188 | 1307 | 2425.2 | 6/117.1 | 1034 | 20 | 1459 |
| normal | /map | 17 | 64 | 284 | 711 | 2425.2 | 4/5.7 | 592 | 24 | 522 |
| normal | /assistant | 11 | 72 | 392 | 305 | 638.7 | 4/31.2 | 59 | 25 | — |
| normal | /community | 12 | 52 | 264 | 379 | 638.7 | 2/3.3 | 78 | 25 | — |
| normal | /market | 10 | 56 | 260 | 368 | 638.7 | 3/19.6 | 75 | 25 | — |
| fast4g-cpu4 | / | 7 | 2012 | 8036 | 6079 | 2425.2 | 6/117.1 | 1791 | 82 | 15847 |
| fast4g-cpu4 | /map | 10 | 2040 | 4780 | 15720 | 2425.2 | 4/5.7 | 1887 | 35 | 15079 |
| fast4g-cpu4 | /assistant | 8 | 2036 | 5508 | 5050 | 638.7 | 4/31.2 | 656 | 46 | — |
| fast4g-cpu4 | /community | 8 | 2036 | 4752 | 5473 | 638.7 | 2/3.3 | 515 | 26 | — |
| fast4g-cpu4 | /market | 10 | 2060 | 4808 | 5563 | 638.7 | 3/19.6 | 865 | 49 | — |
| slow4g-cpu4 | / | 9 | 6432 | 17612 | 17669 | 2425.2 | 6/117.1 | 1617 | 82 | 48576 |
| slow4g-cpu4 | /map | 11 | 6436 | 13788 | 46893 | 2425.2 | 4/5.7 | 1899 | 35 | 46241 |
| slow4g-cpu4 | /assistant | 9 | 6428 | 15752 | 14085 | 638.7 | 4/31.2 | 583 | 44 | — |
| slow4g-cpu4 | /community | 9 | 6416 | 13748 | 14573 | 638.7 | 2/3.3 | 461 | 26 | — |
| slow4g-cpu4 | /market | 8 | 6452 | 13764 | 15577 | 638.7 | 3/19.6 | 730 | 55 | — |

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

Network shaping caveat: the profile names describe configured CDP bandwidth/latency/CPU settings. Recorded NavigationTiming TTFB on loopback stayed well below the configured 150/400 ms latency in both runs; it does not demonstrate an effective 150/400 ms RTT. These are controlled configured-CDP scenarios, not validated real-world 4G RTT measurements.

For an independent warm-home measurement: `PROFILE_LABEL=after-warm-home PROFILE_CACHE=warm PROFILE_ROUTES=/ PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs`. Warm results are not a cold-to-cold comparison.
