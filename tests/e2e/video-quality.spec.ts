import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Locks in real video capture-quality analysis (video-quality.service.ts):
 * a deliberately blurred synthetic walkthrough clip should surface the
 * same kind of advisory warning photos get, computed from real sampled
 * frames — not silently accepted like before this feature existed.
 */

function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}@test.com`;
}

test.describe("video capture-quality warning", () => {
  test("uploading a blurry walkthrough video surfaces a real quality warning", async ({ page }) => {
    const email = uniqueEmail("video-quality");

    await page.goto("/register");
    await page.fill("#organizationName", "E2E Video Quality Hotel");
    await page.fill("#name", "E2E Tester");
    await page.fill("#email", email);
    await page.fill("#password", "testpass123456");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto("/projects/new");
    await page.fill("#name", "Video Quality E2E Hotel");
    await page.click('button:has-text("Continue")');
    await page.click('button:has-text("Hotel")');
    await page.click('button:has-text("Create project")');
    await expect(page).toHaveURL(/\/projects\/[^/]+\/capture/, { timeout: 30_000 });
    await page.waitForTimeout(500);

    const spaceNameInput = page.locator('input[placeholder="New space name"]');
    await spaceNameInput.click();
    await spaceNameInput.pressSequentially("Lobby");
    await expect(page.locator('button:has-text("Add")')).toBeEnabled();
    await page.click('button:has-text("Add")');
    await expect(page.locator('button:has-text("Lobby")')).toBeVisible({ timeout: 15_000 });

    // ffmpeg frame extraction + blur analysis on top of the WASM detector's
    // own cold start — generous timeout, matching the photo upload case.
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "sample-walkthrough-blurry.mp4"));
    await expect(page.locator("text=1 file(s) uploaded this session")).toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator("text=This video looks shaky, blurry, or poorly lit in several sampled frames")
    ).toBeVisible();
    await expect(page.locator("text=Faces in videos are not auto-redacted yet")).toBeVisible();
  });
});
