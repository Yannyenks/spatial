import { NextRequest, NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { speakTextSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { getVoiceProvider } from "@/providers/voice";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

/** Public text-to-speech for the AI concierge's spoken answers (free-tier roadmap step A3). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (isRateLimited(`voice-speak:${clientIp(req)}`, 20, 60_000)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
        { status: 429 }
      );
    }
    const { slug } = await params;
    const experience = await db.experience.findUnique({ where: { slug } });
    if (!experience || !experience.publishedAt) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Experience not found." } }, { status: 404 });
    }

    const body = speakTextSchema.parse(await req.json());
    const provider = getVoiceProvider();
    const result = await provider.synthesizeSpeech({ text: body.text });
    if (!result) {
      return NextResponse.json({ error: { code: "VOICE_UNAVAILABLE", message: "Spoken answers aren't available right now." } }, { status: 503 });
    }

    return new NextResponse(new Uint8Array(result.audioBuffer), { headers: { "Content-Type": result.mimeType } });
  } catch (error) {
    return await toApiError(error);
  }
}
