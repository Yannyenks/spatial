import type { VoiceProvider } from "./types";

/**
 * MOCK voice provider (§33). No speech model exists here — both methods
 * return an honest "not available" (`text: null` / `null`) rather than a
 * fabricated transcript or fake silent audio dressed up as speech.
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly id = "mock";

  async transcribeAudio(): Promise<{ text: string | null }> {
    return { text: null };
  }

  async synthesizeSpeech(): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
    return null;
  }
}
