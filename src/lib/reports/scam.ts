/**
 * "דיווח על הונאה" — the one-tap scam report (SECURITY_REPORT 14.2.c, 14.4.c). Client-safe: the
 * form and the server action (./scam-actions.ts) share the schema and the rules.
 *
 * The button on the listing page, the trip page and the booking emails links to
 * /help/report-scam with the listing (and, from a trip, the booking) filled in and "scam" chosen.
 * It works for everyone:
 *   - a signed-in account reporting a listing → a Report (reason ASKED_MONEY_UPFRONT, URGENT, the
 *     top of Admin → Reports), one open per reporter and listing;
 *   - a visitor, or a fake-Bayit-site report, or no listing → a SCAM_REPORT support ticket (URGENT,
 *     Admin → Support), with the visitor's name and email so the team can answer.
 * Both are behind the invisible CAPTCHA and rate-limited (per IP for everyone, per account too).
 */
import { z } from "zod";
import { locales } from "@/config/site";

/** What happened, in the order the form shows them. */
export const SCAM_KINDS = ["asked_to_pay", "card_or_code", "fake_site", "other"] as const;
export type ScamKind = (typeof SCAM_KINDS)[number];

export const SCAM_DETAILS_MIN = 10;
export const SCAM_DETAILS_MAX = 2000;
export const SCAM_SITE_MAX = 300;

/** Rate limits (SECURITY_REPORT 14.5.c): per IP for everyone, per account on top. */
export const SCAM_REPORT_LIMITS = {
  ip: { limit: 5, windowSeconds: 3600 },
  account: { limit: 5, windowSeconds: 24 * 3600 },
} as const;

/** The page the scam button opens (locale-less: Link / absoluteUrl add it). */
export const SCAM_REPORT_PATH = "/help/report-scam";

/** /help/report-scam?listing=123&booking=ABC-123 (only the parts given). */
export function scamReportHref(params: { listing?: number | null; booking?: string | null } = {}): string {
  const query = new URLSearchParams();
  if (params.listing) query.set("listing", String(params.listing));
  if (params.booking) query.set("booking", params.booking);
  return query.size ? `${SCAM_REPORT_PATH}?${query.toString()}` : SCAM_REPORT_PATH;
}

const optionalTrimmed = (max: number, error: string) =>
  z
    .string()
    .max(max, error)
    .nullish()
    .transform((v) => v?.trim() || null);

export const scamReportSchema = z
  .object({
    kind: z.enum(SCAM_KINDS, { error: "kind_required" }),
    /** The listing number (publicId), when the report is about a listing. */
    listing: z.number().int().min(1).max(2_147_483_647).nullish(),
    /** The booking code, from a trip page or a booking email (only the guest's own booking counts). */
    booking: optionalTrimmed(40, "invalid"),
    details: z
      .string({ error: "details_short" })
      .trim()
      .min(SCAM_DETAILS_MIN, "details_short")
      .max(SCAM_DETAILS_MAX, "details_long"),
    /** The fake site's address, as the visitor typed it (stored and shown as text only). */
    site: optionalTrimmed(SCAM_SITE_MAX, "site_long"),
    /** Visitors only (signed-in accounts are answered in their account). */
    name: optionalTrimmed(80, "name_long"),
    email: optionalTrimmed(254, "email_invalid").pipe(z.email("email_invalid").nullable()),
    /** Honeypot: hidden from people, bots fill it in. */
    website: z.string().max(500).optional().default(""),
    turnstileToken: z.string().max(2048).nullish(),
    locale: z.enum(locales),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "fake_site" && !value.site) ctx.addIssue({ code: "custom", path: ["site"], message: "site_required" });
  });

export type ScamReportInput = z.input<typeof scamReportSchema>;

/** Field error keys the form shows (help.scamReport.fieldErrors.<key>). */
export const SCAM_FIELD_ERRORS = [
  "kind_required",
  "details_short",
  "details_long",
  "site_required",
  "site_long",
  "name_required",
  "name_long",
  "email_invalid",
  "email_required",
] as const;

/**
 * Where the report goes: a Report about the listing for a signed-in account (not a fake-site
 * report), a support ticket otherwise.
 */
export function scamReportTarget(input: { signedIn: boolean; kind: ScamKind; hasListing: boolean }): "report" | "ticket" {
  return input.signedIn && input.hasListing && input.kind !== "fake_site" ? "report" : "ticket";
}
