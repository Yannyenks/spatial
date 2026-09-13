/**
 * Structured JSON logging (execution-plan §56-57: "structured logs",
 * "each request must have a requestId"). Deliberately dependency-free
 * (no Prisma, no next/headers) so it can be imported from anywhere,
 * including `src/jobs/*` which also runs in the standalone worker
 * process — see docs/ai-pipeline.md.
 *
 * This is intentionally a thin JSON-lines writer, not a full observability
 * stack (no shipping, no sampling, no dashboard) — see the "Observability
 * dashboard" gap noted in the feature audit. It exists so every log line
 * is machine-parseable and carries the same shape, which is the
 * prerequisite for a real dashboard later without re-instrumenting.
 */
type LogFields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
