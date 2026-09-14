import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { E2E_DB_PATH } from "./db-path";

// Runs as the first step of the webServer.command chain in
// playwright.config.ts, not as Playwright's separate globalSetup hook —
// empirically, globalSetup and webServer startup are not strictly
// sequential here (observed: the webServer's own Prisma client was
// already polling an empty, schema-less e2e.db while globalSetup kept
// failing to delete/recreate that same file, a race neither side could
// win). Chaining this into the exact same shell command that then
// launches the server guarantees the database exists, with the schema
// pushed, before the process that will actually use it starts.
const root = path.resolve(__dirname, "../..");
const storageDir = path.join(root, "storage");

if (fs.existsSync(E2E_DB_PATH)) fs.rmSync(E2E_DB_PATH);
if (fs.existsSync(storageDir)) fs.rmSync(storageDir, { recursive: true, force: true });

execSync("npx prisma db push --skip-generate --accept-data-loss", {
  cwd: root,
  env: { ...process.env, DATABASE_URL: `file:${E2E_DB_PATH}` },
  stdio: "inherit",
});
