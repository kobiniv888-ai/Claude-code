/**
 * The server's start-up settings check (src/lib/startup-check.ts) as a command, for the hosting's
 * build (scripts/vercel-build.mjs) and by hand:
 *
 *   npx tsx scripts/check-startup-env.ts      exit 0: the settings would start; exit 1: the list of problems
 *
 * It reads this process's environment plus .env (like the server: a real environment variable
 * wins). The server runs the same check itself at every start (src/instrumentation.ts), so a
 * setting changed after the build is still caught.
 */
import "dotenv/config";
import { formatStartupProblems, startupProblems, startupWarnings } from "../src/lib/startup-check";

const problems = startupProblems(process.env);
if (problems.length > 0) {
  console.error(`\n${formatStartupProblems(problems)}\n`);
  process.exit(1);
}
for (const warning of startupWarnings(process.env)) console.warn(warning);
console.log(`[startup-check] OK: the settings are complete for SITE_ENV=${process.env.SITE_ENV}.`);
