import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bayit: side-by-side dev/build folders (NEXT_DIST_DIR=.next-*), the generated Prisma
    // client, local file storage, test output and agent tooling are not source code.
    ".next-*/**",
    "src/generated/**",
    "storage/**",
    "test-results/**",
    "playwright-report/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
