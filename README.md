# Four Wins: The Life RPG

**Level up in real life.** A private pixel-art RPG where real habits, workouts, reflection and savings level up your character across four pillars: 🧠 Mental, 💪 Physical, 🧘 Spiritual and 💰 Financial.

Nothing is earned by opening the game. XP, levels, unlocks and vault balances come only from records you log, and they are computed and stored on the server.

## What's in the game

- **Pixel village** (Phaser 3) with four districts — Mind Temple, Strength Arena, Spirit Sanctuary, Wealth Kingdom — plus your home. Walk with WASD/arrows (Shift runs) or the touch joystick; press **E**/Space or tap **A** to interact; **Q** opens quests.
- **Your character, Sabin** — a layered procedural sprite with idle, walk, run, exercise, read, meditate, work, sleep, celebrate and level-up animations. Outfits, headwear, auras and companions unlock by pillar level; body build changes **only** from recorded measurements.
- **Daily Four Wins board** — generated each Darwin morning; complete, undo, skip (no penalty), move to tomorrow, add from your library, create custom quests, rest days that never break streaks.
- **Real records → automatic quest wins** — logging a workout, a personal record, a measurement, an expense, a vault deposit, gratitude notes, a reflection or a learning note completes the matching quest once per day.
- **Wealth Kingdom** — Tuition Vault (A$13,000, coin pile fills) and Car Vault (A$10,000, car builds at 10/25/50/75/100%), deposits, withdrawals, reconcile-to-bank-balance, income/expense/transfer tracking.
- **Strength Arena** — workout journal with sets, PR detection, weigh-ins, weight trend, physique tier.
- **Village HUD** — your portrait and one tracked quest sit over the map. Open **Log a win** for the daily board or **Journal** for pillar stats, wellbeing, inventory, reminders and the Today view.
- **The east road** starts outside your home. Follow the red banners across the brook to Coach Rafa and log a real workout to raise the arena pennant for the Darwin day. Learning notes fill the Mind Temple bookshelf, a daily reflection lights a sanctuary lantern, and savings milestones build the car in the garage.
- **Reminders that come to you** — phone notifications at about 7:30am, 12:30pm and 7:30pm (Darwin), each naming one small step with a **Done** button, so a win takes one tap from the lock screen and the game never has to be opened. See [Reminders](#reminders).
- **Goals & calendar**, **trophy room**, **home that upgrades** with furniture as you level, **day/night on Australia/Darwin time**, **welcome-back screen** showing what changed since your last visit, and **The Guide**, which answers five questions using only your stored records (no AI subscription needed).

## Run it locally

Requires Node 22+ and Postgres 14+ (Postgres.app, Homebrew or Docker).

```bash
npm install
createdb fourwins_dev
cp .env.example .env.local        # set DATABASE_URL and AUTH_SECRET
npm run setup                     # migrates, creates the player, asks for the access password (hidden)
npm run dev                       # http://localhost:3000
```

`npm run setup` creates the first player and prints their username, made from their name ("Sabin" logs in as `sabin`). Everyone else creates their own account from **New here? Create an account** on the login page.

`npm run setup` stores only a scrypt hash of the password. It is never written to `.env`, Git, logs or the browser. Re-run it any time to change the password (other sessions are signed out). `npm run setup -- --pin` also sets a 4–8 digit unlock PIN.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run setup` | Migrate + create player + set password (`--pin` for a PIN) |
| `npm run db:migrate` | Apply pending SQL migrations in `db/migrations` |
| `npm test` | Unit + integration tests (Vitest, real Postgres `fourwins_test`) |
| `npm run test:e2e` | Playwright end-to-end tests against a production build (`fourwins_e2e`) |
| `npm run typecheck` / `lint` | TypeScript and ESLint |

Tests create and reset their own databases: `createdb fourwins_test` once; the e2e run creates `fourwins_e2e` itself.

## Architecture

```
src/
  app/                 Next.js App Router: game page, login page, /api route handlers
  proxy.ts             Optimistic cookie gate for pages (real auth is in every API call)
  lib/shared/          Pure rules shared by server and client: XP curve, unlocks, money, Darwin time, schemas, reminder wording
  lib/server/          Server-only: Postgres client, auth (scrypt, sessions, rate limits), route guard
    services/          Game logic: quests, progress/achievements, money, body, journal, goals, state, guide, reminders
    push/              Web Push: VAPID keys derived from AUTH_SECRET, sender, signed action tokens
    assets/pixellab.ts Asset-generation adapter (PixelLab integration point)
  game/                Phaser: procedural pixel art, scenes (village, home), player/NPCs, effects, day/night
  components/          React HUD, panels, touch controls, welcome-back, PIN lock
public/sw.js           Service worker: shows reminders and runs their Done / Another / Undo buttons
vercel.json            Cron schedule for the three daily reminder slots
db/migrations/         SQL schema (Postgres / Supabase)
tests/                 unit · integration (real DB) · e2e (Playwright)
```

**State flow:** the browser loads `/api/state`; every action POSTs one small change (with an idempotency key for money and workouts). The server runs it in a transaction, locks the player row, re-evaluates achievements and unlocks, and returns the fresh state plus the real events that happened. Toasts and in-world effects are driven only by those server events.

## Progression rules

- Four independent XP ledgers (append-only, `xp_transactions`). XP to next level = `100 × level^1.25`, rounded to 5. At ~150 XP/day a pillar reaches level 5 in about 9 days, level 10 in about 7 weeks, and level 30 in well over a year.
- Overall level uses the same curve on the **average** pillar XP, so a balanced life levels evenly.
- Anti-farming: each daily quest can be won once per day; XP values come from the server (a fixed allowed set); quest XP is capped at **300 per pillar per day**; at most 15 active quests per pillar; double taps and simultaneous devices are serialized.
- Money: integer cents in AUD. Savings live in their own ledger, separate from income/expenses. Transfers are never income or spending. Withdrawals can't exceed a vault's balance. Re-submitted forms never double count. Financial XP rewards actions (logging, saving, reviewing), never amounts. Milestone bonuses (10/25/50/75/100%) are granted once, so withdrawing keeps earned XP and trophies.

## Security model

- Server-side password check (scrypt, constant-time compare); the raw password never reaches code, env vars, `NEXT_PUBLIC_*`, localStorage or Git.
- Sessions: random 256-bit token, only its SHA-256 stored; `HttpOnly`, `SameSite=Strict`, `Secure` + `__Host-` prefix in production; 30-day absolute and 7-day idle expiry; logout revokes server-side.
- Accounts: each player signs in with their own username and password, and every record (quests, XP, money, journal, AI chat and memories) belongs to one player; the server only ever reads and writes the signed-in player's rows. New accounts start their own 75-day campaign on the day they join. Sign-ups are open by default; set `SIGNUPS=closed` to stop them or `SIGNUP_CODE` to require an invite code. Settings → **Delete my account** removes the player and everything they own after the password is typed again. There is no email, so a forgotten password is reset by the owner with `npm run setup -- --user <username>`.
- Login rate limits stored in Postgres (hold across all serverless instances): 5 failures per IP per 15 min, 10 failures per account per hour (from anywhere), and a 300-per-hour ceiling across the whole server. Unknown usernames and wrong passwords get the same answer and take the same time. Sign-ups: 3 per IP per hour, 30 per hour in total.
- Optional two-factor login (Settings → Security): scan a QR code with any authenticator app (TOTP, RFC 6238). With it on, the password alone never opens a session. Codes are checked on the server, each code works once (replays are refused), wrong codes are rate-limited like passwords, and turning it on signs out other devices. The secret is AES-256-GCM encrypted with a key derived from `AUTH_SECRET`. The 10 one-time recovery codes are stored only as SHA-256 hashes. Lost your phone and your recovery codes? Run `npm run setup -- --reset-2fa` against the database.
- Optional PIN: with a PIN set, sessions idle for 12 h lock and require the PIN; 5 wrong PINs revoke the session.
- Reminder buttons: a notification's Done/Undo buttons call `/api/push/act` with no session, because reminders must work after a login has expired. The authorisation is a signed token inside the (encrypted) push message: HMAC-SHA256 with a key derived from `AUTH_SECRET`, bound to one player and one of today's quests, valid 36 hours. It can complete or undo that single quest and nothing else. Subscription endpoints are accepted only for known push services, so the server cannot be pointed at arbitrary URLs.
- CSRF: mutating requests require a same-origin `Origin` header and a JSON body, plus SameSite=Strict cookies.
- Every API route validates the session and scopes every query by player. Bodies are validated with Zod, and the server never trusts client-sent XP or balances.
- Database: Row-Level Security is enabled on every table with no policies, and the Supabase `anon`/`authenticated` roles are revoked, so the public PostgREST API can read nothing. The app connects server-side only.
- Security headers: CSP, `frame-ancestors 'none'`, nosniff, HSTS in production, `no-store` on APIs.

> ⚠️ **A short numeric password (such as a 4-digit PIN) is weak.** Rate limiting slows guessing, but 10,000 combinations is still small for a public URL that holds financial records. Before deploying real data, run `npm run setup` with a long passphrase and `npm run setup -- --pin` to keep your short code as the quick-unlock PIN.

## Deploy: Vercel + Supabase

Vercel hosts the app; Supabase Postgres stores all progress, so it survives every deploy and works on every device.

```bash
npm i -g vercel@latest
vercel login
vercel link                                   # create/link the Vercel project

# Option A — provision Supabase through the Vercel Marketplace (sets POSTGRES_URL etc. automatically)
vercel integration add supabase --yes
# Option B — existing Supabase project: Project Settings → Database → Connection string → "Transaction pooler" (port 6543)
vercel env add DATABASE_URL production        # paste the pooled connection string

vercel env add AUTH_SECRET production         # 32+ random chars: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Create tables + player + password in Supabase (run locally; uses the direct/non-pooled URL if available)
vercel env pull .env.production.local --environment=production --yes
npx tsx --env-file=.env.production.local scripts/setup.ts      # hidden password prompt; add -- --pin for a PIN
rm .env.production.local
# (If the variables are marked Sensitive and can't be pulled, run instead:
#  DATABASE_URL='postgres://…supabase connection string…' npx tsx scripts/setup.ts)

vercel deploy --prod
```

On every production deploy, `vercel-build` applies any pending SQL migrations before `next build`, so schema changes ship with the code. Preview deploys never migrate.

Then open the production URL, log in, complete a quest, close the browser, and log in on your phone. Your character, quests, balances and unlocks will be there.

## Reminders

A game you have to remember to open cannot help on the days you forget it exists, so the game reaches out instead.

**Turn them on (once per device):** open the game on your phone and tap **Turn on reminders** on the Today screen (or Settings → Reminders), then allow notifications. A sample arrives immediately. On Android, Chrome's menu → **Add to Home screen** also gives you an app icon. On iPhone/iPad, add the game to the Home Screen first (Share → Add to Home Screen); iOS only delivers web notifications to installed apps.

**What arrives**

| Slot (Darwin) | When it speaks | What it says |
| --- | --- | --- |
| ~7:30am | wins still open | Campaign day and your first step, "just start with 5 minutes" |
| ~12:30pm | wins still open | `0/4 so far, and still time`, or your count and the next step |
| ~7:30pm | wins still open | `🔥 3-day streak ends tonight` when a streak is at risk, otherwise one small win before bed |

- Every notification names **one** quest and has two buttons: **✅ Done** completes it (same rules as the in-game button: today only, once, daily XP caps) and **🔁 Another** swaps to a different open quest. After Done, the notification updates to your new count with the next step and an **↩ Undo**.
- **Silent when it should be:** nothing after all four wins, nothing on a declared rest day, nothing at night.
- **Coming back after a gap:** after 3+ days without a win the tone changes to "fresh start", there is nothing to catch up on, and the lowest-effort quest is offered first.
- **Frequency:** Settings → Reminders → *3 a day*, *1 a day* (evening) or *Paused*.
- Quests that only complete from a real log (a personal record, three gratitude notes) are never offered with a Done button.

**How it works**

- `vercel.json` schedules three [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) that call `/api/cron/nudge/{morning,midday,evening}`. Each job runs once a day, which fits the free plan; that plan may fire up to an hour late. Cron jobs only run on the **production** deployment.
- The route decides the slot from the Darwin clock and records `(player, day, slot)` in the `nudges` table before sending, so repeated or overlapping calls never double-send. It also creates the day's board, which otherwise only exists once the game is opened.
- Delivery is standard [Web Push](https://developer.mozilla.org/docs/Web/API/Push_API) (`web-push`), encrypted end to end to the browser. The server's VAPID key pair is derived from `AUTH_SECRET`, so there are **no extra keys to configure**.
- `public/sw.js` shows the notification and runs its buttons. It caches nothing.

**Optional hardening:** set `CRON_SECRET` in Vercel (any long random string). Vercel then sends it with every cron call and the route refuses everything else. Without it the route still works; because it takes no input and sends at most one nudge per slot, the most a stranger can do by calling it is make that slot's nudge arrive at the start of its window.

## Four Wins AI companion

A hovering robot stands by your front path. Walk up and press **E**, click/tap it, or use the 🤖 button to chat.

- **Real model, server-side:** `POST /api/ai/chat` authenticates you, validates the message, rate-limits (20 per 10 min, 150 per day), loads your real game state and approved memories, and calls Claude through the official Anthropic SDK (`claude-opus-5-5` by default, with the server-side refusal fallback enabled). Configure with `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT` (see `.env.example`). Without a key the companion says it is sleeping; nothing else is affected.
- **Or a free open-source model:** set `AI_PROVIDER` to `groq`, `openrouter`, `ollama` or `openai-compatible` and the chat goes through `src/lib/server/ai/openai-compatible.ts` instead (any endpoint that speaks the OpenAI chat-completions format). Set `AI_API_KEY` for the hosted ones and `AI_MODEL` to choose the model. The same rules apply: the reply is read as JSON, malformed suggestions are dropped, and nothing changes without your approval. Ollama runs on your own computer, so it only works when the game is running there too, not on Vercel.
- **Backup AI:** set `AI_FALLBACK` (for example `openrouter`) with `AI_FALLBACK_API_KEY` and the chat automatically asks the backup whenever the main AI is busy, down, slow or misconfigured. Free tiers count limits per account, so this roughly doubles how many messages you get for free. Refusals are never retried elsewhere.
- **Grounded answers:** every message carries a `<game_data>` block built from your records — campaign day, done/open missions, levels, XP, streaks, Four Wins progress, savings and recent achievements — and the model is told to treat it as data and never invent progress.
- **Approval before anything changes:** the model can only *propose* missions and memories (structured output). Proposals are sanitised on the server (allowed XP values, no duplicates, limits) and stored as pending cards. Nothing touches quests, XP or money until you press **Add to today** / **Add as daily quest** / **Save memory**, and approved missions go through the same validation as quests you create.
- **Memory you control:** add, correct, delete, delete all, or switch memory off. Only memories you typed or approved are stored; the AI's guesses never are. Chat and memories are in your data export, and **Clear conversation** deletes the chat.
- **Location (optional, off by default):** turning on *location awareness* reveals a one-off **Check my location** button (browser permission, no tracking). Coordinates stay in the browser tab; the AI receives an approximate position (±1 km) only on messages where you tick the box, and it is never stored.
- **Maps later:** `src/lib/location/places.ts` defines the `PlacesProvider` interface for nearby gyms, libraries, universities and workplaces (MapLibre or a restricted Google Maps key behind a server route).

## Art

The village's natural ground and plants (grass, dirt roads, water, trees, bushes, rocks, bamboo) come from the
[Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by Pixel-boy and AAA (CC0), kept in
`public/assets/ninja-adventure` and loaded by `src/game/art/pack.ts`. The same pack brings the village to life
(`src/game/packSprites.ts`): a cat and a dog you can pet (the dog tags along for a while), hens and a frog that scatter,
fish and ripples in the pond, emote bubbles, and the **daily chest** in the plaza, which opens only on a day you win all
four pillars. None of it awards XP: progress still comes only from real wins. Everything else (the pillar buildings and their
growth stages, the home, plaza, interiors, characters and effects) is original procedural art, which also stands in for
the pack if its files are missing, so the game is complete without external assets.

### PixelLab art (optional)

The character can also use PixelLab sprites. `src/lib/server/assets/pixellab.ts` holds the server-only adapter and the character spec (Sabin, 32 px, 4 directions, all animations). With a working PixelLab key (`PIXELLAB_API_KEY`, server-only) you can generate matching sprite sheets and swap them in for the procedural ones.

## Data export

Settings → **Export backup** downloads a JSON file of every record: quests, XP ledger, workouts, measurements, journal, money and goals. Credentials and sessions are never included.
