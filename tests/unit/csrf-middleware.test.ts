import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER } from "@/lib/cookies";

function request(opts: {
  method: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  const req = new NextRequest("http://localhost:3000/api/projects", {
    method: opts.method,
    headers: opts.headers,
  });
  for (const [name, value] of Object.entries(opts.cookies ?? {})) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("CSRF middleware (execution-plan §60)", () => {
  it("allows GET requests unconditionally", () => {
    const res = middleware(request({ method: "GET", cookies: { [SESSION_COOKIE]: "x" } }));
    expect(res.status).toBe(200);
  });

  it("allows mutating requests with no session cookie (e.g. register/login)", () => {
    const res = middleware(request({ method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("blocks a mutating request with a session but no CSRF header (forged request)", () => {
    const res = middleware(request({ method: "POST", cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "abc" } }));
    expect(res.status).toBe(403);
  });

  it("blocks a mutating request where the CSRF header doesn't match the cookie", () => {
    const res = middleware(
      request({
        method: "POST",
        cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "abc" },
        headers: { [CSRF_HEADER]: "wrong" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("allows a mutating request where the CSRF header matches the cookie", () => {
    const res = middleware(
      request({
        method: "POST",
        cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "abc" },
        headers: { [CSRF_HEADER]: "abc" },
      })
    );
    expect(res.status).toBe(200);
  });
});
