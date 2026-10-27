/**
 * One-time (and repeatable) setup:
 *   npm run setup            → migrate, create the player if needed, set the access password
 *   npm run setup -- --pin   → also set a 4–8 digit unlock PIN
 *
 * The password is read from a hidden prompt (or FW_PASSWORD / FW_PIN for
 * non-interactive use) and only its scrypt hash is stored in the database.
 * The raw password is never written to disk, logs, env files or Git.
 */
import { createInterface } from "node:readline";
import postgres from "postgres";
import { runMigrations } from "../db/migrate";
import { hashSecret, isWeakPassword } from "../src/lib/server/auth/password";
import { seedPlayer } from "../src/lib/server/services/seed";
import { localDate } from "../src/lib/shared/time";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    out._writeToOutput = (s: string) => {
      if (!prompted) {
        process.stdout.write(s);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readSecret(envName: string, label: string, validate: (v: string) => string | null): Promise<string> {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    const err = validate(fromEnv);
    if (err) throw new Error(`${envName}: ${err}`);
    return fromEnv;
  }
  if (!process.stdin.isTTY) throw new Error(`Set ${envName} when running non-interactively.`);
  for (;;) {
    const first = await promptHidden(`${label}: `);
    const err = validate(first);
    if (err) {
      console.log(`  ✗ ${err}`);
      continue;
    }
    const again = await promptHidden(`Repeat ${label.toLowerCase()}: `);
    if (again === first) return first;
    console.log("  ✗ They didn't match. Try again.");
  }
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, { prepare: false, max: 1, ssl: local ? false : "require", onnotice: () => {} });

  try {
    console.log("\nFour Wins — setup\n");
    await runMigrations(sql);

    type PlayerRow = { id: string; display_name: string };
    let [player]: (PlayerRow | undefined)[] = await sql<PlayerRow[]>`select id, display_name from players order by created_at limit 1`;
    if (!player) {
      const name = process.env.FW_PLAYER_NAME || "Sabin";
      player = await sql.begin(async (tx) => {
        const [created] = await tx<PlayerRow[]>`insert into players (display_name) values (${name}) returning id, display_name`;
        await seedPlayer(tx, created.id, localDate());
        return created;
      });
      console.log(`  ✓ created player “${player.display_name}” with default quests, goals and vaults`);
    } else {
      console.log(`  ✓ player “${player.display_name}” already exists — progress untouched`);
    }

    const password = await readSecret("FW_PASSWORD", "Access password", (v) =>
      v.length < 4 ? "Use at least 4 characters." : v.length > 256 ? "Too long." : null,
    );
    const weak = isWeakPassword(password);
    const hash = await hashSecret(password);
    await sql`
      insert into auth_credentials (player_id, password_hash, password_weak) values (${player.id}, ${hash}, ${weak})
      on conflict (player_id) do update set password_hash = excluded.password_hash,
        password_weak = excluded.password_weak, updated_at = now()
    `;
    // A password change signs out every existing session.
    await sql`update sessions set revoked_at = now() where player_id = ${player.id} and revoked_at is null`;
    console.log("  ✓ access password set (stored as a scrypt hash)");
    if (weak) {
      console.log(
        "\n  ⚠  This password is short or numeric-only. Login is rate-limited, but before you\n" +
          "     store real financial records on a public URL, re-run setup with a long passphrase\n" +
          "     and use `npm run setup -- --pin` to keep a short PIN for quick unlocks.\n",
      );
    }

    if (process.argv.includes("--pin")) {
      const pin = await readSecret("FW_PIN", "Unlock PIN (4–8 digits)", (v) => (/^\d{4,8}$/.test(v) ? null : "Use 4 to 8 digits."));
      await sql`update auth_credentials set pin_hash = ${await hashSecret(pin)} where player_id = ${player.id}`;
      console.log("  ✓ unlock PIN set");
    }
    console.log("\nDone. Start the game with `npm run dev`.\n");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
