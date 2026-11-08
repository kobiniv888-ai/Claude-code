/**
 * Runs the server's own start-up hook (src/instrumentation-node.ts registerNode, what
 * src/instrumentation.ts calls before the first request) in a child process with the environment
 * it was given, then prints "STARTED". The refuse-to-start test (tests/unit/startup-refuse.test.ts)
 * spawns it once per case: bad settings must end the process with a non-zero code before "STARTED".
 *
 *   npx tsx --require ./scripts/server-script.cjs tests/startup/register-runner.ts
 */
import { registerNode } from "../../src/instrumentation-node";

void registerNode().then(() => console.log("STARTED"));
