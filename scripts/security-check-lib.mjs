/**
 * The pure parts of `npm run security:check` (scripts/security-check.mjs), unit-tested in
 * tests/unit/security-check.test.ts. No imports: plain data in, plain answers out.
 */

/**
 * The patched floor of the framework (SECURITY_REPORT 2.1.a/b): the installed Next.js and React
 * must include the November 2026 security fixes. Raise these after every security upgrade
 * (tests/unit/framework-versions.test.ts checks the same floors).
 */
export const FRAMEWORK_FLOORS = {
  next: "16.4.5",
  "eslint-config-next": "16.4.5",
  react: "19.3.1",
  "react-dom": "19.3.1",
};

/** Lockfile entries younger than this fail the age check unless allow-listed (SECURITY_REPORT 2.3.f). */
export const MIN_PACKAGE_AGE_DAYS = 14;

/** -1, 0 or 1 for plain x.y.z versions (a pre-release suffix counts as below its release). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).split("-", 2);
    return { parts: core.split(".").map(Number), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if ((x.parts[i] ?? 0) !== (y.parts[i] ?? 0)) return (x.parts[i] ?? 0) > (y.parts[i] ?? 0) ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  return x.pre === null ? 1 : -1;
}

/** Installed versions below the floor: [{ name, installed, floor }]. A missing package counts. */
export function belowFloor(installed, floors = FRAMEWORK_FLOORS) {
  return Object.entries(floors)
    .filter(([name, floor]) => !installed[name] || compareVersions(installed[name], floor) < 0)
    .map(([name, floor]) => ({ name, installed: installed[name] ?? null, floor }));
}

/** High and critical counts from `npm audit --json` (its metadata.vulnerabilities). */
export function auditSeverities(report) {
  const counts = report?.metadata?.vulnerabilities ?? {};
  return { high: Number(counts.high ?? 0), critical: Number(counts.critical ?? 0), moderate: Number(counts.moderate ?? 0), low: Number(counts.low ?? 0) };
}

/** Every installed package version of a package-lock.json v3: [{ name, version, key }], one per name@version. */
export function lockfileEntries(lock) {
  const seen = new Map();
  for (const [key, entry] of Object.entries(lock?.packages ?? {})) {
    if (!key || !entry?.version || entry.link) continue;
    const name = entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const id = `${name}@${entry.version}`;
    if (!seen.has(id)) seen.set(id, { name, version: entry.version, id });
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The age check (pure). `published`: "name@version" → ISO publish time (missing: unknown, which
 * fails: fail closed). `allow`: "name@version" → { reason } for young versions taken on purpose
 * (security upgrades). Returns the failures and the notes.
 */
export function packageAgeReport(entries, published, allow, now = new Date(), minDays = MIN_PACKAGE_AGE_DAYS) {
  const young = [];
  const allowed = [];
  const unknown = [];
  for (const entry of entries) {
    const at = published[entry.id];
    const time = at ? new Date(at).getTime() : Number.NaN;
    if (!Number.isFinite(time)) {
      unknown.push(entry.id);
      continue;
    }
    const ageDays = (now.getTime() - time) / 86_400_000;
    if (ageDays >= minDays) continue;
    const reason = allow[entry.id]?.reason;
    if (typeof reason === "string" && reason.trim().length >= 10) allowed.push({ id: entry.id, ageDays, reason });
    else young.push({ id: entry.id, ageDays });
  }
  const installed = new Set(entries.map((entry) => entry.id));
  // Allow-list lines that no longer apply (the version is gone, or old enough now): tidy them up.
  const stale = Object.keys(allow).filter((id) => !installed.has(id) || !allowed.some((a) => a.id === id));
  return { young, allowed, unknown, stale };
}
