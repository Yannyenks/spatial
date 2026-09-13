import { claimNextQueuedJob } from "@/jobs/queue";
import { runPipelineJob } from "@/jobs/pipeline";

const POLL_INTERVAL_MS = 1500;
let started = false;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const job = await claimNextQueuedJob();
    if (job) {
      await runPipelineJob(job);
    }
  } catch (error) {
    console.error("[worker] tick failed", error);
  } finally {
    ticking = false;
  }
}

/**
 * Starts the polling loop that turns QUEUED AIJob rows into completed (or
 * failed) ones (§3). Safe to call multiple times — only the first call in
 * a process actually starts an interval.
 *
 * In dev, this is started once from `instrumentation.ts` so `npm run dev`
 * is enough to see the whole pipeline run end-to-end. In production, run
 * it as its own process via `npm run worker` instead (see docs/deployment.md)
 * so AI workloads never share a process with the web server.
 */
export function startJobRunner(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  console.log("[worker] job runner started (polling every %dms)", POLL_INTERVAL_MS);
}
