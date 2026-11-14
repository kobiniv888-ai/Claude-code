import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomInt } from "node:crypto";

/**
 * Founder's answer (5), 9 Nov 2026: a phone-check code request gets the SAME answer whether or not
 * the number belongs to another account (same text, same status, comparable timing; no "number
 * already used"; this replaces the earlier Q5 A).
 *
 * How (./phone-check-actions.ts sendPhoneCheckCode): when another account already has the number,
 * the request still runs the whole Better Auth send — the same Turnstile check, number rules,
 * resend waits and daily caps per number / IP / device (the auth hook in ./server.ts), and a code
 * is stored under the number with its 10 minutes and 5 tries — inside withNeutralPhoneSend. The
 * plugin's sendOTP then sends NOTHING to that number (no SMS cost, no text to a stranger's phone,
 * no SMS budget used) and waits a random NEUTRAL_SEND_DELAY_MS instead of the provider's round
 * trip. The answer is "sent". Nobody receives the code, so the check simply fails as a wrong code
 * ("invalid_code", or "too_many_attempts" after 5), exactly like a mistyped code; and even a code
 * guessed right ends as "invalid_code", never "taken" (confirmPhoneCheckCode). The owner of the
 * number is not texted. In test mode (codes on screen, development / staging only) the screen
 * shows no code for such a number.
 */

const neutralStore = new AsyncLocalStorage<boolean>();

/** Run a phone code send that must store the code and charge every limit, but send nothing. */
export function withNeutralPhoneSend<T>(neutral: boolean, fn: () => Promise<T>): Promise<T> {
  return neutralStore.run(neutral, fn);
}

/** Inside a neutral send (./server.ts sendOTP skips the text). */
export function isNeutralPhoneSend(): boolean {
  return neutralStore.getStore() === true;
}

/** About what a provider round trip takes (Twilio Messaging answers in a few hundred ms). */
export const NEUTRAL_SEND_DELAY_MS = { min: 250, max: 750 } as const;

/** Wait like a real send would (random within NEUTRAL_SEND_DELAY_MS; 0 in unit tests when asked). */
export async function neutralSendDelay(): Promise<void> {
  if (process.env.NEUTRAL_SEND_DELAY === "0") return;
  const ms = randomInt(NEUTRAL_SEND_DELAY_MS.min, NEUTRAL_SEND_DELAY_MS.max + 1);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
