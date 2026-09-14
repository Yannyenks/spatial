import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Regression test for a real bug found by hand: restoring an older
 * reconstruction version succeeded server-side (the database really did
 * update) but router.refresh() never re-rendered the page, leaving the
 * "Current" badge stuck on the old version until a manual reload. Fixed
 * with a hard reload; this locks it in.
 */
test("restoring a reconstruction version updates the UI without a manual reload", async ({ page }) => {
  const email = `e2e-restore-${Date.now()}@test.com`;

  await page.goto("/register");
  await page.fill("#organizationName", "E2E Restore Org");
  await page.fill("#name", "E2E Restore Tester");
  await page.fill("#email", email);
  await page.fill("#password", "testpass123456");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto("/projects/new");
  await page.fill("#name", "Restore E2E Hotel");
  await page.click('button:has-text("Continue")');
  await page.click('button:has-text("Hotel")');
  await page.click('button:has-text("Create project")');
  await expect(page).toHaveURL(/\/projects\/[^/]+\/capture/, { timeout: 30_000 });
  const projectId = page.url().match(/\/projects\/([^/]+)\//)![1];
  // The URL updating doesn't guarantee this page's client component has
  // finished hydrating yet — same class of issue as the command palette's
  // listener attaching a beat after its hint text is visible.
  await page.waitForTimeout(500);

  const spaceNameInput = page.locator('input[placeholder="New space name"]');
  await spaceNameInput.click();
  await spaceNameInput.pressSequentially("Lobby");
  await expect(page.locator('button:has-text("Add")')).toBeEnabled();
  await page.click('button:has-text("Add")');
  await expect(page.locator('button:has-text("Lobby")')).toBeVisible({ timeout: 15_000 });

  // Two distinct files, not the same one twice — a file input doesn't
  // reliably re-fire a change event when set to the file it already has.
  const fixtures = [
    path.join(__dirname, "fixtures", "sample-room.jpg"),
    path.join(__dirname, "fixtures", "sample-room-2.jpg"),
  ];

  // Two upload+process cycles, producing two reconstruction versions.
  for (let i = 0; i < 2; i++) {
    await page.locator('input[type="file"]').setInputFiles(fixtures[i]!);
    await expect(page.locator(`text=${i + 1} file(s) uploaded this session`)).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Analyze")');
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/projects/${projectId}/jobs`);
          const { jobs } = await res.json();
          return jobs.filter((j: { status: string }) => j.status === "COMPLETED").length;
        },
        { timeout: 20_000 }
      )
      .toBe(i + 1);
  }

  await page.goto(`/projects/${projectId}/reconstruction`);
  const currentBefore = await page.locator("li:has-text('Current')").textContent();
  expect(currentBefore).toContain("Version 2");

  // This route has never been hit before in this run — retrying once
  // guards against `next dev`'s first-hit compile race, same as publish
  // in critical-path.spec.ts. No manual reload here otherwise — that's
  // exactly what used to silently fail.
  await page.click('button:has-text("Restore")');
  try {
    await expect(page.locator("li:has-text('Current')")).toContainText("Version 1", { timeout: 8_000 });
  } catch {
    await page.click('button:has-text("Restore")');
    await expect(page.locator("li:has-text('Current')")).toContainText("Version 1", { timeout: 15_000 });
  }
});
