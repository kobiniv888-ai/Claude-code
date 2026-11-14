"use server";

/**
 * "דיווח על הונאה" (SECURITY_REPORT 14.2.c, 14.4.c): the scam report from /help/report-scam. Public:
 * guests and visitors both, behind the invisible CAPTCHA, the honeypot and the rate limits of
 * ./scam.ts (per IP always, per account when signed in). Where a report goes is ./scam.ts
 * scamReportTarget: a signed-in account's listing report is an URGENT Report (one open per
 * reporter and listing; it counts toward hiding the listing like every report, applyReport); any
 * other is an URGENT SCAM_REPORT ticket. Payment details in the text are kept: they are the
 * evidence (src/lib/risk/text-guard.ts). The founder is told as for every report or ticket.
 */
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { linkDevice } from "@/lib/auth/hooks";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applyReport } from "@/lib/listing/lifecycle";
import { assertRateLimit, assertRateLimitByIp } from "@/lib/rate-limit";
import { createTicketRecord, sendTicketCreatedEmail } from "@/lib/tickets/server";
import { assertTurnstile } from "@/lib/turnstile";
import { notifyFounderOfReport } from "./notify";
import { SCAM_REPORT_LIMITS, scamReportSchema, scamReportTarget } from "./scam";

export type ScamReportResult = { sent: "report" | "ticket"; number: number | null };

export async function createScamReport(input: unknown): Promise<ActionResult<ScamReportResult>> {
  return runAction<ScamReportResult>(async () => {
    const parsed = scamReportSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const data = parsed.data;
    // Bots fill in the hidden field: answer as if it worked, store nothing.
    if (data.website.trim()) return ok({ sent: "ticket", number: null });

    await assertRateLimitByIp("report:scam", SCAM_REPORT_LIMITS.ip);
    await assertTurnstile(data.turnstileToken, { expectedAction: "report" });

    const current = await getCurrentUser();
    const user = current && current.twoFactorVerified ? current : null;
    if (user) await assertRateLimit(`report:scam:${user.id}`, SCAM_REPORT_LIMITS.account);
    if (!user) {
      if (!data.name || data.name.length < 2) return fail("invalid_input", { name: ["name_required"] });
      if (!data.email) return fail("invalid_input", { email: ["email_required"] });
    }

    const listing = data.listing
      ? await db.listing.findFirst({
          where: { publicId: data.listing, deletedAt: null, status: { notIn: ["DRAFT", "DELETED"] } },
          select: { id: true, publicId: true, ownerId: true, title: true },
        })
      : null;
    // A booking only from its own guest (a visitor can't name someone's booking).
    const booking =
      user && data.booking
        ? await db.booking.findFirst({ where: { code: data.booking, guestUserId: user.id }, select: { id: true, code: true, listingId: true } })
        : null;
    const about = listing ?? (booking ? await db.listing.findUnique({ where: { id: booking.listingId }, select: { id: true, publicId: true, ownerId: true, title: true } }) : null);

    const t = await getTranslations({ locale: data.locale, namespace: "help.scamReport" });
    const kindLabel = t(`kinds.${data.kind}.label`);
    const lines = [data.details, data.site ? `${t("siteLabel")}: ${data.site}` : null, booking ? `${t("bookingLabel")}: ${booking.code}` : null];
    const body = lines.filter(Boolean).join("\n\n");

    const target = scamReportTarget({ signedIn: !!user, kind: data.kind, hasListing: !!about && about.ownerId !== user?.id });
    if (target === "report" && user && about) {
      const open = await db.report.findFirst({
        where: { reporterId: user.id, status: "OPEN", targetType: "LISTING", listingId: about.id },
        select: { id: true },
      });
      if (open) return fail("already_reported");
      const report = await db.report.create({
        data: {
          targetType: "LISTING",
          listingId: about.id,
          bookingId: booking?.id ?? null,
          reporterId: user.id,
          reason: "ASKED_MONEY_UPFRONT",
          details: `${kindLabel}\n\n${body}`.slice(0, 3000),
          priority: "URGENT",
        },
        select: { id: true },
      });
      // Auto-hide counts reports per device (DeviceLink), as createReport does.
      await linkDevice(user.id);
      await applyReport(about.id);
      after(() => notifyFounderOfReport(report.id));
      return ok({ sent: "report", number: null });
    }

    const subject = about ? `${kindLabel} · #${about.publicId}` : kindLabel;
    const ticket = await createTicketRecord({
      userId: user?.id ?? null,
      guestName: user ? null : data.name,
      guestEmail: user ? null : data.email,
      category: "SCAM_REPORT",
      subject,
      body,
      listingId: about?.id ?? null,
      locale: data.locale,
    });
    await sendTicketCreatedEmail(ticket.id);
    return ok({ sent: "ticket", number: ticket.number });
  });
}
