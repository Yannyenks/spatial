"use client";

import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/cookies";

/** Minimal typed fetch wrapper for client components. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Reads the (intentionally non-httpOnly) CSRF cookie set alongside the session — see src/middleware.ts. */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const csrfToken = getCsrfToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? "UNKNOWN", body?.error?.message ?? "Something went wrong.", res.status);
  }
  return body as T;
}
