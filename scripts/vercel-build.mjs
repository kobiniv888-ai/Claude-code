#!/usr/bin/env node
// Build command used by Vercel (it runs "vercel-build" instead of "build" when present).
// For a quick preview deployment you can let the build prepare the database:
//   DB_PUSH_ON_BUILD=true   → create/update the tables (prisma db push; refuses data-loss changes)
//   SEED_ON_BUILD=true      → load cities, FAQ, banned words and the demo listings (safe to repeat)
// For the real launch, leave both off and run migrations deliberately (see README): with
// SITE_ENV=production the settings check below refuses them, and before either one runs the
// database is checked for the real site's marker (scripts/check-site-marker.ts, SECURITY_REPORT
// 12.1.b): a preview or staging build never pushes to or seeds the real database.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// Fail closed before building anything: the same settings check the server runs at every start
// (src/lib/startup-check.ts; SECURITY_REPORT 2.2.j / 3.4.b). SITE_ENV and every required secret
// must be set in the hosting's environment settings for this deployment.
run("npx tsx scripts/check-startup-env.ts");

if (process.env.DB_PUSH_ON_BUILD === "true" || process.env.SEED_ON_BUILD === "true") {
  run("npx tsx --require ./scripts/server-script.cjs scripts/check-site-marker.ts");
}
if (process.env.DB_PUSH_ON_BUILD === "true") {
  // Lets the push add the booking index without a consent prompt (see the file; idempotent).
  run("npx prisma db execute --file prisma/sql/before-push.sql");
  run("npx prisma db push");
}
if (process.env.SEED_ON_BUILD === "true") run("npm run db:seed");
run("npx next build");
