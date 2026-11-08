/**
 * "Prove it's you" before a sensitive change (SECURITY_REPORT 3.6.a/b, 3.3.c; checklist 3.6).
 * Pure rules, unit-tested; the database side is ./fresh-proof.ts, the actions
 * ./fresh-proof-actions.ts, the dialog src/components/auth/fresh-proof-dialog.tsx.
 *
 * A FRESH PROOF is a code entered in this session within the last FRESH_PROOF_TTL_MS: a 6-digit
 * code we email to the account's login address, or the authenticator code (2-step login). Logging
 * in with an email code counts too (it is one), for the same 5 minutes. Google never counts.
 * It is kept per session in the Verification table ("fresh-proof:<sessionId>", no schema change).
 *
 * Needed for: changing the contact email, the phone number or the login methods (connect or
 * remove Google/Apple), turning on or changing 2-step login, new recovery codes, deleting the
 * account.
 *
 * SECURITY CODES (the emailed ones): 6 digits from a secure random generator, stored only as an
 * HMAC (HASH_SALT), valid 10 minutes (founder's decision 3), single use, compared in constant time,
 * dead after 5 wrong tries. Resending waits 60 s, then 120 s, 300 s and 900 s; at most 10 a day
 * per account and 30 a day per IP (Q7).
 */

export const FRESH_PROOF_TTL_MS = 5 * 60 * 1000;
export const SECURITY_CODE_TTL_MS = 10 * 60 * 1000;
export const SECURITY_CODE_MAX_ATTEMPTS = 5;
export const SECURITY_CODE_PATTERN = /^\d{6}$/;
/** Waits before the 2nd, 3rd, 4th and every later code of a row (seconds). */
export const RESEND_WAITS_SECONDS = [60, 120, 300, 900] as const;
export const SECURITY_CODES_PER_DAY_ACCOUNT = 10;
export const SECURITY_CODES_PER_DAY_IP = 30;

/** What an emailed security code is for. */
export const SECURITY_CODE_PURPOSES = ["confirm", "unlock", "contact"] as const;
export type SecurityCodePurpose = (typeof SECURITY_CODE_PURPOSES)[number];

/** How a fresh proof was given. */
export type ProofMethod = "email_code" | "totp" | "login_code";

export const freshProofKey = (sessionId: string) => `fresh-proof:${sessionId}`;
export const securityCodeKey = (userId: string, purpose: SecurityCodePurpose) => `security-code:${purpose}:${userId}`;

/** Is a proof stored with this expiry still fresh? */
export function isProofFresh(expiresAt: Date | null | undefined, now: Date): boolean {
  return !!expiresAt && expiresAt.getTime() > now.getTime();
}

/** The wait before the next code, after `sent` codes in this row (0 → no wait). */
export function resendWaitSeconds(sent: number): number {
  if (sent <= 0) return 0;
  return RESEND_WAITS_SECONDS[Math.min(sent, RESEND_WAITS_SECONDS.length) - 1]!;
}

/** Seconds left before another code may be sent (0 = now). */
export function secondsUntilResend(state: { sent: number; lastSentAt: number } | null, now: number): number {
  if (!state) return 0;
  const readyAt = state.lastSentAt + resendWaitSeconds(state.sent) * 1000;
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}

/**
 * The stored value of a security code row: "<hmac>:<wrong tries>:<codes sent>:<last sent ms>".
 * The send count is kept across new codes, so the growing waits work (it resets after a day).
 */
export type SecurityCodeState = { hash: string; attempts: number; sent: number; lastSentAt: number };

export function encodeSecurityCode(state: SecurityCodeState): string {
  return [state.hash, state.attempts, state.sent, state.lastSentAt].join(":");
}

export function decodeSecurityCode(value: string | null | undefined): SecurityCodeState | null {
  const parts = (value ?? "").split(":");
  if (parts.length !== 4 || !/^[0-9a-f]{64}$/.test(parts[0]!)) return null;
  const [attempts, sent, lastSentAt] = parts.slice(1).map((part) => Number.parseInt(part, 10));
  if (![attempts, sent, lastSentAt].every((n) => Number.isFinite(n) && n! >= 0)) return null;
  return { hash: parts[0]!, attempts: attempts!, sent: sent!, lastSentAt: lastSentAt! };
}

/** "da***@example.com": enough to recognise the address, not enough to learn it. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().split("@");
  if (!domain) return "***";
  const head = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${head}***@${domain}`;
}

/** "+972 *** ** 34": the country code and the last two digits only. */
export function maskPhone(e164: string | null | undefined): string {
  const digits = (e164 ?? "").replace(/[^\d]/g, "");
  if (digits.length < 6) return "***";
  const country = digits.startsWith("972") || digits.startsWith("995") ? digits.slice(0, 3) : digits.slice(0, 2);
  return `+${country} *** ** ${digits.slice(-2)}`;
}

/**
 * Is verifying `next` a CHANGE of the account's phone (a verified number replaced by another)?
 * A first number (a guest's first booking, a new host) is not: it needs no fresh code.
 */
export function isPhoneReplacement(user: { phoneNumber: string | null; phoneNumberVerified: boolean }, next: string): boolean {
  return user.phoneNumberVerified && !!user.phoneNumber && user.phoneNumber !== next;
}
