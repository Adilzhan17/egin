# EGIN browser performance: after

Measured 2026-10-04T17:44:57.040Z, 147.0.7727.101, localhost production build. JSON contains individual network requests and long tasks.

This is one laboratory sample per route/profile at 390×844, with a cold browser cache and retained server/provider caches. It is not Lighthouse, field Core Web Vitals, or measurement on a physical smartphone. CPU throttling is relative to the current machine. Maps use headless Chrome software WebGL (SwiftShader). External tile/provider timing varies. LCP is observed until a bounded post-ready interval, not an unconstrained page lifetime.

Network profiles are explicitly configured in the harness: normal unthrottled / CPU 1×; Fast4G 1.6 Mbit/s down, 750 Kbit/s up, 150 ms latency / CPU 4×; Slow4G 500 Kbit/s down/up, 400 ms latency / CPU 4×. These are named test scenarios, not a claim to reproduce all real 4G networks.

| Profile | Route | TTFB ms | FCP ms | LCP ms | UI ready ms | JS transfer KiB | API count/KiB | Long-task total ms | Menu click→paint ms | First WebGL draw ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| normal | / | 13 | 84 | 480 | 515 | 182.7 | 2/5.6 | 197 | 20 | — |
| normal | /map | 9 | 84 | 776 | 1220 | 671.5 | 4/7.5 | 717 | 22 | 861 |
| normal | /assistant | 10 | 88 | 780 | 1033 | 187.6 | 4/13.0 | 168 | 22 | — |
| normal | /community | 9 | 80 | 672 | 1058 | 192.5 | 3/6.1 | 95 | 21 | — |
| normal | /market | 10 | 76 | 640 | 1024 | 189.1 | 4/9.0 | 95 | 23 | — |
| fast4g-cpu4 | / | 9 | 688 | 2624 | 2684 | 182.7 | 2/5.6 | 822 | 50 | — |
| fast4g-cpu4 | /map | 11 | 720 | 2636 | 6718 | 671.5 | 4/7.5 | 2210 | 39 | 6097 |
| fast4g-cpu4 | /assistant | 12 | 704 | 3188 | 3449 | 187.6 | 4/13.0 | 1244 | 82 | — |
| fast4g-cpu4 | /community | 13 | 720 | 2792 | 2918 | 192.5 | 3/6.1 | 740 | 38 | — |
| fast4g-cpu4 | /market | 9 | 712 | 2660 | 3419 | 189.1 | 4/9.0 | 865 | 62 | — |
| slow4g-cpu4 | / | 9 | 1940 | 5984 | 6039 | 182.7 | 2/5.6 | 812 | 57 | — |
| slow4g-cpu4 | /map | 9 | 1932 | 6292 | 17012 | 671.5 | 4/7.5 | 2183 | 42 | 16367 |
| slow4g-cpu4 | /assistant | 10 | 1948 | 7416 | 6431 | 187.6 | 4/13.0 | 1124 | 86 | — |
| slow4g-cpu4 | /community | 10 | 1916 | 6756 | 6930 | 192.5 | 3/6.1 | 750 | 37 | — |
| slow4g-cpu4 | /market | 9 | 1936 | 6460 | 7492 | 189.1 | 4/9.0 | 907 | 63 | — |

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

Cold measurement isolates the network navigation path with Service Workers blocked in the profiling browser; the baseline had no Service Worker. This ensures page CDP throttling and transfer-byte accounting include dynamic chunks. Production Service Worker functionality is tested separately; these cold values do not include Service Worker installation or interception overhead.

## Supplementary laboratory timings

Field INP: **unavailable**. The Event Timing values below are the maximum observed duration from a single synthetic, trusted menu interaction; they are not a field INP result. Event Timing durations are rounded by the browser and entries below its reporting threshold can be absent. Script CPU and main-thread task time are CDP counter deltas over the measured navigation and bounded observation window, excluding warmup counters.

| Profile | Route | Script CPU ms | Main-thread task ms | Menu Event Timing ms |
|---|---|---:|---:|---:|
| normal | / | 177 | 508 | 24 |
| normal | /map | 605 | 1844 | 24 |
| normal | /assistant | 249 | 603 | 32 |
| normal | /community | 214 | 498 | 16 |
| normal | /market | 201 | 480 | 24 |
| fast4g-cpu4 | / | 712 | 1907 | 64 |
| fast4g-cpu4 | /map | 1672 | 4122 | 64 |
| fast4g-cpu4 | /assistant | 890 | 2336 | 96 |
| fast4g-cpu4 | /community | 747 | 1771 | 56 |
| fast4g-cpu4 | /market | 800 | 2085 | 80 |
| slow4g-cpu4 | / | 731 | 2187 | 72 |
| slow4g-cpu4 | /map | 1623 | 4374 | 64 |
| slow4g-cpu4 | /assistant | 843 | 2677 | 104 |
| slow4g-cpu4 | /community | 770 | 2136 | 56 |
| slow4g-cpu4 | /market | 773 | 2433 | 80 |

For an independent warm-home measurement: `PROFILE_LABEL=after-warm-home PROFILE_CACHE=warm PROFILE_ROUTES=/ PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs`. Warm results are not a cold-to-cold comparison.
