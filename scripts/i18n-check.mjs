#!/usr/bin/env node
// Checks that every namespace exists in all five languages with the same keys,
// and that no message uses "#" inside a plural (it would print Arabic-Indic digits).
import fs from "node:fs";
import path from "node:path";

const LOCALES = ["he", "en", "ru", "ar", "ka"];
const root = path.join(process.cwd(), "messages");
let problems = 0;

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const namespaces = new Set();
for (const locale of LOCALES) {
  const dir = path.join(root, locale);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) namespaces.add(f.slice(0, -5));
}

for (const ns of [...namespaces].sort()) {
  const data = {};
  for (const locale of LOCALES) {
    const file = path.join(root, locale, `${ns}.json`);
    if (!fs.existsSync(file)) {
      console.error(`✗ missing messages/${locale}/${ns}.json`);
      problems++;
      continue;
    }
    try {
      data[locale] = flatten(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {
      console.error(`✗ invalid JSON in messages/${locale}/${ns}.json: ${e.message}`);
      problems++;
    }
  }
  const base = data.en ?? {};
  for (const locale of LOCALES) {
    const cur = data[locale];
    if (!cur) continue;
    for (const key of Object.keys(base)) {
      if (!(key in cur)) { console.error(`✗ ${locale}/${ns}: missing "${key}"`); problems++; }
    }
    for (const key of Object.keys(cur)) {
      if (!(key in base)) { console.error(`✗ ${locale}/${ns}: extra "${key}" (not in en)`); problems++; }
      const value = cur[key];
      if (typeof value === "string" && /plural|selectordinal/.test(value) && /(^|[^'])#/.test(value)) {
        console.error(`✗ ${locale}/${ns}: "${key}" uses # in a plural — write {count} instead`);
        problems++;
      }
      if (typeof value === "string" && value.trim() === "") {
        console.error(`✗ ${locale}/${ns}: "${key}" is empty`); problems++;
      }
    }
  }
}

if (problems) {
  console.error(`\n${problems} translation problem(s).`);
  process.exit(1);
}
console.log(`✓ ${namespaces.size} namespaces × ${LOCALES.length} languages — all keys match.`);
