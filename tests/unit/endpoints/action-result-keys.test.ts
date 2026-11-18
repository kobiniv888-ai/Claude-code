/**
 * SECURITY_REPORT 5.d / 5.h: server actions return only what the client needs. This test reads the
 * result TYPE of every server action in the registry (tests/unit/endpoints/registry.ts) with the
 * TypeScript checker and walks it: a field named like a phone number, an email or an address
 * (phone…, email…, address…, street…) that holds text fails, unless RESULT_CONTACT_KEYS lists it
 * with why it is the caller's own data or allowed for that caller. A new action, or a new field
 * in an old one, that would hand another user's contact details to the browser fails here before
 * any request is made.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { RESULT_CONTACT_KEYS, SERVER_ACTIONS } from "./registry";

const REPO = path.resolve(__dirname, "../../..");
const SENSITIVE = /phone|e-?mail|address|street|houseNumber|apartment/i;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "generated") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const isUseServer = (text: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(text);
const rel = (file: string) => path.relative(REPO, file).split(path.sep).join("/");

/** action key → the sensitive text fields of its result (paths like data.sender.email, data[].phone). */
function contactKeysOfResults(): Map<string, string[]> {
  const modules = sourceFiles(path.join(REPO, "src")).filter((file) => isUseServer(readFileSync(file, "utf8")));
  const config = ts.readConfigFile(path.join(REPO, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO);
  const program = ts.createProgram(modules, { ...parsed.options, noEmit: true, incremental: false });
  const checker = program.getTypeChecker();
  const out = new Map<string, string[]>();

  const holdsText = (type: ts.Type): boolean =>
    type.isUnion() ? type.types.some(holdsText) : !!(type.flags & ts.TypeFlags.StringLike) || (!!(type.flags & ts.TypeFlags.Object) && !checker.isArrayType(type));

  for (const file of modules) {
    const sf = program.getSourceFile(file);
    const moduleSymbol = sf && checker.getSymbolAtLocation(sf);
    if (!sf || !moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const found = new Set<string>();
      const seen = new Set<ts.Type>();
      const walk = (type: ts.Type, at: string, depth: number) => {
        if (depth > 8 || seen.has(type)) return;
        seen.add(type);
        if (type.isUnion() || type.isIntersection()) return type.types.forEach((t) => walk(t, at, depth));
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
          return checker.getTypeArguments(type as ts.TypeReference).forEach((t) => walk(t, `${at}[]`, depth + 1));
        }
        if (type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return;
        const name = type.getSymbol()?.getName();
        if (name && /^(Date|Map|Set|Promise|RegExp|Uint8Array)$/.test(name)) return;
        for (const prop of checker.getPropertiesOfType(type)) {
          const key = at ? `${at}.${prop.getName()}` : prop.getName();
          const propType = checker.getTypeOfSymbolAtLocation(prop, sf);
          if (SENSITIVE.test(prop.getName()) && holdsText(propType)) found.add(key);
          walk(propType, key, depth + 1);
        }
      };
      for (const signature of checker.getTypeOfSymbolAtLocation(exported, sf).getCallSignatures()) {
        const result = signature.getReturnType();
        walk(checker.getAwaitedType(result) ?? result, "", 0);
      }
      out.set(`${rel(file)}#${exported.getName()}`, [...found].sort());
    }
  }
  return out;
}

describe("server action results carry no other user's phone, email or address (5.d, 5.h)", () => {
  const results = contactKeysOfResults();

  it("reads the result type of every registered server action", () => {
    const registered = Object.entries(SERVER_ACTIONS).flatMap(([file, names]) => Object.keys(names).map((name) => `${file}#${name}`));
    expect(registered.length).toBeGreaterThan(150);
    expect(registered.filter((key) => !results.has(key))).toEqual([]);
  });

  it("only the listed results have such a field, and only the listed fields", () => {
    const problems: string[] = [];
    for (const [key, fields] of results) {
      const allowed = new Set(RESULT_CONTACT_KEYS[key]?.keys ?? []);
      for (const field of fields) if (!allowed.has(field)) problems.push(`${key}: ${field}`);
    }
    expect(problems, "remove the field from the result, mask it, or list it in RESULT_CONTACT_KEYS with why").toEqual([]);
  });

  it("every allow-list entry still matches a field (no stale reasons)", () => {
    const stale = Object.entries(RESULT_CONTACT_KEYS).flatMap(([key, { keys, why }]) => {
      expect(why.length, key).toBeGreaterThan(20);
      const fields = new Set(results.get(key) ?? []);
      return keys.filter((field) => !fields.has(field)).map((field) => `${key}: ${field}`);
    });
    expect(stale).toEqual([]);
  });
}, 120_000);
