/**
 * Voice provider abstraction (free-tier roadmap step A3 —
 * docs/free-tier-roadmap.md). Same shape as every other provider in
 * `src/providers/`: an interface, a mock that's honest about doing
 * nothing real, and a real implementation, resolved by one env var.
 */
export interface VoiceProvider {
  readonly id: string;

  /** Speech-to-text. Returns `text: null` when no real transcription is available — never a guess. */
  transcribeAudio(input: { audioBuffer: Buffer; mimeType: string }): Promise<{ text: string | null }>;

  /** Text-to-speech. Returns `null` when no real audio was generated — never fabricated silence pretending to be speech. */
  synthesizeSpeech(input: { text: string }): Promise<{ audioBuffer: Buffer; mimeType: string } | null>;
}
