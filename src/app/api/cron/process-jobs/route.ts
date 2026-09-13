import { NextRequest, NextResponse } from "next/server";
import { claimNextQueuedJob } from "@/jobs/queue";
import { runPipelineJob } from "@/jobs/pipeline";

// Vercel is serverless — there is no long-lived process for
// src/instrumentation.ts's setInterval poller to run in the way it does
// under `next dev` or the standalone `npm run worker` process. Without
// this route, a queued AIJob on production only ever advances as an
// accidental side effect of a request happening to hit a cold-started
// function, and then sits stuck forever once that function is frozen
// (verified live: a job froze at 71% permanently). A scheduled caller
// (see .github/workflows/process-jobs-cron.yml) hits this route instead,
// draining the queue in short serverless-friendly bursts.
const MAX_JOBS_PER_RUN = 25;
const TIME_BUDGET_MS = 8000; // stay safely under Vercel's Hobby-plan 10s function timeout

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing cron secret." } }, { status: 401 });
  }

  const start = Date.now();
  let processed = 0;
  while (processed < MAX_JOBS_PER_RUN && Date.now() - start < TIME_BUDGET_MS) {
    const job = await claimNextQueuedJob();
    if (!job) break;
    await runPipelineJob(job);
    processed++;
  }

  return NextResponse.json({ processed, elapsedMs: Date.now() - start });
}
