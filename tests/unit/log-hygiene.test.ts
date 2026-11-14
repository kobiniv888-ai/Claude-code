/**
 * Security checklist 5 ("Logs never contain phone numbers, emails, codes, addresses or tokens"),
 * SECURITY_REPORT 5.l: no console.* call in src/ puts a person's email, phone number, login code,
 * address, coordinates or a token into a log line. Ids, booking codes, counts and error objects are
 * fine (errors also pass the log scrubber, src/lib/log-scrub.ts). A value that must be shown goes
 * through a mask function first (maskPhone, maskEmail…).
 *
 * The check reads every call's arguments: string literals are dropped (their words are fine),
 * `${…}` expressions and bare arguments are kept, mask*(…) calls are removed, and what is left must
 * not name one of the identifiers below.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src");

/** Identifiers (bare or as a property) that hold personal data or secrets. */
const FORBIDDEN = [
  "email",
  "recipient",
  "phone",
  "phoneNumber",
  "guestPhone",
  "guestName",
  "address",
  "lat",
  "lng",
  "otp",
  "token",
  "secret",
  "password",
  "contactMethods",
  "body",
  // log-scrub-1: a request's headers carry the session cookie and the client's IP.
  "headers",
  "cookie",
  "cookies",
  "ip",
  "request",
];

/** Ids, statuses and error codes of these objects are fine; the objects themselves are not. */
const SAFE_MEMBER = /\b(?:request|cookie|cookies|headers)\s*\.\s*(?:id|error|ok|status|method)\b/g;

/** Bare `code` / `otp` variables are login codes in this code base (booking.code etc. are fine). */
const FORBIDDEN_BARE = ["code", "otp"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The text between the call's parentheses (balanced, strings and template literals respected). */
function callArguments(source: string, open: number): string {
  let depth = 0;
  let i = open;
  let quote: string | null = null;
  const templateDepth: number[] = [];
  for (; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (quote === "`" && ch === "$" && source[i + 1] === "{") {
        templateDepth.push(depth);
        quote = null;
        depth++;
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (ch === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === depth) {
        templateDepth.pop();
        quote = "`";
        continue;
      }
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Drops string contents but keeps `${…}` expressions; removes mask*(…) calls. */
function expressionsOnly(args: string): string {
  let out = "";
  let quote: string | null = null;
  let braces = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (quote === "`" && ch === "$" && args[i + 1] === "{") {
        quote = null;
        braces = 1;
        out += " ";
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (braces > 0) {
      if (ch === "{") braces++;
      if (ch === "}") {
        braces--;
        if (braces === 0) {
          quote = "`";
          out += " ";
          continue;
        }
      }
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }
  // mask…(x) and safe summaries of values are allowed.
  return out.replace(/\bmask\w*\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ");
}

type Finding = { file: string; line: number; text: string };

function findings(): { found: Finding[]; checked: number } {
  const found: Finding[] = [];
  let checked = 0;
  const property = new RegExp(`(?:^|[^\\w$])(?:\\.\\s*)?(${FORBIDDEN.join("|")})\\b(?!\\s*\\()`, "g");
  const bare = new RegExp(`(?<![\\w$.])(${FORBIDDEN_BARE.join("|")})\\b(?!\\s*[:(])`, "g");
  for (const file of walk(ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    const call = /\bconsole\s*\.\s*(log|info|warn|error|debug|trace)\s*\(/g;
    for (let match = call.exec(source); match; match = call.exec(source)) {
      checked++;
      const open = match.index + match[0].length - 1;
      // `request.id` (a verification request's id) and `cookie.error` (an error code) are fine.
      const expressions = expressionsOnly(callArguments(source, open)).replace(SAFE_MEMBER, " ");
      const hits = [...expressions.matchAll(property), ...expressions.matchAll(bare)].map((m) => m[1]);
      if (hits.length > 0) {
        found.push({ file: path.relative(process.cwd(), file), line: source.slice(0, match.index).split("\n").length, text: [...new Set(hits)].join(", ") });
      }
    }
  }
  return { found, checked };
}

describe("log hygiene (SECURITY_REPORT 5.l)", () => {
  it("no console.* call logs an email, phone, login code, address, coordinates or token", () => {
    const { found, checked } = findings();
    // The walk really reads the code base (about 200 calls today).
    expect(checked).toBeGreaterThan(150);
    expect(found).toEqual([]);
  });

  it("the checker itself catches the patterns it is meant to catch", () => {
    const sample = (code: string) => expressionsOnly(callArguments(code, code.indexOf("(")));
    expect(sample("console.info(`sent to ${user.email}`)")).toContain("email");
    expect(sample("console.error('[x] failed', request.headers)")).toMatch(/\bheaders\b/);
    expect(sample("console.warn('from', ip)")).toMatch(/\bip\b/);
    expect(sample('console.error(`[email] Resend rejected "${template}" to ${recipient}:`, error.message)')).toMatch(/\brecipient\b/);
    expect(sample("console.log(`[sms] ${input.to}`, input.body)")).toMatch(/\bbody\b/);
    expect(sample("console.info(`code ${code} for ${maskPhone(phone)}`)")).toMatch(/\bcode\b/);
    expect(sample("console.info(`for ${maskPhone(input.phone)}`)")).not.toMatch(/phone/);
    expect(sample('console.error("[auth] the email could not be sent", error)')).not.toMatch(/email/);
  });
});
