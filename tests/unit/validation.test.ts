import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/services/auth.service";

describe("registerSchema", () => {
  it("accepts an empty name — the register form always sends '' when the field is left blank", () => {
    // Regression test: found live via a Playwright smoke test of the
    // actual register page, which submits name: "" (React state default),
    // not an omitted key. A `.min(1)` on an optional string rejects that
    // and blocks every signup where the visitor skips their name.
    expect(() =>
      registerSchema.parse({
        name: "",
        email: "user@example.com",
        password: "password123",
        organizationName: "Acme",
      })
    ).not.toThrow();
  });

  it("still accepts a real name", () => {
    const result = registerSchema.parse({
      name: "Jordan Lee",
      email: "user@example.com",
      password: "password123",
      organizationName: "Acme",
    });
    expect(result.name).toBe("Jordan Lee");
  });

  it("still rejects an invalid email", () => {
    expect(() =>
      registerSchema.parse({ email: "not-an-email", password: "password123", organizationName: "Acme" })
    ).toThrow();
  });
});

describe("registerUser", () => {
  it("stores an empty/whitespace name as null, not as an empty string", async () => {
    const user = await registerUser(`emptyname-${Date.now()}@example.com`, "password123", "");
    expect(user.name).toBeNull();
  });
});
