import type { VoiceProvider } from "./types";
import { MockVoiceProvider } from "./mock-voice-provider";
import { NvidiaVoiceProvider } from "./nvidia-voice-provider";

export type { VoiceProvider } from "./types";

let cached: VoiceProvider | null = null;

/**
 * Resolves the configured voice provider — "mock" (default, honest no-op)
 * or "nvidia" (real ASR/TTS via NVIDIA's hosted Riva NIMs, free tier — see
 * nvidia-voice-provider.ts, free-tier roadmap step A3). No other file in
 * the app needs to change to swap providers (§12, §32).
 */
export function getVoiceProvider(): VoiceProvider {
  if (cached) return cached;
  const kind = process.env.VOICE_PROVIDER ?? "mock";
  switch (kind) {
    case "nvidia": {
      const apiKey = process.env.NVIDIA_API_KEY;
      const asrUrl = process.env.NVIDIA_ASR_URL;
      const ttsUrl = process.env.NVIDIA_TTS_URL;
      if (!apiKey || !asrUrl || !ttsUrl) {
        throw new Error("NVIDIA_API_KEY, NVIDIA_ASR_URL and NVIDIA_TTS_URL must all be set. Copy .env.example to .env and set real values.");
      }
      cached = new NvidiaVoiceProvider(apiKey, asrUrl, ttsUrl, process.env.NVIDIA_TTS_VOICE);
      return cached;
    }
    case "mock":
    default:
      cached = new MockVoiceProvider();
      return cached;
  }
}
