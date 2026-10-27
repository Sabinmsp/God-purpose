import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "../../playwright.config";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Access password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Enter the world/ }).click();
  await page.waitForURL("/");
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  const welcome = page.getByTestId("welcome");
  if (await welcome.isVisible().catch(() => false)) await welcome.getByRole("button").click();
  await expect(page.getByTestId("welcome")).toBeHidden();
}

async function state(page: Page) {
  const res = await page.request.get("/api/state");
  expect(res.status()).toBe(200);
  return (await res.json()).state;
}

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors only see the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Access password").fill("1234");
  await page.getByRole("button", { name: /Enter the world/ }).click();
  await expect(page.locator("#login-error")).toContainText(/isn't right/);
  await expect(page).toHaveURL(/\/login$/);
});

test("protected APIs refuse requests without a session or from another origin", async ({ request, baseURL }) => {
  expect((await request.get("/api/state")).status()).toBe(401);
  expect((await request.get("/api/export")).status()).toBe(401);
  const noOrigin = await request.post("/api/quests/complete", { data: { dailyQuestId: "00000000-0000-4000-8000-000000000000" } });
  expect(noOrigin.status()).toBe(403);
  const sameOrigin = await request.post("/api/quests/complete", {
    data: { dailyQuestId: "00000000-0000-4000-8000-000000000000" },
    headers: { origin: baseURL! },
  });
  expect(sameOrigin.status()).toBe(401);
  // The login page never contains the password or its hash.
  const html = await (await request.get("/login")).text();
  expect(html).not.toMatch(/scrypt\$|correct horse/);
});

test("first visit: welcome screen, real progress, and persistence", async ({ page, baseURL }) => {
  await page.goto("/login");
  await page.getByLabel("Access password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Enter the world/ }).click();
  await page.waitForURL("/");

  // Session cookie is HttpOnly + SameSite=Strict and invisible to scripts.
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.includes("fw_session"))!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain("fw_session");

  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible({ timeout: 30_000 });
  await expect(welcome).toContainText("Welcome, Sabin!");
  await expect(welcome).toContainText("Nothing is earned just by logging in");
  await welcome.getByRole("button").click();

  await expect(page.getByTestId("hud-name")).toHaveText("Sabin");
  await expect(page.getByTestId("hud-level")).toContainText("LV 1");
  const before = await state(page);
  expect(before.stats.overall.totalXp).toBe(0);
  expect(before.savings.totalBalanceCents).toBe(0);

  // Complete a real quest from the board.
  await page.keyboard.press("q");
  const board = page.getByRole("dialog", { name: "The Daily Four Wins" });
  await expect(board).toBeVisible();
  await board.getByRole("button", { name: "Complete Read for 20 minutes" }).click();
  await expect(page.getByTestId("toast-xp").first()).toContainText("+20 Mental XP");
  await expect(board.getByRole("button", { name: "Undo Read for 20 minutes" })).toBeVisible();
  // Repeated clicking can't farm XP: the second press is an undo, then a single re-award.
  await board.getByRole("button", { name: "Undo Read for 20 minutes" }).click();
  await board.getByRole("button", { name: "Complete Read for 20 minutes" }).click();
  await expect(board.getByRole("button", { name: "Undo Read for 20 minutes" })).toBeVisible();
  expect((await state(page)).stats.pillars.mental.xp).toBe(20);
  await page.keyboard.press("Escape");

  // Save toward tuition in the Wealth Kingdom.
  await page.getByRole("button", { name: /Financial level/ }).click();
  const wealth = page.getByRole("dialog", { name: "Wealth Kingdom" });
  const tuition = wealth.getByTestId("vault-tuition");
  await tuition.getByRole("button", { name: "+ Deposit" }).click();
  await tuition.getByLabel("Amount saved").fill("1,300");
  await tuition.getByRole("button", { name: "Add to vault" }).click();
  await expect(wealth.getByTestId("vault-tuition-balance")).toHaveText("A$1,300.00");
  await expect(tuition).toContainText("10%");

  // Withdrawals can never exceed the vault, and are allowed below it.
  await tuition.getByRole("button", { name: "− Withdraw" }).click();
  await tuition.getByLabel("Amount withdrawn").fill("5000");
  await tuition.getByRole("button", { name: "Withdraw" }).last().click();
  await expect(page.getByTestId("toast-error")).toContainText("can't withdraw more");
  await expect(wealth.getByTestId("vault-tuition-balance")).toHaveText("A$1,300.00");
  await page.keyboard.press("Escape");

  const after = await state(page);
  expect(after.stats.pillars.financial.xp).toBeGreaterThanOrEqual(30); // savings quest + 10% milestone
  expect(after.achievements.map((a: { key: string }) => a.key)).toEqual(expect.arrayContaining(["first_quest", "first_deposit", "tuition_10"]));

  // Refresh: everything is still there.
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("welcome")).toBeHidden();
  const reloaded = await state(page);
  expect(reloaded.stats.pillars.mental.xp).toBe(20);
  expect(reloaded.savings.goals.find((g: { key: string }) => g.key === "tuition").balanceCents).toBe(130000);

  // Tampered requests from the logged-in browser are rejected by the server.
  const tamper = await page.request.post("/api/savings/move", {
    headers: { origin: baseURL! },
    data: { requestId: crypto.randomUUID(), goalId: reloaded.savings.goals[0].id, direction: "deposit", amountCents: -999999 },
  });
  expect(tamper.status()).toBe(400);
  const balanceInjection = await page.request.post("/api/savings/move", {
    headers: { origin: baseURL! },
    data: { requestId: crypto.randomUUID(), goalId: reloaded.savings.goals[0].id, direction: "deposit", amountCents: 1, balanceCents: 1300000 },
  });
  expect(balanceInjection.status()).toBe(200);
  const final = await state(page);
  expect(final.savings.goals.find((g: { key: string }) => g.key === "tuition").balanceCents).toBe(130001);
});

test("another device sees the same character, goals, balances and unlocks", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await login(page);
  const s = await state(page);
  expect(s.stats.pillars.mental.xp).toBe(20);
  expect(s.savings.goals.find((g: { key: string }) => g.key === "tuition").balanceCents).toBe(130001);
  expect(s.today.quests.find((q: { title: string }) => q.title === "Read for 20 minutes").status).toBe("done");
  expect(s.goals.find((g: { linkedSource: string }) => g.linkedSource === "savings:tuition").currentValue).toBeCloseTo(1300.01);

  // Mobile layout: touch joystick + action button, no horizontal scroll.
  await expect(page.getByTestId("joystick")).toBeVisible();
  await expect(page.getByTestId("action-button")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Drag the joystick left: the character walks and the new position is saved.
  const startX = s.player.position.x ?? 512;
  const box = (await page.getByTestId("joystick").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy, { steps: 4 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(5000);
  const moved = await state(page);
  expect(moved.player.position.x).toBeLessThan(startX - 20);
  await phone.close();
});

test("keyboard movement, interaction and the home scene", async ({ page }) => {
  await login(page);
  // Headless software WebGL renders the first frames slowly; let the world settle.
  await page.waitForTimeout(1500);
  const s0 = await state(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2000);
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(5000);
  const s1 = await state(page);
  expect(s1.player.position.x).toBeGreaterThan((s0.player.position.x ?? 0) + 10);
  expect(s1.player.position.facing).toBe("right");

  // Walk back up to the front door and go inside.
  await page.request.post("/api/player/position", {
    headers: { origin: new URL(page.url()).origin },
    data: { scene: "village", x: 512, y: 240, facing: "up" },
  });
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("focus-prompt")).toContainText("Your Home", { timeout: 10_000 });
  await page.keyboard.press("e");
  await expect(page.getByTestId("focus-prompt")).not.toContainText("Your Home", { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(5000);
  expect((await state(page)).player.position.scene).toBe("home");
});

test("logout ends the session on the server", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login$/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});
