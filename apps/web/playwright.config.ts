import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.EGIN_WEB_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
