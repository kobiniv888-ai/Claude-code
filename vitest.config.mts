import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    // Our own environment setting (src/lib/site-env.ts): the unit tests run as a development site,
    // like `npm run dev`. Tests of production/staging rules pass their own env object.
    env: { SITE_ENV: "development" },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    conditions: ["react-server"],
  },
});
