import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const testDbPath = path.resolve(__dirname, "test.db");

export default function globalSetup() {
  if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
    stdio: "inherit",
  });
}
