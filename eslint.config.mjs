import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * SECURITY_REPORT 4.1.a: pages, layouts, route handlers, components and hooks never query the
 * database themselves. Reads and writes go through a server-only function in src/lib/<feature>/
 * that checks who is asking (tests/unit/no-direct-db-imports.test.ts checks the same rule when
 * lint is skipped). Types from the generated client stay allowed.
 */
const DB_IMPORT_RULE = [
  "error",
  {
    paths: [{ name: "@/lib/db", message: "Query through a server-only module in src/lib/<feature>/ that checks who is asking (SECURITY_REPORT 4.1.a)." }],
    patterns: [
      {
        group: ["@/generated/prisma/client", "@/generated/prisma/models", "@/generated/prisma/models/*"],
        allowTypeImports: true,
        message: "Only types from the Prisma client outside src/lib (enums: @/generated/prisma/enums).",
      },
    ],
  },
];

/**
 * Thin files that keep a direct database import, each with its reason (4.1.a). Keep this list
 * short; tests/unit/no-direct-db-imports.test.ts reads it too.
 */
export const DIRECT_DB_ALLOWED = {
  // Route handlers: the access check (token, cron secret, staff or owner session) comes first,
  // then one query scoped by it.
  "src/app/api/admin/reports/[reportId]/[index]/route.ts": "staff file route: requireStaffForAction, own-item and Q12 checks, then the report's own row",
  "src/app/api/admin/documents/[requestId]/[index]/route.ts": "staff file route: requireStaffForAction, then the request's own row",
  "src/app/api/cron/cleanup/route.ts": "cron: isAuthorizedCron first; calls the retention jobs",
  "src/app/api/account/avatar/route.ts": "the signed-in user's own avatar (requireUser, where: { id: user.id })",
  "src/app/api/uploads/listing-photo/route.ts": "upload route (fixer C's area): requireUser + ownership of the listing",
  "src/app/api/uploads/private/route.ts": "upload route (fixer C's area): requireUser, the user's own private upload",
  "src/app/api/ical/[token]/route.ts": "token route: the 256-bit calendar token selects the one listing; dates only",
  "src/app/sitemap.ts": "public data only (live, non-demo listings and published articles)",
  // Pages scoped to the signed-in user (requireUser / requireStaff first, where: { id: user.id }).
  "src/app/[locale]/(site)/account/layout.tsx": "tab badges for the signed-in user only (requireUser, scoped by user.id)",
  "src/app/[locale]/(site)/account/reviews/page.tsx": "the signed-in user's own notification preferences (requireUser, by user.id)",
  "src/app/[locale]/(site)/account/alerts/page.tsx": "the signed-in user's own email and preferences (requireUser, by user.id)",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/proxy.ts"],
    // Paths are globs: the brackets and parentheses of route folders are escaped.
    ignores: ["**/*.test.{ts,tsx}", ...Object.keys(DIRECT_DB_ALLOWED).map((file) => file.replace(/[[\]()]/g, "\\$&"))],
    rules: { "@typescript-eslint/no-restricted-imports": DB_IMPORT_RULE },
  },
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
    "src/lib/cn-tables.generated.js",
    "storage/**",
    "test-results/**",
    "playwright-report/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
