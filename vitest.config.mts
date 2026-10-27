import path from "node:path";
import { defineConfig } from "vitest/config";

const user = process.env.USER ?? "postgres";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server bundles; tests run server code directly.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://${user}@localhost:5432/fourwins_test`,
      AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
    },
  },
});
