/**
 * Standalone worker process entrypoint (§3, §31): run with `npm run worker`
 * to process AI jobs outside the Next.js web server process, which is how
 * this should run in production.
 */
import { startJobRunner } from "@/jobs/runner";

startJobRunner();
console.log("Worker process running. Press Ctrl+C to stop.");

// Keep the process alive.
setInterval(() => {}, 1 << 30);
