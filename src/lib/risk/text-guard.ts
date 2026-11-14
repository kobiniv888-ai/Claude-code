import "server-only";
import { db } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";
import { detectPaymentInfoIn, type PaymentFindings } from "./payment-info";

/**
 * The server's block on payment details in user-written text that other people read
 * (SECURITY_REPORT 14.2.a). Every action that saves such text calls it BEFORE saving:
 *
 *   if (await refusePaymentDetails({ surface: "review", userId: user.id, texts: [text] })) {
 *     return fail("payment_in_text", { text: ["paymentInText"] });
 *   }
 *
 * On a hit it (1) answers true, so the caller refuses with its friendly message (in 5 languages,
 * each form's "paymentInText"); (2) records a `payment_details_blocked` security event (kinds and
 * surface only, never the text; at most one per account and surface per EVENT_GAP_MINUTES);
 * (3) flags the account for the admin: one open automatic report (no reporter, reason
 * ASKED_MONEY_UPFRONT, Admin → Reports) per account or listing and surface per FLAG_GAP_HOURS.
 *
 * FAILS CLOSED: the refusal stands even when the event or the flag can't be written (they are
 * best effort and logged). The text is never stored.
 *
 * Report texts are the exception (SECURITY_REPORT 14.2.c): a guest reporting a scam quotes the
 * scammer's link or IBAN as evidence, and only staff read it. Reports call reportHasPaymentDetails
 * instead, which only marks the report urgent.
 */

/** Where the text was written (the security event's `surface`, the flag's note). */
export const TEXT_SURFACES = [
  "listing_text",
  "listing_translation",
  "listing_business_name",
  "listing_kosher_cert",
  "room_type",
  "photo_alt",
  "review",
  "review_reply",
  "booking_message",
  "booking_cancel_reason",
  "list_name",
  "profile",
] as const;
export type TextSurface = (typeof TEXT_SURFACES)[number];

/** At most one security event per account and surface in this many minutes (auto-save sends many). */
export const EVENT_GAP_MINUTES = 10;
/** At most one open automatic flag per account (or listing) and surface in this many hours. */
export const FLAG_GAP_HOURS = 24;

const MINUTE = 60 * 1000;

/** The automatic report's note for staff (codes only; the samples are masked by the detector). */
export function flagNote(surface: TextSurface, findings: PaymentFindings): string {
  const samples = findings.samples.map((s) => `${s.kind}: ${s.text}`).join(" · ");
  return `auto · payment_details_blocked · surface=${surface} · ${samples}`.slice(0, 1000);
}

async function recordOnce(surface: TextSurface, userId: string, findings: PaymentFindings): Promise<void> {
  const since = new Date(Date.now() - EVENT_GAP_MINUTES * MINUTE);
  const recent = await db.securityEvent.findFirst({
    where: { type: "payment_details_blocked", userId, createdAt: { gte: since }, meta: { path: ["surface"], equals: surface } },
    select: { id: true },
  });
  if (recent) return;
  await recordSecurityEvent({ type: "payment_details_blocked", userId, meta: { surface, kinds: findings.kinds.join(","), count: findings.kinds.length } });
}

async function flagOnce(surface: TextSurface, userId: string, listingId: string | null, findings: PaymentFindings): Promise<void> {
  const since = new Date(Date.now() - FLAG_GAP_HOURS * 60 * MINUTE);
  const target = listingId ? { targetType: "LISTING" as const, listingId } : { targetType: "USER" as const, targetUserId: userId };
  const note = flagNote(surface, findings);
  const open = await db.report.findFirst({
    where: { ...target, reporterId: null, status: "OPEN", reason: "ASKED_MONEY_UPFRONT", createdAt: { gte: since }, details: { contains: `surface=${surface} ` } },
    select: { id: true },
  });
  if (open) return;
  await db.report.create({ data: { ...target, reporterId: null, reason: "ASKED_MONEY_UPFRONT", details: note, priority: "URGENT" } });
}

export type GuardInput = {
  surface: TextSurface;
  /** The writer (signed in: every surface needs an account). */
  userId: string;
  /** The listing the text belongs to, when there is one (the flag then names the listing). */
  listingId?: string | null;
  texts: readonly (string | null | undefined)[];
};

async function flag(input: Omit<GuardInput, "texts">, findings: PaymentFindings): Promise<void> {
  const results = await Promise.allSettled([
    recordOnce(input.surface, input.userId, findings),
    flagOnce(input.surface, input.userId, input.listingId ?? null, findings),
  ]);
  for (const result of results) {
    if (result.status === "rejected") console.error(`[risk] payment-details flag (${input.surface}) could not be written:`, (result.reason as Error)?.name ?? "error");
  }
}

/** True when the texts hold payment details: the caller refuses (see the module comment). */
export async function refusePaymentDetails(input: GuardInput): Promise<boolean> {
  const findings = detectPaymentInfoIn(input.texts);
  if (findings.kinds.length === 0) return false;
  await flag(input, findings);
  return true;
}

/** The field error every form shows for it (each form's "paymentInText" message, 5 languages). */
export const PAYMENT_FIELD_ERROR = "paymentInText";

/**
 * The same check per form field: the fields that hold payment details, as field errors
 * ({ description: ["paymentInText"] }), or null when there are none. One event and flag per call.
 */
export async function refusePaymentFields(
  input: Omit<GuardInput, "texts"> & { fields: Record<string, string | null | undefined> },
): Promise<Record<string, string[]> | null> {
  const errors: Record<string, string[]> = {};
  const all: PaymentFindings = { kinds: [], samples: [] };
  for (const [field, value] of Object.entries(input.fields)) {
    const found = detectPaymentInfoIn([value]);
    if (found.kinds.length === 0) continue;
    errors[field] = [PAYMENT_FIELD_ERROR];
    for (const sample of found.samples) {
      if (all.kinds.includes(sample.kind)) continue;
      all.kinds.push(sample.kind);
      all.samples.push(sample);
    }
  }
  if (all.kinds.length === 0) return null;
  await flag(input, all);
  return errors;
}

/** Reports: payment details are evidence, not refused; the report goes to the top of the queue. */
export function reportHasPaymentDetails(texts: readonly (string | null | undefined)[]): boolean {
  return detectPaymentInfoIn(texts).kinds.length > 0;
}
