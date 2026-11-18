/**
 * "Turned away?" reports (round 3, brief 8.2): the rules the form and the server share
 * (pure, client-safe).
 *
 * A guest tells us that a host cancelled, refused or questioned them because of who they are.
 * The report is about the HOST (Report.kind TURNED_AWAY, targetType USER, targetUserId = the
 * host), linked to the booking or the listing it came from. It is urgent, never public, never
 * names the reporter to the host unless the founder decides to (Report.reporterRevealedAt), and
 * never hides anything automatically (a person decides).
 */
import { z } from "zod";
import type { ReportReason } from "@/generated/prisma/enums";
import { CASE_TEXT_RETENTION_DAYS } from "@/lib/retention-times";
import { firstNameOf } from "@/lib/auth/first-name";
import { isOwnPrivateUpload } from "@/lib/media";
import { isValidStorageKey } from "@/lib/storage/keys";
import { REPORT_DETAILS_MAX, REPORT_OTHER_MIN } from "./schemas";

/** What happened, in the form's order. "Other" needs a few words. */
export const TURNED_AWAY_REASONS = [
  "CANCELLED_FOR_IDENTITY",
  "ASKED_RELIGION_OR_ORIGIN",
  "REFUSED_OR_IGNORED",
  "OTHER",
] as const satisfies readonly ReportReason[];
export type TurnedAwayReason = (typeof TURNED_AWAY_REASONS)[number];

export function isTurnedAwayReason(value: unknown): value is TurnedAwayReason {
  return typeof value === "string" && (TURNED_AWAY_REASONS as readonly string[]).includes(value);
}

// ─── Screenshots ──────────────────────────────────────────────

/**
 * Screenshots: images only (JPEG, PNG, WebP), at most 5 files of at most 5 MB each. The upload
 * route (POST /api/uploads/private, purpose "report") checks the real format from the file's
 * first bytes, re-encodes it with sharp (JPEG, metadata such as EXIF and GPS removed) and stores
 * it encrypted in private storage.
 */
export const REPORT_SCREENSHOTS = {
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  /** What the file picker offers and the browser check accepts. */
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  /** What the server accepts after sniffing the bytes (sniffImageFormat in @/lib/images). */
  formats: ["jpeg", "png", "webp"],
} as const;

export type ScreenshotProblem = "file_type_not_allowed" | "file_too_large" | "too_many_files";

/** Why the browser refuses a chosen file before uploading it (null = fine). The server checks again. */
export function screenshotProblem(file: { type: string; size: number }): Exclude<ScreenshotProblem, "too_many_files"> | null {
  const type = (file.type || "").toLowerCase().split(";")[0].trim();
  if (!(REPORT_SCREENSHOTS.mimeTypes as readonly string[]).includes(type)) return "file_type_not_allowed";
  if (file.size <= 0 || file.size > REPORT_SCREENSHOTS.maxBytes) return "file_too_large";
  return null;
}

/** True when the server-side sniffed format may be stored as a report screenshot. */
export function isAllowedScreenshotFormat(format: string | null | undefined): boolean {
  return !!format && (REPORT_SCREENSHOTS.formats as readonly string[]).includes(format);
}

/** One stored screenshot, as Report.attachments keeps it (the upload route's answer). */
export type ReportAttachment = { key: string; mime: string; bytes: number; name: string };

export const reportAttachmentSchema = z.object({
  key: z.string().min(1).max(512).refine(isValidStorageKey, "attachment_invalid"),
  mime: z.string().trim().min(1).max(100),
  bytes: z.number().int().min(0).max(REPORT_SCREENSHOTS.maxBytes),
  name: z.string().trim().max(200).default(""),
});

/** Reads Report.attachments (JSON) safely; invalid entries are dropped. */
export function parseReportAttachments(value: unknown): ReportAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: ReportAttachment[] = [];
  for (const item of value) {
    const parsed = reportAttachmentSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * A report screenshot key that this user uploaded through POST /api/uploads/private (purpose
 * "report"). Always a re-encoded image (the route stores JPEG), never a PDF.
 */
export function isOwnReportUpload(key: string, userId: string): boolean {
  return isValidStorageKey(key) && /\.(jpg|webp)$/.test(key) && isOwnPrivateUpload(key, userId, "report");
}

/** The staff-only address of a report's screenshot (see /api/admin/reports/[reportId]/[index]). */
export function reportAttachmentUrl(reportId: string, index: number): string {
  return `/api/admin/reports/${encodeURIComponent(reportId)}/${index}`;
}

// ─── When it happened ─────────────────────────────────────────

/** How far back a guest may date what happened. */
export const HAPPENED_ON_MAX_DAYS_AGO = 365;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function isCalendarDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The date field's min and max for "today" ("YYYY-MM-DD", Georgia). */
export function happenedOnBounds(today: string): { min: string; max: string } {
  return { min: shiftDay(today, -HAPPENED_ON_MAX_DAYS_AGO), max: today };
}

/**
 * Checks the day the guest gave. One day of slack after `today` (Georgia) covers a guest whose
 * own clock is already on tomorrow.
 */
export function happenedOnProblem(day: string, today: string): "date_invalid" | "date_future" | "date_too_old" | null {
  if (!isCalendarDay(day)) return "date_invalid";
  const { min } = happenedOnBounds(today);
  if (day > shiftDay(today, 1)) return "date_future";
  if (day < min) return "date_too_old";
  return null;
}

// ─── The form ────────────────────────────────────────────────

const idSchema = z.string().trim().min(1).max(64);

export const turnedAwayInputSchema = z
  .object({
    /** From "My trips", the trip page or the cancellation email: the guest's own booking. */
    bookingId: idSchema.nullish().transform((v) => v || null),
    /** From the listing's "…" menu ("Report the host"). */
    listingId: idSchema.nullish().transform((v) => v || null),
    reason: z.enum(TURNED_AWAY_REASONS),
    /** "YYYY-MM-DD"; checked against today by happenedOnProblem(). */
    happenedOn: z.string().trim().max(10),
    details: z
      .string()
      .max(REPORT_DETAILS_MAX)
      .nullish()
      .transform((v) => v?.trim() || null),
    attachments: z
      .array(reportAttachmentSchema)
      .max(REPORT_SCREENSHOTS.maxFiles, "too_many_files")
      .default([]),
    /** Invisible CAPTCHA (Turnstile, action "report"). */
    turnstileToken: z.string().max(2048).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.bookingId && !value.listingId) ctx.addIssue({ code: "custom", path: ["listingId"], message: "target_required" });
    if (value.reason === "OTHER" && (value.details?.length ?? 0) < REPORT_OTHER_MIN) {
      ctx.addIssue({ code: "custom", path: ["details"], message: "details_required" });
    }
    if (new Set(value.attachments.map((a) => a.key)).size !== value.attachments.length) {
      ctx.addIssue({ code: "custom", path: ["attachments"], message: "attachment_invalid" });
    }
  });

export type TurnedAwayInput = z.input<typeof turnedAwayInputSchema>;
export type TurnedAwayData = z.output<typeof turnedAwayInputSchema>;

// ─── Who the host may learn about ─────────────────────────────

/**
 * The reporter's name as the host may see it: only after the founder chose to reveal it
 * (reporterRevealedAt), and then only the first name. Every email to the host goes through this.
 */
export function reporterNameForHost(report: {
  reporterRevealedAt: Date | string | null | undefined;
  reporter: { firstName?: string | null; name?: string | null; status?: string | null } | null | undefined;
}): string | null {
  if (!report.reporterRevealedAt || !report.reporter) return null;
  // A guest who deleted their account has no name left to tell (it reads "Deleted user").
  if (report.reporter.status === "DELETED") return null;
  // Never a phone number or an email address that was stored as a name.
  return firstNameOf(report.reporter);
}

/**
 * Who may tell the host who reported: the founder (PLAN.md answer 10: "never reveal the reporter
 * unless the founder decides to"), i.e. an ADMIN. Moderators decide reports but never reveal.
 */
export function canRevealReporter(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

// ─── Keeping screenshots ──────────────────────────────────────

/**
 * Report screenshots are deleted this many days after the report was decided: the same ONE clock
 * as the texts of closed cases (founder's answer 7, src/lib/retention-times.ts).
 */
export const REPORT_SCREENSHOT_RETENTION_DAYS = CASE_TEXT_RETENTION_DAYS;

/** When a decided report's screenshots are deleted (null while the report is open). */
export function screenshotsDeleteAt(report: { status: string; handledAt: Date | null }): Date | null {
  if (report.status === "OPEN" || !report.handledAt) return null;
  return new Date(report.handledAt.getTime() + REPORT_SCREENSHOT_RETENTION_DAYS * DAY_MS);
}

/** The cleanup's cut-off: reports decided before this moment lose their screenshots. */
export function screenshotRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - REPORT_SCREENSHOT_RETENTION_DAYS * DAY_MS);
}
