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
 *    It masks emails, phone numbers, login codes next to the word "code", IP addresses, exact
 *    coordinates (5+ decimals), bearer/basic credentials, credentials inside connection strings,
 *    URL query values, JWTs and long random tokens; object keys that name personal data
 *    (email, phone, address, lat/lng, token, password, secret, cookie…) are replaced whole.
 *
 * Street addresses cannot be recognised in free text, so they are kept out by layer 1 (and the
 * exact address is never selected outside the guest's own trip and the host's own pages).
 *
 * Pure and dependency-free: safe in the Node.js and Edge runtimes and in tests.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+)(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** "+972 50 000 0000", "+995555123456", "(+972) 50-000-0000". */
const INTERNATIONAL_PHONE = /\+\(?\d{1,3}\)?(?:[\s.-]?\d){7,14}/g;
/** A bare run of 9–15 digits (a national or E.164 number without "+"). */
const DIGIT_RUN = /(?<![\w.])\d{9,15}(?![\w.])/g;
/** "code: 123456", "the code is 482913", "OTP 1234", "קוד 482913", JSON "code":"123456" (not "code P2002"). */
const LOGIN_CODE = /(?<![A-Za-z])(code|otp|pin|passcode|verification|קוד)((?:\s+(?:is|was)\s+|[\s:="'#-]){1,6})(\d{4,8})(?!\d)/gi;
/** The word for "code" in the other site languages, a few words before the digits ("הקוד שלך: 482913"). */
const LOGIN_CODE_LOCAL = /(קוד|код|رمز|კოდ)([^\d\n]{0,24}?)(\d{4,8})(?!\d)/gi;
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(?![\d.])/g;
const IPV6 = /(?<![:\w])(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}(?![:\w])/gi;
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

/** Object keys whose value is personal data or a secret, whatever it looks like. */
const SENSITIVE_KEY =
  /^(?:e-?mail|.*Email|phone.*|.*Phone(?:Number)?|address|.*Address|lat|lng|latitude|longitude|token|.*Token|password|.*Password|secret|.*Secret|otp|cookie|cookies|authorization|apiKey|.*ApiKey|guestName|contactMethods)$/i;

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

/** One string with personal data and secrets masked. Idempotent. */
export function scrubText(text: string): string {
  if (!text) return text;
  return text
    .replace(URL_CREDENTIALS, "$1***@")
    .replace(AUTH_HEADER, "$1 [token]")
    .replace(JWT, "[token]")
    .replace(EMAIL, (match) => maskEmail(match))
    .replace(QUERY_VALUE, "$1…")
    .replace(LOGIN_CODE, "$1$2[code]")
    .replace(LOGIN_CODE_LOCAL, "$1$2[code]")
    .replace(INTERNATIONAL_PHONE, (match) => maskPhoneText(match))
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
    if (key === "message" || key === "stack") continue;
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
  // Buffers, typed arrays, streams, class instances with their own printing: leave the shape, scrub plain data only.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : scrubInner((value as Record<string, unknown>)[key], seen, depth + 1);
  }
  return out;
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
