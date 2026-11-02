import fs from "node:fs";
import path from "node:path";

/**
 * A small static import graph of src/ for tests: follows `@/…` and relative imports (`import type`
 * is skipped, dynamic `import("…")` is followed) and knows which modules end up in the browser
 * ("use client", or imported from one).
 */
export const SRC = path.resolve(__dirname, "../../src");

const resolveCache = new Map<string, string | null>();
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  const key = base;
  if (resolveCache.has(key)) return resolveCache.get(key)!;
  const found =
    [".tsx", ".ts", "/index.tsx", "/index.ts", ""].map((ext) => base + ext).find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ??
    null;
  resolveCache.set(key, found);
  return found;
}

type ModuleInfo = { isClient: boolean; imports: string[]; namespaces: string[] };
const moduleCache = new Map<string, ModuleInfo>();
export function moduleInfo(file: string): ModuleInfo {
  const cached = moduleCache.get(file);
  if (cached) return cached;
  const src = fs.readFileSync(file, "utf8");
  const isClient = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
  const imports = [...src.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
    .filter((m) => !/^(?:import|export)\s+type\s/.test(m[0]))
    .map((m) => resolveImport(file, m[1] ?? m[2]))
    .filter((p): p is string => !!p && /\.(tsx?|mts)$/.test(p));
  const namespaces = [...src.matchAll(/useTranslations\(\s*["'`]([a-zA-Z.]+)/g)].map((m) => m[1].replace(/\.+$/, ""));
  if (/useTranslations\(\s*\)/.test(src)) namespaces.push("*");
  const info = { isClient, imports, namespaces };
  moduleCache.set(file, info);
  return info;
}

/** namespace → client modules that read it, for everything reachable from `entries`. */
export function clientNamespaces(entries: string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const stack = entries.map((file) => ({ file, inClient: false }));
  while (stack.length) {
    const { file, inClient } = stack.pop()!;
    const key = `${file}|${inClient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = moduleInfo(file);
    const client = inClient || info.isClient;
    if (client) {
      for (const ns of info.namespaces) {
        if (!out.has(ns)) out.set(ns, new Set());
        out.get(ns)!.add(path.relative(SRC, file));
      }
    }
    for (const next of info.imports) stack.push({ file: next, inClient: client });
  }
  return out;
}

export function tsxFiles(dir: string, recursive = true): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? tsxFiles(full) : [];
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every module reachable from `entries` that is bundled for the browser. */
export function clientModules(entries: string[]): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = entries.map((file) => ({ file, inClient: false }));
  while (stack.length) {
    const { file, inClient } = stack.pop()!;
    const key = `${file}|${inClient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = moduleInfo(file);
    const client = inClient || info.isClient;
    if (client) out.add(file);
    for (const next of info.imports) stack.push({ file: next, inClient: client });
  }
  return out;
}

/** Every module reachable from `entries` (server and client). */
export function reachableModules(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...moduleInfo(file).imports);
  }
  return seen;
}
