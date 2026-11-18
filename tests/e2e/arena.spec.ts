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
      await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
      const wins = page.getByTestId("today-wins");
      const xp = page.getByTestId("today-xp");
      await expect(wins).toHaveAttribute("aria-label", "0 of 4");
      const read = page.getByRole("checkbox", { name: "Read for 20 minutes", exact: true });
      await read.click();
      await expect(wins).toHaveAttribute("aria-label", "1 of 4");
      await expect(xp).toHaveText("+20 today");
      await expect(page.getByRole("progressbar", { name: "Overall XP" })).toHaveAttribute("aria-valuenow", "5");
      await page.getByRole("checkbox", { name: "Undo Read for 20 minutes", exact: true }).click();
      await expect(wins).toHaveAttribute("aria-label", "0 of 4");
      await expect(xp).toHaveText("+0 today");

      await page.getByRole("button", { name: "Write a reflection for Evening reflection" }).click();
      const reflect = page.getByRole("dialog", { name: "Write a reflection" });
      await reflect.getByRole("textbox", { name: "Reflection", exact: true }).fill("Made time to step outside.");
      await reflect.getByRole("button", { name: "Save reflection" }).click();
      await expect(wins).toHaveAttribute("aria-label", "1 of 4");
      await expect(xp).toHaveText("+30 today");
      await page.getByRole("checkbox", { name: "Undo Evening reflection", exact: true }).click();
      await expect(wins).toHaveAttribute("aria-label", "0 of 4");
      await page.getByRole("button", { name: "Manage habits" }).click();
      const manager = page.getByRole("dialog", { name: "Manage habits" });
      await manager.getByRole("button", { name: "New habit" }).click();
      await expect(manager.getByText("Repeats on")).toBeVisible();
      await manager.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Progress", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Habit history" })).toBeVisible();
      const history = page.waitForResponse((response) => response.url().includes("/api/progress/history?month=") && response.ok());
      await page.getByRole("button", { name: "Previous month" }).click();
      await history;
      await page.getByRole("button", { name: "Village", exact: true }).click();
      await expect(page.locator('[data-testid="game-canvas"][data-ready="true"] canvas')).toBeVisible({ timeout: 30_000 });
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
      await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Village", exact: true }).click();
      await expect(page.locator('[data-testid="game-canvas"][data-ready="true"] canvas')).toBeVisible({ timeout: 30_000 });
      await prompt.click();
      await expect(trainer).toContainText("That pennant is yours today");
      const result = await page.request.get("/api/state");
      expect((await result.json()).state.body.workoutsTotal).toBe(1);
      await page.getByRole("button", { name: "Today", exact: true }).click();
      await expect(wins).toHaveAttribute("aria-label", "1 of 4");
      await read.click();
      await page.getByRole("checkbox", { name: "Evening reflection", exact: true }).click();
      await page.getByRole("button", { name: "Log an expense for Record today's expenses" }).click();
      const expense = page.getByRole("dialog", { name: "Log an expense" });
      await expense.getByRole("textbox", { name: "Amount" }).fill("4.50");
      await expense.getByRole("textbox", { name: "Category" }).fill("Groceries");
      await expense.getByRole("button", { name: "Record expense" }).click();
      await expect(wins).toHaveAttribute("aria-label", "4 of 4");
      await expect(page.getByRole("status").filter({ hasText: "Village chest unlocked" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
