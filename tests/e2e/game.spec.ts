import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_PASSWORD } from "../../playwright.config";

const worldReady = (page: Page) => expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });

/** Phones open on the calm Today view; larger screens open in the world. */
async function login(page: Page, opens: "world" | "today" = "world") {
  await page.goto("/login");
  await page.getByLabel("Access password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Enter the world/ }).click();
  await page.waitForURL("/");
  if (opens === "world") await worldReady(page);
  else await expect(page.getByTestId("today-app")).toBeVisible({ timeout: 30_000 });
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
  await login(page, "today");
  const s = await state(page);

  // Today view: the wins ring matches the server, one next step, no horizontal scroll.
  const wonPillars = new Set(s.today.quests.filter((q: { status: string }) => q.status === "done").map((q: { pillar: string }) => q.pillar));
  await expect(page.getByTestId("today-wins")).toHaveAttribute("aria-label", `${wonPillars.size} of 4`);
  await expect(page.getByTestId("next-step")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Progress" }).click();
  await expect(page.getByText(`Level ${s.stats.overall.level}`)).toBeVisible();
  // The pixel world is one tap away.
  await page.getByRole("button", { name: "World" }).click();
  await worldReady(page);
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
  // Headless software WebGL can run at a frame or two per second, and Phaser
  // caps each frame's time step, so hold the key until the save lands.
  await page.waitForTimeout(1500);
  const s0 = await state(page);
  await page.keyboard.down("ArrowRight");
  let s1 = s0;
  for (let i = 0; i < 30 && (s1.player.position.x ?? 0) <= (s0.player.position.x ?? 0) + 10; i++) {
    await page.waitForTimeout(1000);
    s1 = await state(page);
  }
  await page.keyboard.up("ArrowRight");
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
  // Entering saves the position as the scene changes; walking inside saves it again.
  await page.keyboard.down("ArrowUp");
  let scene = "village";
  for (let i = 0; i < 30 && scene !== "home"; i++) {
    await page.waitForTimeout(1000);
    scene = (await state(page)).player.position.scene;
  }
  await page.keyboard.up("ArrowUp");
  expect(scene).toBe("home");
});

test("winning all four pillars grows the village, celebrates, and is recorded in the journey", async ({ page }) => {
  await login(page);
  // Stand in the village (the previous test ended inside the home).
  await page.request.post("/api/player/position", {
    headers: { origin: new URL(page.url()).origin },
    data: { scene: "village", x: 512, y: 300, facing: "down" },
  });
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  const canvas = page.getByTestId("game-canvas");
  const s0 = await state(page);
  const wonToday = new Set(s0.today.quests.filter((q: { status: string }) => q.status === "done").map((q: { pillar: string }) => q.pillar));
  expect(wonToday.size).toBeLessThan(4);
  await expect(canvas).toHaveAttribute("data-decorations", String(wonToday.size));
  await expect(canvas).toHaveAttribute("data-lanterns", "0");

  await page.keyboard.press("q");
  const board = page.getByRole("dialog", { name: "The Daily Four Wins" });
  for (const pillar of ["mental", "physical", "spiritual", "financial"]) {
    if (wonToday.has(pillar)) continue;
    const quest = s0.today.quests.find((q: { pillar: string; status: string; autoOnly: boolean }) => q.pillar === pillar && q.status === "open" && !q.autoOnly);
    await board.getByRole("button", { name: `Complete ${quest.title}`, exact: true }).click();
    await expect(board.getByRole("button", { name: `Undo ${quest.title}`, exact: true })).toBeVisible();
  }

  // The celebration only appears once the fourth pillar is won.
  await expect(page.getByTestId("celebration")).toContainText("FOUR WINS!");
  await expect(page.getByTestId("celebration")).toContainText("Day 1 complete");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-decorations", "4");
  await expect(canvas).toHaveAttribute("data-lanterns", "1");

  // Growth is stored, not cosmetic: it survives a reload.
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-lanterns", "1");
  const s1 = await state(page);
  expect(s1.campaign.progress).toMatchObject({ fourWinsDays: 1, tier: 1 });

  // The journey timeline records the day and its visual upgrades.
  await page.getByTestId("hud-campaign").click();
  const journey = page.getByRole("dialog", { name: "75-Day Journey" });
  await expect(journey.getByTestId("journey-day-number")).toHaveText("Day 1 of 75");
  await expect(journey.getByTestId("journey-fourwins")).toContainText("1 Four Wins day");
  await expect(journey.getByTestId("journey-day-1")).toHaveAccessibleName("Day 1, Four Wins");
  await expect(journey.getByTestId("journey-changes")).toContainText("Victory lantern #1 lit in the plaza");
  await expect(journey.getByTestId("journey-changes")).toContainText("You evolved into Initiate");
  await journey.getByRole("tab", { name: "Before & after" }).click();
  await expect(journey.getByTestId("before-after")).toBeVisible();
});

test("Four Wins AI: talk to the NPC, chat, approve a mission, manage memory, check location", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://localhost:3100" });
  await context.setGeolocation({ latitude: -12.463441, longitude: 130.845642, accuracy: 25 });
  await login(page);

  // Seed a past exchange in which the AI suggested a mission (as the server would store it).
  const db = postgres(process.env.E2E_DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/fourwins_e2e`, { max: 1 });
  const [player] = await db`select id from players limit 1`;
  const [msg] = await db`insert into ai_messages (player_id, role, content) values (${player.id}, 'assistant', 'Earlier: here is a mission idea.') returning id`;
  await db`insert into ai_proposals (player_id, message_id, kind, payload) values (${player.id}, ${msg.id}, 'mission', ${db.json({ pillar: "spiritual", title: "Ten minutes of quiet breathing", xp: 20, reason: "A calm reset." })})`;
  await db.end();

  // Walk up to the robot and press E.
  await page.request.post("/api/player/position", {
    headers: { origin: new URL(page.url()).origin },
    data: { scene: "village", x: 440, y: 270, facing: "up" },
  });
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("focus-prompt")).toContainText("Four Wins AI", { timeout: 10_000 });
  await page.keyboard.press("e");
  const panel = page.getByRole("dialog", { name: "Four Wins AI" });
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("ai-reply")).toContainText("Earlier: here is a mission idea.");

  // Sending a message: the request carries only the message (no location unless ticked).
  let sentBody: { message: string; location?: unknown } | null = null;
  await page.route("**/api/ai/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sentBody = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({
      json: {
        ok: true,
        messages: [
          { id: crypto.randomUUID(), role: "user", content: sentBody!.message, createdAt: new Date().toISOString() },
          { id: crypto.randomUUID(), role: "assistant", content: "MENTAL: finish your reading quest first.", createdAt: new Date().toISOString() },
        ],
        proposals: [],
        status: { configured: true, provider: "anthropic", model: "test", memoryEnabled: true, remainingToday: 149 },
      },
    });
  });
  await panel.getByRole("button", { name: "What should I focus on today?" }).click();
  await expect(panel.getByTestId("ai-thinking")).toBeVisible();
  await expect(panel.getByTestId("ai-reply").last()).toContainText("finish your reading quest first");
  expect(sentBody).toEqual({ message: "What should I focus on today?", location: null });

  // Approve the suggested mission — only then does it reach the quest board.
  const before = await state(page);
  expect(before.today.quests.some((q: { title: string }) => q.title === "Ten minutes of quiet breathing")).toBe(false);
  const card = panel.getByTestId("ai-mission-proposal");
  await expect(card).toContainText("Ten minutes of quiet breathing");
  await card.getByRole("button", { name: "Add to today" }).click();
  await expect(card).toContainText("Added to your quests");
  const after = await state(page);
  expect(after.today.quests.find((q: { title: string }) => q.title === "Ten minutes of quiet breathing")).toMatchObject({ status: "open", xp: 20 });

  // Memory: add, correct, survive a reload, delete.
  await panel.getByRole("tab", { name: /Memory/ }).click();
  await panel.getByLabel("What should Four Wins AI remember?").fill("I prefer morning workouts");
  await panel.getByRole("button", { name: "Save memory" }).click();
  await expect(panel.getByTestId("ai-memory-list")).toContainText("I prefer morning workouts");
  await panel.getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Edit memory").fill("I prefer workouts before 8am");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByTestId("ai-memory-list")).toContainText("before 8am");

  await page.unroute("**/api/ai/chat");
  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Four Wins AI", exact: true }).click();
  await panel.getByRole("tab", { name: /Memory/ }).click();
  await expect(panel.getByTestId("ai-memory-list")).toContainText("I prefer workouts before 8am");
  await expect(panel.getByTestId("ai-memory-list").getByText("approved from chat")).toHaveCount(0);

  // Location: off by default, explicit opt-in, shown to the player only.
  await panel.getByRole("tab", { name: "Location" }).click();
  await expect(panel.getByTestId("location-check")).toHaveCount(0);
  await panel.getByTestId("location-toggle").click();
  await panel.getByTestId("location-check").click();
  await expect(panel.getByTestId("location-result")).toContainText("-12.4634, 130.8456");
  const settings = (await state(page)).player.settings;
  expect(settings.locationAwareness).toBe(true);
  expect(JSON.stringify(settings)).not.toContain("130.84");
  await panel.getByTestId("location-toggle").click();
  await expect(panel.getByTestId("location-check")).toHaveCount(0);
});

test("one-page HUD: attributes, hotbar and a wellbeing check-in that persists", async ({ page }) => {
  await login(page);
  const s = await state(page);
  const bar = page.getByTestId("character-bar");
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: `Intelligence ${s.stats.missionsDone.mental}`, exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: `Strength ${s.stats.missionsDone.physical}`, exact: true })).toBeVisible();
  await expect(page.getByTestId("hotbar").getByRole("button", { name: /Backpack/ })).toBeVisible();

  // The AI chat opens as a window beside the player and starts with today's brief.
  await page.getByRole("button", { name: "Four Wins AI", exact: true }).click();
  const chat = page.getByRole("dialog", { name: "Four Wins AI" });
  await expect(chat.getByTestId("ai-brief")).toContainText(`Day ${s.campaign.dayNumber} of your 75-day journey`);
  await chat.getByRole("button", { name: "Close", exact: true }).click();

  const card = page.getByTestId("wellbeing");
  await expect(card.getByTestId("wellbeing-sleepMinutes")).toHaveText("—");
  await card.getByRole("button", { name: /Check in/ }).click();
  await card.getByLabel("🌙 Sleep (hours)").fill("7.5");
  await card.getByRole("radiogroup", { name: "⚡ Energy" }).getByRole("radio", { name: "4" }).click();
  await card.getByRole("radiogroup", { name: "🙂 Mood" }).getByRole("radio", { name: "🙂" }).click();
  await card.getByRole("button", { name: "Save check-in" }).click();
  await expect(card.getByTestId("wellbeing-sleepMinutes")).toHaveText("7.5h");
  await expect(card.getByTestId("wellbeing-energy")).toHaveText("4/5");
  await expect(card.getByTestId("wellbeing-mood")).toHaveText("4/5");

  await page.reload();
  await expect(page.locator(`[data-testid="game-canvas"][data-ready="true"] canvas`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("wellbeing").getByTestId("wellbeing-sleepMinutes")).toHaveText("7.5h");
  const after = await state(page);
  expect(after.stats.overall.totalXp).toBe(s.stats.overall.totalXp);
});

test("logout ends the session on the server", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login$/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});
