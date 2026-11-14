#!/usr/bin/env node
/**
 * npm run security:check — the supply-chain check before a release and on launch day
 * (SECURITY_REPORT 2.1.b, 2.3.f; README "Security check"; OWNER_TODO "Launch day"). It FAILS
 * (exit code 1) when:
 *
 *   1. `npm audit --omit=dev` reports a high or critical advisory in a production dependency
 *      (or cannot run: fail closed);
 *   2. the installed Next.js / React (and eslint-config-next) are below the patched floor
 *      (scripts/security-check-lib.mjs FRAMEWORK_FLOORS);
 *   3. a lockfile entry was published less than 14 days ago and is not in
 *      scripts/package-age-allow.json with a reason (fresh releases are where hijacked packages
 *      show up; security upgrades are taken on purpose and listed), or its publish time cannot be
 *      read from the registry.
 *
 * It then prints a reminder to read the Next.js and React security advisories by hand.
 *
 *   npm run security:check                  everything
 *   npm run security:check -- --skip-age    without the registry look-ups (offline)
 *
 * Publish times never change, so they are cached in node_modules/.cache/bayit-security/.
 * No packages of its own: Node.js and npm only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FRAMEWORK_FLOORS, MIN_PACKAGE_AGE_DAYS, auditSeverities, belowFloor, lockfileEntries, packageAgeReport } from "./security-check-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = (process.env.npm_config_registry ?? "https://registry.npmjs.org/").replace(/\/?$/, "/");
const CACHE_FILE = path.join(ROOT, "node_modules/.cache/bayit-security/package-times.json");
const args = new Set(process.argv.slice(2));
const failures = [];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const line = (text = "") => console.log(text);

function auditCheck() {
  line("1. npm audit --omit=dev (production dependencies)");
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  let report;
  try {
    report = JSON.parse(result.stdout || "{}");
  } catch {
    report = null;
  }
  if (!report?.metadata?.vulnerabilities) {
    failures.push("npm audit could not run (no network, or the registry answered with an error): the check fails closed.");
    line(`   could not run npm audit: ${(result.stderr || result.stdout || "").trim().slice(0, 300)}`);
    return;
  }
  const counts = auditSeverities(report);
  line(`   critical ${counts.critical}, high ${counts.high}, moderate ${counts.moderate}, low ${counts.low}`);
  if (counts.critical + counts.high > 0) {
    failures.push(`npm audit: ${counts.critical} critical and ${counts.high} high advisories in production dependencies (npm audit --omit=dev).`);
  }
}

function floorCheck() {
  line("2. Next.js and React are at or above the patched floor");
  const installed = {};
  for (const name of Object.keys(FRAMEWORK_FLOORS)) {
    const file = path.join(ROOT, "node_modules", name, "package.json");
    installed[name] = existsSync(file) ? readJson(file).version : null;
    line(`   ${name} ${installed[name] ?? "(not installed)"} (floor ${FRAMEWORK_FLOORS[name]})`);
  }
  for (const miss of belowFloor(installed)) {
    failures.push(`${miss.name} ${miss.installed ?? "(not installed)"} is below the patched floor ${miss.floor}: run npm ci, or upgrade.`);
  }
}

async function publishTimes(entries) {
  const cache = existsSync(CACHE_FILE) ? readJson(CACHE_FILE) : {};
  const missing = [...new Set(entries.filter((entry) => !cache[entry.id]).map((entry) => entry.name))];
  let next = 0;
  async function worker() {
    while (next < missing.length) {
      const name = missing[next++];
      try {
        const res = await fetch(`${REGISTRY}${name.replace("/", "%2F")}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) continue;
        const doc = await res.json();
        for (const [version, at] of Object.entries(doc.time ?? {})) {
          if (version !== "created" && version !== "modified") cache[`${name}@${version}`] = at;
        }
      } catch {
        // Unknown time: the report fails closed for it.
      }
    }
  }
  if (missing.length > 0) line(`   reading ${missing.length} packages' publish times from ${REGISTRY} …`);
  await Promise.all(Array.from({ length: 12 }, worker));
  mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return cache;
}

async function ageCheck() {
  line(`3. Package age: lockfile versions at least ${MIN_PACKAGE_AGE_DAYS} days old (or allow-listed with a reason)`);
  if (args.has("--skip-age")) {
    failures.push("the package-age check was skipped (--skip-age): run it with network access before a release.");
    line("   skipped (--skip-age)");
    return;
  }
  const entries = lockfileEntries(readJson(path.join(ROOT, "package-lock.json")));
  const allow = readJson(path.join(ROOT, "scripts/package-age-allow.json")).allow ?? {};
  const report = packageAgeReport(entries, await publishTimes(entries), allow);
  line(`   ${entries.length} versions checked; ${report.allowed.length} young but allow-listed, ${report.young.length} young, ${report.unknown.length} unknown`);
  for (const item of report.allowed) line(`   allowed ${item.id} (${item.ageDays.toFixed(1)} days): ${item.reason}`);
  for (const item of report.young) failures.push(`${item.id} was published ${item.ageDays.toFixed(1)} days ago: wait until it is ${MIN_PACKAGE_AGE_DAYS} days old, or add it to scripts/package-age-allow.json with the reason (a security fix).`);
  for (const id of report.unknown) failures.push(`${id}: its publish time could not be read from the registry (fail closed).`);
  for (const id of report.stale) line(`   note: ${id} in scripts/package-age-allow.json is no longer needed (gone or old enough): remove it.`);
}

async function main() {
  line("Bayit security check (SECURITY_REPORT 2.1.b, 2.3.f)\n");
  auditCheck();
  floorCheck();
  await ageCheck();
  line("\n4. By hand: read the Next.js and React security advisories since the last check —");
  line("   https://github.com/vercel/next.js/security/advisories and https://github.com/facebook/react/security/advisories");
  line("   (and https://nextjs.org/blog). A new advisory for our versions: upgrade, raise FRAMEWORK_FLOORS, run this again.");
  if (failures.length > 0) {
    line(`\nFAILED (${failures.length}):`);
    for (const failure of failures) line(`  - ${failure}`);
    process.exit(1);
  }
  line("\nOK: no high or critical advisory, the framework is patched, every package is old enough or allow-listed.");
}

main().catch((error) => {
  console.error("security:check failed:", error?.message ?? error);
  process.exit(1);
});
