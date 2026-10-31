#!/usr/bin/env node
// Build command used by Vercel (it runs "vercel-build" instead of "build" when present).
// For a quick preview deployment you can let the build prepare the database:
//   DB_PUSH_ON_BUILD=true   → create/update the tables (prisma db push; refuses data-loss changes)
//   SEED_ON_BUILD=true      → load cities, FAQ, banned words and the demo listings (safe to repeat)
// For the real launch, leave both off and run migrations deliberately (see README).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.DB_PUSH_ON_BUILD === "true") run("npx prisma db push");
if (process.env.SEED_ON_BUILD === "true") run("npm run db:seed");
run("npx next build");
