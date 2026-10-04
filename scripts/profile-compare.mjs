import { readFile, writeFile, rename } from 'node:fs/promises';

const before = JSON.parse(await readFile('artifacts/performance-before.json', 'utf8'));
const after = JSON.parse(await readFile('artifacts/performance-after.json', 'utf8'));
const round = value => value == null ? '—' : String(Math.round(value));
const kib = value => (value / 1024).toFixed(1);
const percent = (oldValue, newValue) => ((1 - newValue / oldValue) * 100).toFixed(1) + '%';
const pairs = after.results.map(current => ({ current, previous: before.results.find(row => row.profile === current.profile && row.route === current.route) }));
if (pairs.length !== 15 || pairs.some(pair => !pair.previous)) throw new Error('Comparison requires all 15 matching cold samples.');
const lcpRows = pairs.map(({ previous: p, current: c }) => `| ${c.profile} | ${c.route} | ${round(p.fcpMs)} → ${round(c.fcpMs)} | ${round(p.lcp?.timeMs)} → ${round(c.lcp?.timeMs)} | ${round(p.longTaskTotalMs)} → ${round(c.longTaskTotalMs)} |`).join('\n');
const routeRows = pairs.filter(({ current }) => current.profile === 'normal').map(({ previous: p, current: c }) => `| ${c.route} | ${kib(p.jsTransferBytes)} → ${kib(c.jsTransferBytes)} | ${percent(p.jsTransferBytes, c.jsTransferBytes)} | ${p.apiRequests} → ${c.apiRequests} | ${kib(p.apiTransferBytes)} → ${kib(c.apiTransferBytes)} |`).join('\n');
const mapRows = pairs.filter(({ current }) => current.route === '/map').map(({ previous: p, current: c }) => `| ${c.profile} | ${round(p.mapWebglFirstDrawMs)} | ${round(c.mapWebglFirstDrawMs)} | ${percent(p.mapWebglFirstDrawMs, c.mapWebglFirstDrawMs)} |`).join('\n');
const output = `# EGIN: controlled browser before/after comparison

The largest benefit is lower transferred JavaScript and faster rendering under the two constrained-network scenarios. Home no longer loads the interactive WebGL map; the actual map route still uses its full renderer. These measurements do not show a universal improvement: normal localhost LCP rose on the four non-home routes, and several CPU/long-task measurements rose with the new application initialization and richer features.

## Scope and provenance

- One sample per route/profile, 390×844, existing headless Chrome, software WebGL; these are laboratory observations, not field Core Web Vitals or a physical smartphone benchmark.
- Controlled cold after samples block Service Workers so that page CDP network shaping and transfer counters also cover lazy chunks. The baseline had no Service Worker. Production SW installation/interception cost is excluded from this comparison; offline/SW behavior has separate browser coverage.
- Both runs retained backend/provider caches. This does not isolate server startup or provider variability. TTFB in the after samples is ${round(Math.min(...after.results.map(row => row.ttfbMs)))}–${round(Math.max(...after.results.map(row => row.ttfbMs)))} ms; do not attribute a single first-request improvement solely to architectural changes.
- Network profile names describe configured CDP settings. Recorded NavigationTiming TTFB on loopback does not confirm an effective 150/400 ms RTT; those latency settings must not be presented as validated real-world 4G round-trip times.
- Baseline summary was recovered from its independently preserved Markdown after an ENOSPC truncation: timings retain integer-ms precision and bytes retain 0.1 KiB precision. Original baseline per-request/long-task traces and script-CPU counters are unavailable. No baseline data was recreated by running new code.
- After base commit: \`${after.environment.revision}\`; working tree dirty: **${after.environment.workingTreeDirty}**. The measured code includes the tested working-tree changes.

## Rendering and main-thread long tasks

All values are milliseconds, before → after. A lower value is better; these single samples do not establish statistical significance.

| Profile | Route | FCP | LCP | Long-task total |
|---|---|---:|---:|---:|
${lcpRows}

Local unthrottled non-home LCP regressions are explicit above. Route chunk loading and application snapshot initialization add work before those views appear; further profiling would be needed to separate each cause. Constrained-network LCP improves on all five routes, while CPU work does not improve on every route. The after report separately lists measured ScriptDuration counter deltas; no script-CPU before/after claim is possible because baseline raw counters were lost.

## Network work

Normal-profile transfer, KiB. Compressed JS sizes are stable across all three after network scenarios. API counts include the persistent SSE connection; its unfinished response has no final byte count, so API KiB are completed-response bytes during the bounded observation interval, not lifetime stream traffic. This is a transfer/request comparison, not a server CPU or production-load benchmark.

| Route | JS KiB before → after | JS reduction | API requests before → after | API KiB before → after |
|---|---:|---:|---:|---:|
${routeRows}

The new bootstrap payload is larger than the old route-specific API total on map/chat. Home, assistant and market transfer fewer completed API bytes. Chat also now has presence, membership and richer message data; those features should not be described as a zero-cost speedup.

## Map initialization

First observed WebGL draw, not complete tile arrival or final map usability. Home has no WebGL initialization after the change, so its old decorative-map timing is not reported as an artificial zero-ms renderer improvement.

| Profile | Before ms | After ms | Reduction |
|---|---:|---:|---:|
${mapRows}

## Interaction and repeat visits

Field INP is **unavailable**. The after report records a trusted menu click to two animation frames and separate PerformanceEventTiming entries. Across these cold samples, maximum reported single-menu Event Timing is ${round(Math.max(...after.results.map(row => row.observedMenuEventTimingMs || 0)))} ms; this is a synthetic interaction observation, not INP.

Warm home results are recorded separately in \`performance-after-warm-home.json/.md\` with the actual Service Worker, IndexedDB and browser caches. They must not be substituted into this cold comparison. Worker Resource Timing supplements page transfer accounting; page CDP network shaping is not guaranteed to cover worker cache misses.

## Artifacts and reproduction

- \`performance-before.json/.md\`: honest recovered baseline summary.
- \`performance-after.json/.md\`: all 15 controlled cold samples, requests, long tasks, CPU counters and Event Timing entries.
- \`performance-after-warm-home.json/.md\`: three independent warm-home samples.
- \`chat-browser-verification.json\`: actual two-account SSE delivery, duplicate/replay, chat feature checks and store-processing/render timings.

Run \`PROFILE_LABEL=after PROFILE_SW=block PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs\`, then \`PROFILE_LABEL=after node scripts/profile-report.mjs\`. For warm home use \`PROFILE_LABEL=after-warm-home PROFILE_CACHE=warm PROFILE_SW=allow PROFILE_ROUTES=/ PROFILE_MAP_ROUTES=/map node scripts/profile-browser.mjs\` and the matching report label. Regenerate this comparison with \`node scripts/profile-compare.mjs\`.
`;
const target = 'artifacts/performance-comparison.md';
await writeFile(target + '.tmp', output);
await rename(target + '.tmp', target);
console.log(`Wrote ${target}`);
