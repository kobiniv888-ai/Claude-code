/**
 * Preload for Node scripts that use server modules (seed, demo removal):
 *   tsx --require ./scripts/server-script.cjs prisma/seed/index.ts
 *
 * 1. Server modules start with `import "server-only"`, which throws outside React Server
 *    Components. Here it resolves to the package's own no-op file instead (the same thing the
 *    react-server condition does, without needing `--conditions=react-server`).
 * 2. Node 22.12–22.17 sometimes passes Module._resolveFilename / Module._findPath an ARRAY of
 *    export conditions while its own resolver expects a Set, which crashes with
 *    "conditions.has is not a function" (seen on Node 22.16 in GitHub Codespaces). Arrays are
 *    turned into a Set before Node sees them; later Node versions already pass a Set.
 */
const Module = require("node:module");
const path = require("node:path");

// Resolving (not loading) the package gives its folder; empty.js is its own no-op entry.
const serverOnlyNoop = path.join(path.dirname(require.resolve("server-only")), "empty.js");
const asSet = (conditions) => (Array.isArray(conditions) ? new Set(conditions) : conditions);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options, ...rest) {
  if (request === "server-only") return serverOnlyNoop;
  const fixed = options && Array.isArray(options.conditions) ? { ...options, conditions: asSet(options.conditions) } : options;
  return resolveFilename.call(this, request, parent, isMain, fixed, ...rest);
};

const findPath = Module._findPath;
Module._findPath = function (request, paths, isMain, conditions, ...rest) {
  return findPath.call(this, request, paths, isMain, asSet(conditions), ...rest);
};
