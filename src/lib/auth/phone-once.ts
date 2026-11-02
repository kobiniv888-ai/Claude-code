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

export type PhoneCheckStep = "already_verified" | "phone_taken" | "send";

/**
 * What to do when an account asks for a code to `phoneNumber`:
 * - "already_verified": it is this account's verified number. Send nothing.
 * - "phone_taken": another account has it. Send nothing (an SMS would be wasted).
 * - "send": send a code.
 */
export function phoneCheckStep(
  account: PhoneAccount,
  phoneNumber: string,
  { usedByAnotherAccount }: { usedByAnotherAccount: boolean },
): PhoneCheckStep {
  if (isPhoneAlreadyVerified(account, phoneNumber)) return "already_verified";
  if (usedByAnotherAccount) return "phone_taken";
  return "send";
}
