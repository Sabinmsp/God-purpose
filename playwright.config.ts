import { defineConfig, devices } from "@playwright/test";

const user = process.env.USER ?? "postgres";
export const E2E_PASSWORD = "e2e correct horse battery staple";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // Fresh database → production build → production server.
    command: `npx tsx tests/e2e/prepare-db.mts && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 400_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? `postgres://${user}@localhost:5432/fourwins_e2e`,
      AUTH_SECRET: "e2e-only-auth-secret-0123456789abcdef",
      FW_PASSWORD: E2E_PASSWORD,
    },
  },
});
