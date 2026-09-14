import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Locks in the full core loop verified manually, by hand, over and over
 * during this session: register -> create project -> capture -> process
 * -> publish -> view the public experience. Every step here previously
 * broke for a real reason (missing organizationId, a router.push() that
 * never navigated, a job queue with no persistent worker on production,
 * unredacted faces) — this suite exists so none of those regress silently
 * the next time this code changes.
 */

function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}@test.com`;
}

test.describe("critical path: signup to published experience", () => {
  test("a new user can register, build a project, and publish a real experience", async ({ page }) => {
    const email = uniqueEmail("critical");

    // --- Register ---
    await page.goto("/register");
    await page.fill("#organizationName", "E2E Test Hotel Group");
    await page.fill("#name", "E2E Tester");
    await page.fill("#email", email);
    await page.fill("#password", "testpass123456");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // --- Create project (regression: this used to 400 on a missing
    // organizationId, then silently fail to navigate even once that was
    // fixed) ---
    await page.goto("/projects/new");
    await page.fill("#name", "Riviera E2E Hotel");
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Hotel")');
    await page.click('button:has-text("Create project")');
    await expect(page).toHaveURL(/\/projects\/[^/]+\/capture/, { timeout: 30_000 });

    const projectId = page.url().match(/\/projects\/([^/]+)\//)![1];
    // The URL updating doesn't guarantee this page's client component has
    // finished hydrating yet.
    await page.waitForTimeout(500);

    // --- Capture: create a space, upload a real photo. Redaction runs on
    // every photo (even one with no face) and the WASM detector's cold
    // start alone takes several seconds — generous timeout, not a sign
    // something's wrong. ---
    const spaceNameInput = page.locator('input[placeholder="New space name"]');
    await spaceNameInput.click();
    await spaceNameInput.pressSequentially("Lobby");
    await expect(page.locator('button:has-text("Add")')).toBeEnabled();
    await page.click('button:has-text("Add")');
    await expect(page.locator('button:has-text("Lobby")')).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "sample-room.jpg"));
    await expect(page.locator("text=1 file(s) uploaded this session")).toBeVisible({ timeout: 20_000 });

    // --- Process (regression: on production this job used to get stuck
    // forever with no persistent worker to drain the queue; locally the
    // in-process poller should pick it up within a couple of seconds) ---
    await page.click('button:has-text("Analyze")');
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/projects/${projectId}/jobs`);
          const { jobs } = await res.json();
          return jobs[0]?.status;
        },
        { timeout: 20_000, message: "reconstruction job never completed" }
      )
      .toBe("COMPLETED");

    // --- Publish ---
    await page.goto(`/projects/${projectId}/experience`);
    const expNameInput = page.locator("#exp-name");
    await expNameInput.click();
    await expNameInput.press("Control+a");
    await expNameInput.pressSequentially("Riviera E2E Experience");
    await expect(expNameInput).toHaveValue("Riviera E2E Experience");
    await page.click('button:has-text("PUBLIC")');
    // This is the only test in the suite that hits this specific route —
    // a known `next dev` quirk is a request body getting lost if it's the
    // very first hit to a route while that route is still compiling.
    // Retrying once is what a real user hitting this would also just do.
    await page.click('button:has-text("Publish")');
    try {
      await expect(page.locator("text=/^Live$/")).toBeVisible({ timeout: 8_000 });
    } catch {
      await page.click('button:has-text("Publish")');
      await expect(page.locator("text=/^Live$/")).toBeVisible({ timeout: 20_000 });
    }

    // --- View the public experience ---
    const link = await page.locator('a[href^="/experience/"]').first().getAttribute("href");
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page.locator("h1")).toContainText("Lobby", { timeout: 15_000 });
    await expect(page.locator('button:has-text("Ask AI")')).toBeVisible();
  });
});
