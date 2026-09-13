import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { verifyCredentials } from "@/services/auth.service";
import { createSession } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(`login:${clientIp(req)}`, 10, 60_000)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a moment and try again." } },
        { status: 429 }
      );
    }
    const body = loginSchema.parse(await req.json());
    const user = await verifyCredentials(body.email, body.password);
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    return await toApiError(error);
  }
}
