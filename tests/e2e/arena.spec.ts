import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "../../playwright.config";

// Exercise Phaser's 2D canvas renderer for these frame-dependent walks.
test.use({ launchOptions: { args: ["--disable-webgl"] } });

for (const mobile of [false, true]) {
  test(`home to Rafa, a saved workout and the return visit on ${mobile ? "mobile" : "desktop"}`, async ({ browser, baseURL }) => {
    // The full walk and two world loads take longer with software rendering.
    test.setTimeout(150_000);
    const context = await browser.newContext({
      baseURL,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
      const created = await page.request.post("/api/auth/signup", {
        headers: { origin: baseURL! },
        data: { displayName: "Walker", username: mobile ? "mobile_walker" : "desktop_walker", password: E2E_PASSWORD },
      });
      expect(created.ok()).toBe(true);
      await page.goto("/");
      await expect(page.locator('[data-testid="game-canvas"][data-ready="true"] canvas')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("welcome").getByRole("button").click();
      await expect(page.getByText("Meet Coach Rafa")).toBeVisible();
      const prompt = page.getByTestId("focus-prompt");
      const trainer = page.getByRole("dialog", { name: "Coach Rafa" });
      if (mobile) {
        const knob = (await page.getByTestId("joystick").boundingBox())!;
        const y = knob.y + knob.height / 2;
        await page.mouse.move(knob.x + knob.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(knob.x + knob.width - 2, y, { steps: 3 });
      } else {
        await page.getByTestId("game-canvas").focus();
        await page.keyboard.down("ArrowRight");
      }
      try {
        await expect(prompt).toContainText("Coach Rafa", { timeout: 35000 });
      } finally {
        if (mobile) await page.mouse.up();
        else await page.keyboard.up("ArrowRight");
      }
      await prompt.click();
      await trainer.getByRole("button", { name: "Log a workout" }).click();
      await page.getByLabel("Session", { exact: true }).fill("Evening walk");
      await page.getByLabel("Duration (minutes)").fill("25");
      await page.getByRole("button", { name: "Log workout", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Strength Arena" })).toBeHidden();
      await expect(page.getByText("Meet Coach Rafa")).toBeHidden();
      await prompt.click();
      await expect(trainer).toContainText("25 minutes of Evening walk");
      await page.reload();
      await expect(page.locator('[data-testid="game-canvas"][data-ready="true"] canvas')).toBeVisible({ timeout: 30_000 });
      await prompt.click();
      await expect(trainer).toContainText("That pennant is yours today");
      const result = await page.request.get("/api/state");
      expect((await result.json()).state.body.workoutsTotal).toBe(1);
    } finally {
      await context.close();
    }
  });
}
