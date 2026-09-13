/**
 * Next.js instrumentation hook (runs once when the server process starts).
 * Used here purely as a dev convenience so a single `npm run dev` process
 * both serves HTTP and processes the AI job queue. For production,
 * disable this by setting DISABLE_INPROCESS_WORKER=1 and run
 * `npm run worker` as its own long-lived process instead (§3, §31).
 *
 * NOTE: this file lives under src/ (not the project root) because the
 * project uses a src/ directory — Next.js only auto-loads
 * instrumentation.ts from whichever of the two is the configured source
 * root.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.DISABLE_INPROCESS_WORKER) {
    const { startJobRunner } = await import("@/jobs/runner");
    startJobRunner();
  }
}
