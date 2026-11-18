/**
 * Personal data and secrets out of every server log line and error report (security checklist 5
 * "Logs and errors", SECURITY_REPORT 5.l and 16.1).
 *
 *   scrubText("sent to noa@example.com, code 482913")  // → "sent to n***@e…, code [code]"
 *   scrubValue(error)                                   // → a copy with message, stack and cause scrubbed
 *   installLogScrubber()                                // console.* on this server scrubs its arguments
 *
 * Two layers:
 * 1. The code logs ids, never people: no console.* call interpolates an email, a phone number, a
 *    login code, an address or a token (tests/unit/log-hygiene.test.ts checks every call site).
 * 2. This safety net, for what a library or an error message carries anyway (a Prisma error that
 *    repeats the query's values, a fetch error with a URL): installed on console.* when the server
 *    starts (src/instrumentation.ts) and applied to every Sentry event (src/lib/monitoring.ts).
 *    It masks emails (also "%40"-encoded), phone numbers (E.164, with or without "+", and the
 *    Israeli and Georgian national spellings: "050-123-4567", "555 12 34 56"), login codes up to
 *    three words after "code" / "OTP" ("OTP sent: 482913"), IPv4 and IPv6 addresses (also "::"
 *    forms), exact coordinates (5+ decimals), bearer/basic credentials, credentials inside
 *    connection strings, URL query values, JWTs and long random tokens. A Prisma "Invalid
 *    `…()` invocation" error repeats the call's arguments (a guest's name, message, phone):
 *    the whole argument dump is removed, only the first line and the reason stay. Quoted
 *    `key: "…"` pairs whose key names personal data are masked in any text; object keys that name
 *    personal data (email, phone, name, address, message to the host, lat/lng, token, password,
 *    secret, cookie…) are replaced whole. Headers, URLSearchParams, FormData and Request objects
 *    are turned into plain objects first (cookies, authorization and client IPs redacted).
 *
 * Street addresses cannot be recognised in free text, so they are kept out by layer 1 (and the
 * exact address is never selected outside the guest's own trip and the host's own pages).
 *
 * Pure and dependency-free: safe in the Node.js and Edge runtimes and in tests.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+)(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** "noa%40example.com" (a URL-encoded email) → "noa@example.com", then masked like any other. */
const ENCODED_AT = /([A-Za-z0-9._+-])%40(?=[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,})/gi;
/** "+972 50 000 0000", "+995555123456", "(+972) 50-000-0000". */
const INTERNATIONAL_PHONE = /\+\(?\d{1,3}\)?(?:[\s.-]?\d){7,14}/g;
/** "972-50-123-4567", "995 555 12 34 56": a country code of the site's numbers without the "+". */
const COUNTRY_PHONE = /(?<![\d+])(?:972|995)[-\s.]?\d(?:[-\s.]?\d){7,9}(?!\d)/g;
/** Israeli national numbers: "050-123-4567", "054 123 4567", "02-123-4567". */
const IL_NATIONAL_PHONE = /(?<![\d.])0(?:[2-489]|5\d|7\d)[-\s.]?\d{3}[-\s.]?\d{4}(?![\d.])/g;
/** Georgian mobile numbers: "555 12 34 56", "555-12-34-56", "555.12.34.56". */
const GE_NATIONAL_PHONE = /(?<![\d.])5\d{2}(?:[-\s.]?\d{2}){3}(?![\d.])/g;
/** A bare run of 9–15 digits (a national or E.164 number without "+"). */
const DIGIT_RUN = /(?<![\w.])\d{9,15}(?![\w.])/g;
/**
 * "code: 123456", "the code is 482913", "OTP 1234", "OTP sent: 482913", "your login code for
 * Bayit: 482913" (up to three words in between), "קוד 482913", JSON "code":"123456" (not "code
 * P2002", not "status code 500").
 */
const LOGIN_CODE =
  /(?<![A-Za-z])(code|otp|pin|passcode|verification|קוד)((?:\s+(?:is|was)\s+|[\s:="'#-]){1,6}(?:[A-Za-z\u0590-\u05FF]+(?:\s+(?:is|was)\s+|[\s:="'#-]){1,6}){0,3})(\d{4,8})(?!\d)/gi;
/** The word for "code" in the other site languages, a few words before the digits ("הקוד שלך: 482913"). */
const LOGIN_CODE_LOCAL = /(קוד|код|رمز|კოდ)([^\d\n]{0,24}?)(\d{4,8})(?!\d)/gi;
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(?![\d.])/g;
/** IPv6, full or with "::" ("2001:db8::1", "::1", "2a02:6b8:0:1::1f"); not "12:30:45" or "std::x". */
const H = "[0-9a-f]{1,4}";
const IPV6 = new RegExp(
  `(?<![:\\w.])(?:(?:${H}:){7}${H}|(?:${H}:){1,7}:(?!:)|(?:${H}:){1,6}:${H}|(?:${H}:){1,5}(?::${H}){1,2}|(?:${H}:){1,4}(?::${H}){1,3}|(?:${H}:){1,3}(?::${H}){1,4}|(?:${H}:){1,2}(?::${H}){1,5}|${H}:(?::${H}){1,6}|:(?::${H}){1,7})(?![:\\w])`,
  "gi",
);
/** An exact coordinate: 5 decimals and more is about a metre. */
const COORDINATE = /(?<![\d.])-?\d{1,3}\.\d{5,}(?![\d])/g;
const AUTH_HEADER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;
/** "postgresql://user:password@host" → "postgresql://***@host". */
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi;
/** "?token=abc&phone=…" → "?token=…&phone=…" (search text, tokens and phones live in queries). */
const QUERY_VALUE = /([?&][A-Za-z0-9_.[\]-]{1,40}=)[^&#\s"'<>]+/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
/** 32+ characters of base64url / hex with at least one digit and one letter: a session token, an iCal token, a hash. */
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;
/**
 * A Prisma error that repeats the call: "Invalid `prisma.booking.create()` invocation[ in\n<file>:L:C]:"
 * then the arguments (or the code frame with them), then a blank line and the reason.
 */
const PRISMA_INVOCATION = /(Invalid `[^`\n]{1,160}` invocation)(?!: \[arguments removed\])[^\n]*(?:\n(?!\n)[^\n]*:\d+:\d+)?\n([\s\S]*)/g;

/** Keys of personal data in any text: `guestName: "Noa"`, `"messageToHost":"…"`, `phone='…'`. */
const TEXT_KEY =
  "e-?mail|\\w*Email|phone\\w*|\\w*Phone(?:Number)?|address|\\w*Address|street|name|firstName|lastName|fullName|guestName|messageToHost|cancelReason|details|note|notes|body|message|token|\\w*Token|password|secret|otp|cookie|authorization";
const QUOTED_PAIR = new RegExp(`(["']?)\\b(${TEXT_KEY})\\1(\\s*[:=]\\s*)(?:"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')`, "gi");

/** Object keys whose value is personal data or a secret, whatever it looks like. */
const SENSITIVE_KEY =
  /^(?:e-?mail|.*Email|phone.*|.*Phone(?:Number)?|address|.*Address|street|name|firstName|lastName|fullName|lat|lng|latitude|longitude|token|.*Token|password|.*Password|secret|.*Secret|otp|cookie|cookies|set-cookie|authorization|proxy-authorization|apiKey|.*ApiKey|guestName|messageToHost|cancelReason|details|note|notes|body|contactMethods|x-forwarded-for|x-real-ip|cf-connecting-ip|true-client-ip|x-client-ip|forwarded)$/i;

/** "noa@example.com" → "n***@e…". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email[at + 1] ?? ""}…`;
}

/** "+995555123456" → "+99•••••••56": the start of the country code and the last two digits. */
function maskPhoneText(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "[phone]";
  return `${phone.trim().startsWith("+") ? "+" : ""}${digits.slice(0, 2)}${"•".repeat(digits.length - 4)}${digits.slice(-2)}`;
}

/** The argument dump of a Prisma "Invalid `…()` invocation" error, removed (only the reason stays). */
function collapsePrismaDump(text: string): string {
  return text.replace(PRISMA_INVOCATION, (_all, head: string, rest: string) => {
    const lastBreak = rest.lastIndexOf("\n\n");
    const tail = lastBreak >= 0 ? rest.slice(lastBreak + 2) : "";
    return `${head}: [arguments removed]${tail ? `\n\n${tail}` : ""}`;
  });
}

/** One string with personal data and secrets masked. Idempotent. */
export function scrubText(text: string): string {
  if (!text) return text;
  return collapsePrismaDump(text)
    .replace(QUOTED_PAIR, (_m, q: string, key: string, sep: string) => `${q}${key}${q}${sep}"[redacted]"`)
    .replace(URL_CREDENTIALS, "$1***@")
    .replace(AUTH_HEADER, "$1 [token]")
    .replace(JWT, "[token]")
    .replace(ENCODED_AT, "$1@")
    .replace(EMAIL, (match) => maskEmail(match))
    .replace(QUERY_VALUE, "$1…")
    .replace(LOGIN_CODE, "$1$2[code]")
    .replace(LOGIN_CODE_LOCAL, "$1$2[code]")
    .replace(INTERNATIONAL_PHONE, (match) => maskPhoneText(match))
    .replace(COUNTRY_PHONE, (match) => maskPhoneText(match))
    .replace(IL_NATIONAL_PHONE, (match) => maskPhoneText(match))
    .replace(GE_NATIONAL_PHONE, (match) => maskPhoneText(match))
    .replace(DIGIT_RUN, (match) => maskPhoneText(match))
    .replace(IPV4, "$1.$2.x.x")
    .replace(IPV6, "[ip]")
    .replace(COORDINATE, "[coord]")
    .replace(LONG_TOKEN, (match) => (/\d/.test(match) && /[A-Za-z]/.test(match) ? "[token]" : match));
}

const MAX_DEPTH = 6;
const MAX_KEYS = 200;

function scrubError(error: Error, seen: WeakSet<object>, depth: number): Error {
  const copy = new Error(scrubText(error.message));
  copy.name = error.name;
  copy.stack = error.stack ? scrubText(error.stack) : undefined;
  for (const key of Object.keys(error).slice(0, MAX_KEYS)) {
    if (key === "message" || key === "stack" || key === "name") continue;
    (copy as unknown as Record<string, unknown>)[key] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : scrubInner((error as unknown as Record<string, unknown>)[key], seen, depth + 1);
  }
  if ("cause" in error && error.cause !== undefined) {
    (copy as Error & { cause?: unknown }).cause = scrubInner(error.cause, seen, depth + 1);
  }
  return copy;
}

function scrubInner(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth > MAX_DEPTH) return "[…]";
  seen.add(value);
  if (value instanceof Error) return scrubError(value, seen, depth);
  if (value instanceof Date || value instanceof RegExp) return value;
  if (value instanceof URL) return scrubText(value.toString());
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => scrubInner(item, seen, depth + 1));
  if (value instanceof Map) return new Map([...value].slice(0, MAX_KEYS).map(([k, v]) => [k, SENSITIVE_KEY.test(String(k)) ? "[redacted]" : scrubInner(v, seen, depth + 1)]));
  if (value instanceof Set) return new Set([...value].slice(0, MAX_KEYS).map((item) => scrubInner(item, seen, depth + 1)));
  const web = scrubWebObject(value, seen, depth);
  if (web !== undefined) return web;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return scrubInstance(value, seen, depth);
  return scrubEntries(Object.keys(value).map((key) => [key, (value as Record<string, unknown>)[key]]), seen, depth);
}

function scrubEntries(entries: [string, unknown][], seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of entries.slice(0, MAX_KEYS)) out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : scrubInner(v, seen, depth + 1);
  return out;
}

/** Header values: every one masked like text, cookies, credentials and client IPs redacted whole. */
function headerEntries(headers: Headers): [string, unknown][] {
  return [...headers.entries()].map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : scrubText(v)]);
}

/**
 * Headers, URLSearchParams, FormData, Request and Response print their contents through the
 * runtime's own inspector, which a plain-object scrub never reaches: they become plain objects.
 * Form fields and query values are user input, so only their names stay. Undefined for others.
 */
function scrubWebObject(value: object, seen: WeakSet<object>, depth: number): unknown {
  if (typeof Headers !== "undefined" && value instanceof Headers) return scrubEntries(headerEntries(value), seen, depth);
  if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
    return Object.fromEntries([...value.keys()].slice(0, MAX_KEYS).map((key) => [key, "…"]));
  }
  if (typeof FormData !== "undefined" && value instanceof FormData) {
    return Object.fromEntries([...value.keys()].slice(0, MAX_KEYS).map((key) => [key, "[redacted]"]));
  }
  if (typeof Request !== "undefined" && value instanceof Request) {
    return { method: value.method, url: scrubText(value.url), headers: scrubEntries(headerEntries(value.headers), seen, depth) };
  }
  if (typeof Response !== "undefined" && value instanceof Response) {
    return { status: value.status, url: scrubText(value.url), headers: scrubEntries(headerEntries(value.headers), seen, depth) };
  }
  return undefined;
}

/**
 * Another class instance (a Prisma Decimal, a stream, a library's own error-like object): kept as
 * it is when its own enumerable data holds nothing to mask (so it still prints as itself), else a
 * plain copy of that data, scrubbed, with the class name.
 */
function scrubInstance(value: object, seen: WeakSet<object>, depth: number): unknown {
  const entries = Object.keys(value)
    .slice(0, MAX_KEYS)
    .map((key): [string, unknown] => [key, (value as Record<string, unknown>)[key]]);
  const scrubbed = scrubEntries(entries, seen, depth);
  const changed = entries.some(([key, v]) => SENSITIVE_KEY.test(key) || (typeof v === "string" && scrubText(v) !== v) || (v !== null && typeof v === "object" && scrubbed[key] !== v));
  if (!changed) return value;
  const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return { "[class]": typeof name === "string" && name ? name : "Object", ...scrubbed };
}

/** A log argument with personal data and secrets masked (strings, errors, plain objects, arrays). */
export function scrubValue(value: unknown): unknown {
  return scrubInner(value, new WeakSet(), 0);
}

const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;
const INSTALLED = Symbol.for("bayit.logScrubber");

/**
 * Wraps console.log/info/warn/error/debug/trace so every argument goes through scrubValue first.
 * Idempotent (a second call does nothing). Never throws: an argument the scrubber cannot handle is
 * replaced by "[unloggable]" rather than printed raw.
 */
export function installLogScrubber(target: Console = console): boolean {
  const flagged = target as Console & { [INSTALLED]?: boolean };
  if (flagged[INSTALLED]) return false;
  for (const method of METHODS) {
    const original = target[method];
    if (typeof original !== "function") continue;
    target[method] = function scrubbedLog(this: unknown, ...args: unknown[]) {
      let safe: unknown[];
      try {
        safe = args.map(scrubValue);
      } catch {
        safe = ["[unloggable]"];
      }
      return (original as (...a: unknown[]) => void).apply(this ?? target, safe);
    } as Console[typeof method];
  }
  Object.defineProperty(target, INSTALLED, { value: true, enumerable: false });
  return true;
}
