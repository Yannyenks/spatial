import { afterEach, describe, expect, it, vi } from "vitest";
import { NvidiaVoiceProvider } from "@/providers/voice/nvidia-voice-provider";

const ASR_URL = "https://asr-function.invocation.api.nvcf.nvidia.com";
const TTS_URL = "https://tts-function.invocation.api.nvcf.nvidia.com";

describe("NvidiaVoiceProvider.transcribeAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = new NvidiaVoiceProvider("fake-key", ASR_URL, TTS_URL);

  it("returns the real transcribed text and posts to the ASR-specific invocation URL with language=en-GB", async () => {
    let capturedUrl = "";
    let capturedForm: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedForm = init.body as FormData;
        return new Response(JSON.stringify({ text: "Where is the pool?" }), { status: 200 });
      })
    );

    const result = await provider.transcribeAudio({ audioBuffer: Buffer.from("fake-audio-bytes"), mimeType: "audio/webm" });

    expect(result.text).toBe("Where is the pool?");
    expect(capturedUrl).toBe(`${ASR_URL}/v1/audio/transcriptions`);
    // Verified live against a real account: en-US and plain "en" both
    // 404 on this ASR deployment — only en-GB works.
    expect(capturedForm!.get("language")).toBe("en-GB");
  });

  it("returns text: null (never throws) when the API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Model not found for language en-US", { status: 404 })));
    const result = await provider.transcribeAudio({ audioBuffer: Buffer.from("x"), mimeType: "audio/webm" });
    expect(result.text).toBeNull();
  });

  it("returns text: null (never throws) on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const result = await provider.transcribeAudio({ audioBuffer: Buffer.from("x"), mimeType: "audio/webm" });
    expect(result.text).toBeNull();
  });
});

describe("NvidiaVoiceProvider.synthesizeSpeech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = new NvidiaVoiceProvider("fake-key", ASR_URL, TTS_URL, "Magpie-Multilingual.EN-US.Aria.Neutral");

  it("returns the real audio bytes and posts to the TTS-specific invocation URL with language=en-US and the configured voice", async () => {
    let capturedUrl = "";
    let capturedForm: FormData | null = null;
    const fakeAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF" (WAV header)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedForm = init.body as FormData;
        return new Response(fakeAudio, { status: 200, headers: { "content-type": "audio/wav" } });
      })
    );

    const result = await provider.synthesizeSpeech({ text: "Here is the pool." });

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("audio/wav");
    expect(Array.from(result!.audioBuffer)).toEqual(Array.from(fakeAudio));
    expect(capturedUrl).toBe(`${TTS_URL}/v1/audio/synthesize`);
    expect(capturedForm!.get("language")).toBe("en-US");
    expect(capturedForm!.get("voice")).toBe("Magpie-Multilingual.EN-US.Aria.Neutral");
    expect(capturedForm!.get("text")).toBe("Here is the pool.");
  });

  it("returns null (never throws) when the API call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    const result = await provider.synthesizeSpeech({ text: "Hello" });
    expect(result).toBeNull();
  });

  it("returns null (never throws) on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const result = await provider.synthesizeSpeech({ text: "Hello" });
    expect(result).toBeNull();
  });
});
