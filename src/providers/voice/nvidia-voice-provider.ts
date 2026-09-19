import type { VoiceProvider } from "./types";
import { logger } from "@/lib/logger";

// NVIDIA's speech models (Riva NIMs) aren't behind the single shared
// integrate.api.nvidia.com endpoint the chat/vision models use — each is
// deployed at its own NVCF invocation URL, only shown on that model's own
// build.nvidia.com page. `asrUrl`/`ttsUrl` are that base URL (e.g.
// `https://<function-id>.invocation.api.nvcf.nvidia.com`), configured via
// env vars since they can't be derived from a model name the way chat
// models can.
//
// Verified live against a real account before trusting any of this:
// - ASR (`nvidia/parakeet-tdt-0.6b`) requires `language=en-GB` — `en-US`
//   and plain `en` both 404 ("Model not found for language ...") on this
//   deployment, despite `en-US` being the natural guess.
// - TTS (`nvidia/magpie-tts-multilingual`) uses `language=en-US` (the
//   opposite of ASR) and a specific `voice` id from its own
//   /v1/audio/list_voices endpoint.
// - Round-tripped for real: synthesized "Welcome to the hotel lobby. The
//   pool is two rooms away." through TTS, fed the resulting WAV back into
//   ASR, got the identical text back.
const ASR_LANGUAGE = "en-GB";
const TTS_LANGUAGE = "en-US";
const DEFAULT_VOICE = "Magpie-Multilingual.EN-US.Aria.Neutral";

export class NvidiaVoiceProvider implements VoiceProvider {
  readonly id = "nvidia";

  constructor(
    private readonly apiKey: string,
    private readonly asrUrl: string,
    private readonly ttsUrl: string,
    private readonly voice: string = DEFAULT_VOICE
  ) {}

  async transcribeAudio(input: { audioBuffer: Buffer; mimeType: string }): Promise<{ text: string | null }> {
    try {
      const form = new FormData();
      form.append("language", ASR_LANGUAGE);
      form.append("file", new Blob([new Uint8Array(input.audioBuffer)], { type: input.mimeType }), "audio");

      const res = await fetch(`${this.asrUrl}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
      if (!res.ok) {
        logger.warn("nvidia_voice.transcribe_failed", { status: res.status, body: (await res.text()).slice(0, 300) });
        return { text: null };
      }
      const body = (await res.json()) as { text?: string };
      return { text: typeof body.text === "string" ? body.text.trim() : null };
    } catch (error) {
      logger.warn("nvidia_voice.transcribe_error", { error: error instanceof Error ? error.message : String(error) });
      return { text: null };
    }
  }

  async synthesizeSpeech(input: { text: string }): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
    try {
      const form = new FormData();
      form.append("language", TTS_LANGUAGE);
      form.append("text", input.text);
      form.append("voice", this.voice);

      const res = await fetch(`${this.ttsUrl}/v1/audio/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
      if (!res.ok) {
        logger.warn("nvidia_voice.synthesize_failed", { status: res.status, body: (await res.text()).slice(0, 300) });
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get("content-type") ?? "audio/wav";
      return { audioBuffer: buffer, mimeType };
    } catch (error) {
      logger.warn("nvidia_voice.synthesize_error", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}
