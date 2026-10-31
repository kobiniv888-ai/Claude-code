import "server-only";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { decryptString, encryptString } from "@/lib/crypto";
import { db } from "@/lib/db";
import { TOTP_PERIOD_SECONDS, TOTP_WINDOW, generateTotpSecret, matchingCounter, totpUri } from "./totp";

export { TOTP_CODE_PATTERN } from "./totp";

/**
 * 2-step login with an authenticator app (TOTP — see ./totp.ts).
 *
 * Secrets are stored encrypted (APP_ENCRYPTION_KEY). A pending secret waits in the Verification
 * table for 15 minutes until the user confirms it with a first code. Each accepted code is
 * remembered so the same code cannot be used twice.
 *
 * These functions do not check the session — the server actions in ./actions.ts do.
 */

const ENROLLMENT_TTL_MS = 15 * 60 * 1000;

const enrollmentKey = (userId: string) => `totp-enroll:${userId}`;
const lastUsedKey = (userId: string) => `totp-last:${userId}`;

/**
 * Accepts a code once: false when it is wrong or was already used (replay).
 * Stores the time step of the accepted code.
 */
async function acceptCode(userId: string, secretBase32: string, code: string): Promise<boolean> {
  const counter = matchingCounter(secretBase32, code);
  if (counter === null) return false;

  const identifier = lastUsedKey(userId);
  const previous = await db.verification.findFirst({
    where: { identifier },
    orderBy: { createdAt: "desc" },
    select: { value: true },
  });
  if (previous && Number(previous.value) >= counter) return false;

  await db.$transaction([
    db.verification.deleteMany({ where: { identifier } }),
    db.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: String(counter),
        // Only needs to outlive the validation window.
        expiresAt: new Date(Date.now() + (TOTP_WINDOW * 2 + 2) * TOTP_PERIOD_SECONDS * 1000),
      },
    }),
  ]);
  return true;
}

/** What the authenticator app shows next to the codes, e.g. "+995 555 12 34 56". */
export function totpLabel(user: { phoneNumber: string | null; email: string; emailIsPlaceholder: boolean; name: string }) {
  return user.phoneNumber ?? (user.emailIsPlaceholder ? user.name : user.email);
}

export type TotpEnrollment = {
  /** otpauth://totp/… — the QR code content. */
  otpauthUrl: string;
  /** PNG data URL of the QR code. */
  qrDataUrl: string;
  /** Base32 key for typing into the app by hand. */
  secret: string;
};

/** Creates (or replaces) a pending secret for the user. */
export async function beginTotpEnrollment(userId: string, label: string): Promise<TotpEnrollment> {
  const secret = generateTotpSecret();
  const otpauthUrl = totpUri(secret, label);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  const identifier = enrollmentKey(userId);
  await db.$transaction([
    db.verification.deleteMany({ where: { identifier } }),
    db.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: encryptString(secret),
        expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
      },
    }),
  ]);

  return { otpauthUrl, qrDataUrl, secret };
}

export type ConfirmResult = "enabled" | "wrong_code" | "expired";

/** Checks the first code against the pending secret, then turns 2-step login on. */
export async function confirmTotpEnrollment(
  userId: string,
  sessionId: string,
  code: string,
): Promise<ConfirmResult> {
  const identifier = enrollmentKey(userId);
  const pending = await db.verification.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { value: true },
  });
  if (!pending) return "expired";

  const secret = decryptString(pending.value);
  if (!(await acceptCode(userId, secret, code))) return "wrong_code";

  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, totpSecret: encryptString(secret) },
    }),
    // The session that set it up counts as verified; the user's other sessions must verify.
    db.session.updateMany({ where: { id: sessionId, userId }, data: { twoFactorVerifiedAt: now } }),
    db.session.updateMany({
      where: { userId, id: { not: sessionId } },
      data: { twoFactorVerifiedAt: null },
    }),
    db.verification.deleteMany({ where: { identifier } }),
  ]);
  return "enabled";
}

async function storedSecret(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, totpSecret: true },
  });
  if (!user?.twoFactorEnabled || !user.totpSecret) return null;
  return decryptString(user.totpSecret);
}

/** Checks a code for an account with 2-step login on and marks this session as verified. */
export async function verifyTotpSession(userId: string, sessionId: string, code: string): Promise<boolean> {
  const secret = await storedSecret(userId);
  if (!secret || !(await acceptCode(userId, secret, code))) return false;
  await db.session.updateMany({
    where: { id: sessionId, userId },
    data: { twoFactorVerifiedAt: new Date() },
  });
  return true;
}

/** Turns 2-step login off after checking a current code. */
export async function disableTotpWithCode(userId: string, code: string): Promise<boolean> {
  const secret = await storedSecret(userId);
  if (!secret || !(await acceptCode(userId, secret, code))) return false;
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, totpSecret: null },
  });
  return true;
}
