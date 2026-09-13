import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createSession } from "@/lib/auth";
import { setCurrentOrganizationId } from "@/lib/current-org";
import { toApiError } from "@/lib/api-errors";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    if (isRateLimited(`register:${clientIp(req)}`, 5, 60_000)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a moment and try again." } },
        { status: 429 }
      );
    }
    const body = registerSchema.parse(await req.json());
    const user = await registerUser(body.email, body.password, body.name);
    const organization = await createOrganizationForUser(user.id, body.organizationName);
    await createSession(user.id);
    await setCurrentOrganizationId(organization.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, organization });
  } catch (error) {
    return await toApiError(error);
  }
}
