/**
 * Report form validation (client-safe). Shared by the report dialog and createReport().
 */
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/listing/fields";

export const REPORT_TARGETS = ["LISTING", "USER"] as const;
export type ReportTargetKey = (typeof REPORT_TARGETS)[number];
export type ReportReasonKey = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX = 1000;
/** "Other" needs a few words so a moderator knows what to check. */
export const REPORT_OTHER_MIN = 10;

export const reportInputSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: z.string().trim().min(1).max(64),
    reason: z.enum(REPORT_REASONS),
    details: z
      .string()
      .max(REPORT_DETAILS_MAX)
      .nullish()
      .transform((v) => v?.trim() || null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reason === "OTHER" && (value.details?.length ?? 0) < REPORT_OTHER_MIN) {
      ctx.addIssue({ code: "custom", path: ["details"], message: "details_required" });
    }
  });

export type ReportInput = z.input<typeof reportInputSchema>;
