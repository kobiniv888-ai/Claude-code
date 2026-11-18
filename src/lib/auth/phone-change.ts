import "server-only";
import { hostContactFor } from "@/lib/booking/reveal";
import { notifyGuestsOfContactChange } from "@/lib/contact/changed-server";
import { db } from "@/lib/db";
import { endOtherSessions } from "./account-sessions";
import { consumeFreshProof } from "./fresh-proof";
import { maskPhone } from "./fresh-proof-rules";
import { notifySecurityChange } from "./security-notices";

/**
 * After the account's verified phone number was replaced (SECURITY_REPORT 3.5.e, 3.6.d): every
 * other session ends, the fresh code is used up, and the account's email is told "If this wasn't
 * you…" with the new number masked. Called by the phone check (./phone-check-actions.ts), which
 * asked for the fresh code before sending the SMS (`isPhoneReplacement`, ./fresh-proof-rules.ts).
 *
 * A live listing without a phone-type contact method shows guests the host's ACCOUNT phone
 * (src/lib/booking/reveal.ts hostContactFor). For those, the replaced number is a contact change
 * like one made in the post form (SECURITY_REPORT 14.3.c, S2 review TS-12): contactChangedAt is
 * set and each guest with an upcoming booking gets the "contact details changed" email.
 */
export async function afterPhoneChanged(input: { userId: string; sessionId: string; newPhone: string }): Promise<number> {
  const ended = await endOtherSessions(input.userId, input.sessionId);
  await consumeFreshProof(input.sessionId);
  await notifySecurityChange({ userId: input.userId, kind: "phone", masked: maskPhone(input.newPhone) });
  await markAccountPhoneContactChange(input.userId);
  return ended;
}

/**
 * The account phone changed: the owner's LIVE listings whose guests see that phone (no phone,
 * WhatsApp, Viber or SMS method of their own) get contactChangedAt = now and the guests' email.
 * Returns the listing ids. Never throws (logged): the phone change itself is already done.
 */
export async function markAccountPhoneContactChange(userId: string, now: Date = new Date()): Promise<string[]> {
  try {
    const listings = await db.listing.findMany({
      where: { ownerId: userId, status: "LIVE", deletedAt: null },
      select: { id: true, contactMethods: true },
      take: 500,
    });
    // Without the owner's phone, does the listing give guests a number of its own? (A number saved
    // without a country code counts as none here: the guests are told, never left unwarned.)
    const usesAccountPhone = listings.filter((listing) => hostContactFor(listing.contactMethods, null).phone === null).map((l) => l.id);
    if (usesAccountPhone.length === 0) return [];
    await db.listing.updateMany({ where: { id: { in: usesAccountPhone } }, data: { contactChangedAt: now } });
    for (const id of usesAccountPhone) await notifyGuestsOfContactChange(id, now);
    return usesAccountPhone;
  } catch (error) {
    console.error("[auth] contact-change after a phone change failed:", (error as Error)?.name ?? "error");
    return [];
  }
}
