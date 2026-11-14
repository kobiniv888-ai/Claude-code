import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  TERMS_REQUIRED,
  TERMS_VERSION,
  termsConsentGiven,
  termsNeeded,
  type LatestAcceptance,
  type TermsPurpose,
} from "./terms";

/**
 * The Terms acceptance log on the server (SECURITY_REPORT 15.11.b/c, D4; the rules are pure in
 * ./terms.ts). Used by the login's "terms" step (./actions.ts), the booking action
 * (src/lib/booking/actions.ts) and the publish action (src/lib/wizard/actions.ts).
 *
 *   await requireTermsFor(user.id, "booking", input);   // throws TermsRequiredError → "terms_required"
 */

/** A booking or publish without the acceptance it needs. Maps to fail("terms_required"). */
export class TermsRequiredError extends AppError {
  constructor() {
    super(TERMS_REQUIRED, "Accept the Terms of use and confirm you are 18 or older first", { status: 403 });
  }
}

type Client = Pick<typeof db, "termsAcceptance" | "booking" | "listing">;

/** The account's newest acceptance, or null. */
export async function latestAcceptance(userId: string, client: Client = db): Promise<LatestAcceptance> {
  const row = await client.termsAcceptance.findFirst({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
    select: { version: true, ageConfirmed: true },
  });
  return row ?? null;
}

/**
 * Is this the account's first booking (it never made one, whatever happened to it since) or its
 * first listing publish (no listing of it ever left the draft state)?
 */
async function isFirst(userId: string, purpose: TermsPurpose, client: Client): Promise<boolean> {
  if (purpose === "booking") return (await client.booking.count({ where: { guestUserId: userId } })) === 0;
  if (purpose === "publish") return (await client.listing.count({ where: { ownerId: userId, NOT: { status: "DRAFT" } } })) === 0;
  return false;
}

/** Must this account tick the Terms + 18+ box before `purpose`? */
export async function termsNeededFor(userId: string, purpose: TermsPurpose, client: Client = db): Promise<boolean> {
  const [latest, first] = await Promise.all([latestAcceptance(userId, client), isFirst(userId, purpose, client)]);
  return termsNeeded({ purpose, latest, first });
}

/** Logs one acceptance of the Terms in force, with the 18+ confirmation. */
export async function recordTermsAcceptance(userId: string, client: Pick<typeof db, "termsAcceptance"> = db): Promise<void> {
  await client.termsAcceptance.create({ data: { userId, version: TERMS_VERSION, ageConfirmed: true } });
}

/**
 * The server-side rule for a booking or a publish: when the acceptance is needed, the request must
 * carry the ticked box (`{ termsAccepted: true, ageConfirmed: true }`), which is then logged;
 * otherwise TermsRequiredError. A database error throws (the action fails closed).
 */
export async function requireTermsFor(userId: string, purpose: TermsPurpose, input: unknown, client: Client = db): Promise<{ recorded: boolean }> {
  if (!(await termsNeededFor(userId, purpose, client))) return { recorded: false };
  if (!termsConsentGiven(input)) throw new TermsRequiredError();
  await recordTermsAcceptance(userId, client);
  return { recorded: true };
}
