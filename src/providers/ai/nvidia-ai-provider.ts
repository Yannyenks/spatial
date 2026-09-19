import type { AgentTurn, Scene, Space, SpatialRelation } from "@/types";
import type { AIProvider, SpaceEdge } from "./types";
import { type Intent, parseIntentDeterministic, executeIntent } from "./concierge-intent";
import { logger } from "@/lib/logger";

// NVIDIA's hosted model catalog (build.nvidia.com / NIM) exposes an
// OpenAI-compatible chat-completions endpoint, with a free tier of API
// credits for evaluation — no GPU hosting decision of our own needed,
// same "BUY the inference, BUILD the tool layer" shape as Replicate's
// depth engine.
//
// The exact model id is verified against a live account, not assumed:
// `meta/llama-3.1-8b-instruct` (this file's original default) returned
// HTTP 410 Gone — deprecated 2026-08-26 — and several other
// commonly-cited catalog entries (mistral-7b-instruct-v0.3,
// gemma-3-12b-it, nvidia/nemotron-nano-3-30b-a3b,
// nvidia/llama-3.1-nemotron-70b-instruct) all 404 ("not found for
// account") despite appearing in GET /v1/models — not every listed
// model is actually enabled for a given free-tier account.
// `meta/llama-3.2-11b-vision-instruct` is the one confirmed live against
// a real key for both plain chat and multimodal (image) input, so it
// covers both roles here rather than juggling two separately-flaky
// model ids.
const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct";
const DEFAULT_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
// Kept small: one real vision call per sampled photo, and free-tier rate
// limits (~40 req/min) make "every photo in the space" the wrong default
// even before considering latency — this is a spot-check, not exhaustive
// coverage (the same tradeoff already made for Replicate's depth engine
// and video-quality's frame sampling).
const MAX_SCENE_VISION_SAMPLES = 2;

// A plain "respond with a JSON array" instruction was tried first against
// a real photo and rejected: the model returned Python-dict-style output
// with single quotes and objects instead of plain strings — not valid
// JSON. Giving it a concrete example of the exact shape fixed this
// (verified against the same real photo, output flipped to a clean
// `["Poor lighting","Visible clutter"]`), so the example stays in the
// prompt rather than being trimmed as "obvious."
const SCENE_VISION_SYSTEM_PROMPT = `You are reviewing a real photo captured for a hotel's spatial digital-twin listing. Note only genuine, concrete issues a guest would notice in THIS photo (poor lighting, a cut-off/incomplete view, visible clutter, motion blur). Respond with EXACTLY this format and nothing else: a JSON array of plain strings using double quotes, e.g. ["Poor lighting","Visible clutter"] — or [] if the photo looks fine. Do not wrap items in objects. Do not use single quotes. Output ONLY the JSON array, no other text. Never invent an issue you cannot actually see in the image.`;

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a hotel spatial-navigation assistant.
Given a guest's question, respond with ONLY a single JSON object (no markdown, no explanation) matching exactly one of these shapes:

{"tool": "navigate", "targetHint": "<short lowercase phrase naming the place they want, e.g. 'pool' or 'suite 204'>"}
{"tool": "search_by_relation", "predicate": "has", "target": "<short lowercase noun phrase for the amenity/feature, e.g. 'balcony'>"}
{"tool": "calculate_distance", "fromHint": "<short lowercase place name>", "toHint": "<short lowercase place name>"}
{"tool": "unknown"}

Use "unknown" whenever the question doesn't clearly ask to go somewhere, ask which rooms have a feature, or ask a distance between two named places. Never invent place names that weren't in the question — only extract hints from what the guest actually said.`;

interface NvidiaChatResponse {
  choices?: { message?: { content?: string } }[];
}

type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMessage = { role: string; content: string | ChatContentPart[] };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function isValidIntent(value: unknown): value is Intent {
  if (typeof value !== "object" || value === null || !("tool" in value)) return false;
  const v = value as Record<string, unknown>;
  switch (v.tool) {
    case "navigate":
      return typeof v.targetHint === "string";
    case "search_by_relation":
      return typeof v.predicate === "string" && typeof v.target === "string";
    case "calculate_distance":
      return typeof v.fromHint === "string" && typeof v.toHint === "string";
    case "unknown":
      return true;
    default:
      return false;
  }
}

/** Strips a ```json ... ``` fence if the model wrapped its answer in one, despite being asked not to. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Real LLM-backed AI provider (NVIDIA NIM / build.nvidia.com, OpenAI-
 * compatible API). Only `answerConciergeQuestion`'s intent-classification
 * step and `generateSpaceDescription` actually call the model —
 * `analyzeScene` stays deterministic (see comment below) rather than
 * pretending a text model performed vision analysis it was never given
 * images for.
 *
 * Every model call is wrapped so a failure (network error, rate limit —
 * expected on a free tier, malformed/non-JSON response) degrades to the
 * exact same deterministic behavior as `MockAIProvider` rather than
 * crashing the concierge or, worse, letting a bad response reach
 * `executeIntent` unvalidated (§65: never let the model invent a room).
 */
export class NvidiaAIProvider implements AIProvider {
  readonly id = "nvidia";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly visionModel: string = DEFAULT_VISION_MODEL
  ) {}

  private async chat(messages: ChatMessage[], maxTokens: number, model: string = this.model): Promise<string | null> {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        logger.warn("nvidia_ai.request_failed", { status: res.status, body: (await res.text()).slice(0, 300) });
        return null;
      }
      const body = (await res.json()) as NvidiaChatResponse;
      return body.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      logger.warn("nvidia_ai.request_error", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private async parseIntentViaLLM(question: string): Promise<Intent> {
    const content = await this.chat(
      [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      120
    );
    if (!content) return parseIntentDeterministic(question);

    try {
      const parsed: unknown = JSON.parse(extractJson(content));
      if (isValidIntent(parsed)) return parsed;
      logger.warn("nvidia_ai.invalid_intent_shape", { content: content.slice(0, 300) });
    } catch {
      logger.warn("nvidia_ai.unparseable_intent_json", { content: content.slice(0, 300) });
    }
    return parseIntentDeterministic(question);
  }

  /**
   * Asks a real vision-language model to look at one photo and report
   * concrete, visible issues — never a full scene description invented
   * from a filename or storage key (§33). `imageUrl` must be a real,
   * publicly resolvable URL (an R2 presigned URL in production); a
   * `localhost` URL from local dev storage isn't reachable and simply
   * fails closed via the try/catch below.
   *
   * Fetches and re-encodes the image as a base64 data URI before sending
   * it — passing the remote URL directly (as NVIDIA's own published curl
   * example does) returned a bare HTTP 500 from this model when verified
   * against a real account; a data URI works reliably. Not every
   * NIM-hosted vision model fetches remote URLs server-side the way
   * OpenAI's does, despite the identical request shape.
   */
  private async analyzeImageForIssues(imageUrl: string): Promise<string[]> {
    let dataUri: string;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`image fetch failed: ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      logger.warn("nvidia_ai.image_fetch_failed", { error: error instanceof Error ? error.message : String(error) });
      return [];
    }

    const content = await this.chat(
      [
        { role: "system", content: SCENE_VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Review this photo." },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      150,
      this.visionModel
    );
    if (!content) return [];
    try {
      const parsed: unknown = JSON.parse(extractJson(content));
      if (isStringArray(parsed)) return parsed.slice(0, 2);
      logger.warn("nvidia_ai.invalid_vision_shape", { content: content.slice(0, 300) });
    } catch {
      logger.warn("nvidia_ai.unparseable_vision_json", { content: content.slice(0, 300) });
    }
    return [];
  }

  async analyzeScene(input: { spaceId: string; frameUrls: string[]; sampleImageUrls?: string[] }): Promise<{
    warnings: string[];
  }> {
    const warnings: string[] = [];
    if (input.frameUrls.length < 8) {
      warnings.push("Low frame count may reduce scene understanding accuracy.");
    }

    // Real per-photo vision analysis on a small, real sample — every other
    // photo simply isn't looked at this pass (§33: honest about scope, not
    // exhaustive coverage dressed up as complete).
    const samples = (input.sampleImageUrls ?? []).slice(0, MAX_SCENE_VISION_SAMPLES);
    const perImageIssues = await Promise.all(samples.map((url) => this.analyzeImageForIssues(url)));
    const seen = new Set<string>();
    for (const issues of perImageIssues) {
      for (const issue of issues) {
        if (!seen.has(issue)) {
          seen.add(issue);
          warnings.push(issue);
        }
      }
    }

    return { warnings };
  }

  async generateSpaceDescription(input: { space: Space; scene: Scene | null }): Promise<string> {
    const objectCount = input.scene?.objects.length ?? 0;
    const kindLabel = input.space.kind.replace(/_/g, " ").toLowerCase();
    // The prompt only supplies real, already-known facts and asks for one
    // sentence of copy from them — the model can phrase it badly, but has
    // nothing to hallucinate a new fact from.
    const content = await this.chat(
      [
        {
          role: "system",
          content:
            "Write exactly one short, appealing marketing sentence for a hotel space listing, using ONLY the facts given. Do not invent amenities, features, or details not listed. Plain text, no markdown, no quotes.",
        },
        {
          role: "user",
          content: `Space name: ${input.space.name}\nType: ${kindLabel}\nIdentified elements in this space: ${objectCount}`,
        },
      ],
      80
    );
    if (!content) {
      return objectCount > 0
        ? `${input.space.name} — a ${kindLabel} with ${objectCount} identified elements.`
        : `${input.space.name} — a ${kindLabel}.`;
    }
    return content.trim();
  }

  async answerConciergeQuestion(input: {
    question: string;
    spaces: Space[];
    relations: SpatialRelation[];
    connections: SpaceEdge[];
  }): Promise<AgentTurn> {
    const intent = await this.parseIntentViaLLM(input.question);
    const actions = executeIntent(intent, input);
    return { question: input.question, actions };
  }
}
