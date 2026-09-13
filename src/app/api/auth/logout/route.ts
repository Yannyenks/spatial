import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return await toApiError(error);
  }
}
