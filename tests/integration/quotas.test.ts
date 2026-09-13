import { describe, expect, it } from "vitest";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { QuotaExceededError } from "@/lib/quotas";

describe("plan quotas (§30)", () => {
  it("blocks creating a second project on the STARTER plan (limit: 1)", async () => {
    const email = `quota-${Date.now()}@example.com`;
    const user = await registerUser(email, "password123");
    const org = await createOrganizationForUser(user.id, "Solo Hotelier"); // defaults to STARTER

    await createProject(user.id, org.id, "Hotel One", "HOTEL");
    await expect(createProject(user.id, org.id, "Hotel Two", "HOTEL")).rejects.toBeInstanceOf(QuotaExceededError);
  });
});
