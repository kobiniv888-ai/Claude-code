/**
 * "Once per number" (founder rule, redesign round 2): SMS codes are only for a guest's booking and
 * a host's phone check, and an account that already has a number verified never gets another code
 * for it. Pure, so the rule is unit-tested; the server actions in ./phone-check-actions.ts use it.
 */

export type PhoneAccount = {
  phoneNumber: string | null;
  phoneNumberVerified: boolean | null;
};

/** The account's verified number, or null. */
export function verifiedPhoneOf(account: PhoneAccount): string | null {
  return account.phoneNumber && account.phoneNumberVerified === true ? account.phoneNumber : null;
}

/** True when `phoneNumber` (E.164) is already verified on this account: never send it a code. */
export function isPhoneAlreadyVerified(account: PhoneAccount, phoneNumber: string): boolean {
  return verifiedPhoneOf(account) === phoneNumber;
}

export type PhoneCheckStep = "already_verified" | "send" | "send_neutral";

/**
 * What to do when an account asks for a code to `phoneNumber`:
 * - "already_verified": it is this account's verified number (only this account's own state is
 *   revealed). Send nothing.
 * - "send_neutral": another account has it. Founder's answer (5): the SAME answer as "send" — the
 *   code is stored and every limit charged, but no text goes out (./phone-neutral.ts), so the
 *   check fails like a wrong code. Never "number already used".
 * - "send": send a code.
 */
export function phoneCheckStep(
  account: PhoneAccount,
  phoneNumber: string,
  { usedByAnotherAccount }: { usedByAnotherAccount: boolean },
): PhoneCheckStep {
  if (isPhoneAlreadyVerified(account, phoneNumber)) return "already_verified";
  if (usedByAnotherAccount) return "send_neutral";
  return "send";
}
