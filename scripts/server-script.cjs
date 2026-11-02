/**
 * Preload for Node scripts that use server modules (seed, demo removal):
 *   tsx --require ./scripts/server-script.cjs prisma/seed/index.ts
 *
 * Server modules start with `import "server-only"`, which throws outside React Server Components.
 * Scripts used to opt in with `--conditions=react-server`, but tsx mishandles that flag on some
 * Node 22 versions ("conditions.has is not a function", e.g. Node 22.16 in GitHub Codespaces),
 * so instead we point `server-only` at its own no-op file here.
 */
const Module = require("node:module");
const path = require("node:path");

// Resolving (not loading) the package gives its folder; empty.js is its own no-op entry.
const serverOnlyNoop = path.join(path.dirname(require.resolve("server-only")), "empty.js");
const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return serverOnlyNoop;
  return resolveFilename.call(this, request, ...rest);
};
