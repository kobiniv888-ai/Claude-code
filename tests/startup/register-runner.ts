/**
 * Runs the server's own start-up hook — src/instrumentation.ts register(), exactly what Next.js
 * calls before the first request (the log scrubber, then on Node.js the settings check of
 * src/instrumentation-node.ts) — in a child process with the environment it was given, then prints
 * "STARTED". The refuse-to-start test (tests/unit/startup-refuse.test.ts) spawns it once per case
 * with NEXT_RUNTIME=nodejs: bad settings must end the process with a non-zero code before
 * "STARTED". Removing or breaking the call in src/instrumentation.ts fails those cases.
 *
 *   NEXT_RUNTIME=nodejs npx tsx --require ./scripts/server-script.cjs tests/startup/register-runner.ts
 */
import { register } from "../../src/instrumentation";

void register().then(() => {
  console.log("STARTED");
  // The database client (the site-marker check) keeps the event loop alive: done.
  process.exit(0);
});
