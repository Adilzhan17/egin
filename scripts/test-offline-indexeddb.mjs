// Real Chromium IndexedDB: concurrent queue changes must be serialized.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync(new URL("../apps/web/lib/offline.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto((process.env.EGIN_WEB_URL || "http://localhost:3000") + "/login");
  const result = await page.evaluate(async source => {
    const offline = {};
    new Function("exports", source)(offline);
    offline.setOfflineAccount("qa-atomic-A");
    await Promise.all(Array.from({ length: 20 }, (_, id) =>
      offline.updateOffline("pending-notes", old => [...(old || []), { id }]),
    ));
    // Acknowledgement and a newly queued note racing must retain the new note.
    await Promise.all([
      offline.updateOffline("pending-notes", old => old.filter(note => note.id !== 0)),
      offline.updateOffline("pending-notes", old => [...old, { id: 20 }]),
    ]);
    const notes = await offline.readOffline("pending-notes");
    const oldRead = offline.readOffline("pending-notes");
    offline.setOfflineAccount("qa-atomic-B");
    const lateOldAccountValue = await oldRead;
    const newAccountValue = await offline.readOffline("pending-notes");
    await offline.clearOffline();
    return { ids: notes.map(note => note.id), lateOldAccountValue, newAccountValue };
  }, code);
  assert.deepEqual(result.ids, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(result.lateOldAccountValue, null);
  assert.equal(result.newAccountValue, null);
  console.log("PASS: Chromium IndexedDB atomic note queue and account isolation (real storage, isolated browser context)");
} finally {
  await browser.close();
}
