import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_PATH } from "./tests/e2e/db-path";

const PORT = 3100; // deliberately not 3000, so an E2E run never fights a dev server someone left running

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shares one SQLite file and one storage/ dir — see tests/e2e/prepare-db.ts
  workers: 1,
  retries: 0,
  // Generous: this runs against `next dev`, which compiles each route on
  // its first hit. critical-path.spec.ts alone visits 8+ distinct routes
  // that have never been hit before in a fresh server — the *cumulative*
  // first-compile cost across a whole test can exceed what looks like a
  // reasonable per-test budget, even though no single step is slow once
  // that route is actually compiled.
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Preparing the database is chained into this same command, not
    // Playwright's separate globalSetup hook — see prepare-db.ts for why.
    command: `npx tsx tests/e2e/prepare-db.ts && npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: `file:${E2E_DB_PATH}`,
      STORAGE_PROVIDER: "local",
      RECONSTRUCTION_PROVIDER: "mock",
      AI_PROVIDER: "mock",
      VIDEO_PROVIDER: "mock",
      SESSION_SECRET: "e2e-test-secret-not-for-production",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    },
  },
});
