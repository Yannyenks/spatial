import { test, expect } from "@playwright/test";

/**
 * Confirms the command palette's plain client-side navigation (no await
 * before router.push()) keeps working — the audit that found the
 * restore-version and project-creation bugs also checked this one live
 * and found it fine, precisely because it's called synchronously from
 * the click handler rather than after an awaited mutation. Locking that
 * in so a future refactor doesn't accidentally make it async.
 */
test("command palette navigates to the selected page", async ({ page }) => {
  const email = `e2e-cmdk-${Date.now()}@test.com`;

  await page.goto("/register");
  await page.fill("#organizationName", "E2E Cmdk Org");
  await page.fill("#name", "E2E Cmdk Tester");
  await page.fill("#email", email);
  await page.fill("#password", "testpass123456");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  // The hard navigation above is a full page reload — wait for the new
  // page to actually hydrate (its keydown listener attaches in a client
  // component effect) before sending a shortcut, or it can be missed.
  await expect(page.locator('text="Command palette"')).toBeVisible({ timeout: 10_000 });
  // A visible static hint doesn't guarantee the sidebar's own effect hook
  // (where the document keydown listener actually attaches) has run yet.
  await page.waitForTimeout(500);

  await page.keyboard.press("Control+k");
  await expect(page.locator("[cmdk-input]")).toBeVisible({ timeout: 5_000 });
  await page.fill("[cmdk-input]", "Projects");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
});
