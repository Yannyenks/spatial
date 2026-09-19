import { NextRequest, NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { getVoiceProvider } from "@/providers/voice";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

/** Public speech-to-text for the AI concierge's mic input (free-tier roadmap step A3). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (isRateLimited(`voice-transcribe:${clientIp(req)}`, 20, 60_000)) {
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

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Missing audio recording." } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = getVoiceProvider();
    const { text } = await provider.transcribeAudio({ audioBuffer: buffer, mimeType: file.type || "audio/webm" });

    return NextResponse.json({ text });
  } catch (error) {
    return await toApiError(error);
  }
}
