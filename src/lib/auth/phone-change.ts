import "server-only";
import { endOtherSessions } from "./account-sessions";
import { consumeFreshProof } from "./fresh-proof";
import { maskPhone } from "./fresh-proof-rules";
import { notifySecurityChange } from "./security-notices";

/**
 * After the account's verified phone number was replaced (SECURITY_REPORT 3.5.e, 3.6.d): every
 * other session ends, the fresh code is used up, and the account's email is told "If this wasn't
 * you…" with the new number masked. Called by the phone check (./phone-check-actions.ts), which
 * asked for the fresh code before sending the SMS (`isPhoneReplacement`, ./fresh-proof-rules.ts).
 */
export async function afterPhoneChanged(input: { userId: string; sessionId: string; newPhone: string }): Promise<number> {
  const ended = await endOtherSessions(input.userId, input.sessionId);
  await consumeFreshProof(input.sessionId);
  await notifySecurityChange({ userId: input.userId, kind: "phone", masked: maskPhone(input.newPhone) });
  return ended;
}
