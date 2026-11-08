#!/usr/bin/env node
/**
 * The ONLY install scripts this project runs (SECURITY_REPORT 2.3.g, founder's choice L5 a).
 *
 * `.npmrc` sets `ignore-scripts=true`, so `npm ci` / `npm install` run no package's
 * preinstall/install/postinstall script (the "Shai-Hulud" npm worms spread through them), not even
 * our own `postinstall`. After every install, run this allow-list:
 *
 *   npm ci && npm run deps:scripts
 *
 * It runs the install script of each package in ALLOWED_INSTALL_SCRIPTS (with npm's own
 * `npm rebuild <name> --ignore-scripts=false`), then our own `postinstall` (prisma generate).
 * The codespace setup/start scripts and Vercel's installCommand (vercel.json) call it.
 *
 * Checked on 8 November 2026 with a clean `npm ci` of this lockfile in a copy of the project:
 * every package in SKIPPED_INSTALL_SCRIPTS works without its script (its prebuilt binary comes as
 * an optional dependency, or the script only checks something). tests/unit/install-scripts.test.ts
 * fails when the lockfile gains a package with an install script that is in neither list: review
 * that script, then add the package to one of them.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Packages whose install script runs (reviewed). */
export const ALLOWED_INSTALL_SCRIPTS = [
  // Downloads Prisma's schema engine (checksum-verified) used by `prisma db push` / migrations.
  // The Prisma CLI would also fetch it on first use; fetching it at install keeps later commands offline.
  "@prisma/engines",
];

/** Packages whose install script is skipped on purpose, with the reason. */
export const SKIPPED_INSTALL_SCRIPTS = {
  prisma: "preinstall only checks the Node.js version (package.json engines does the same)",
  esbuild: "install.js only verifies/optimizes the binary; @esbuild/<platform> is installed as an optional dependency",
  "@swc/core": "postinstall falls back to a WASM download when @swc/core-<platform> is missing; it is installed",
  "@parcel/watcher": "install only builds from source when npm_config_build_from_source=true; prebuilt binary is installed",
  "unrs-resolver": "postinstall (napi-postinstall) only fetches a binary when @unrs/resolver-binding-<platform> is missing",
  fsevents: "macOS only (optional); unused on Linux, prebuilt for macOS",
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[deps:scripts] "${command} ${args.join(" ")}" failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status || 1);
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const present = ALLOWED_INSTALL_SCRIPTS.filter((name) => existsSync(path.join(root, "node_modules", name, "package.json")));
  if (present.length > 0) {
    console.log(`[deps:scripts] Running the allowed install scripts: ${present.join(", ")}`);
    run("npm", ["rebuild", ...present, "--ignore-scripts=false", "--foreground-scripts"], root);
  }
  // Our own postinstall (prisma generate). An explicit `npm run` still runs with ignore-scripts.
  console.log("[deps:scripts] Generating the database client (npm run postinstall → prisma generate)");
  run("npm", ["run", "--silent", "postinstall"], root);
  console.log("[deps:scripts] Done.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
