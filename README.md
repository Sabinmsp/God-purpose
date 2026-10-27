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
  lib/shared/          Pure rules shared by server and client: XP curve, unlocks, money, Darwin time, schemas
  lib/server/          Server-only: Postgres client, auth (scrypt, sessions, rate limits), route guard
    services/          Game logic: quests, progress/achievements, money, body, journal, goals, state, guide
    assets/pixellab.ts Asset-generation adapter (PixelLab integration point)
  game/                Phaser: procedural pixel art, scenes (village, home), player/NPCs, effects, day/night
  components/          React HUD, panels, touch controls, welcome-back, PIN lock
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
- Login rate limits stored in Postgres (hold across all serverless instances): 5 failures per IP per 15 min, 20 failures across all IPs per hour.
- Optional PIN: with a PIN set, sessions idle for 12 h lock and require the PIN; 5 wrong PINs revoke the session.
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

Then open the production URL, log in, complete a quest, close the browser, and log in on your phone. Your character, quests, balances and unlocks will be there.

## PixelLab art (optional)

All art is original and procedural, so the game is complete without external assets. `src/lib/server/assets/pixellab.ts` holds the server-only adapter and the character spec (Sabin, 32 px, 4 directions, all animations). With a working PixelLab key (`PIXELLAB_API_KEY`, server-only) you can generate matching sprite sheets and swap them in for the procedural ones.

## Data export

Settings → **Export backup** downloads a JSON file of every record: quests, XP ledger, workouts, measurements, journal, money and goals. Credentials and sessions are never included.
