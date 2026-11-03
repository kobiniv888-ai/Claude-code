/**
 * Verification center rules (pure, client-safe): which documents each request type needs,
 * the input schemas, and the badge progress shown on the overview.
 * Files come from POST /api/uploads/private (purpose "verification"); the server action also
 * checks that every key belongs to the signed-in user (isOwnPrivateUpload).
 */
import { z } from "zod";
import type { VerificationStatus, VerificationType } from "@/generated/prisma/enums";
import { accountPhoneRow } from "@/lib/auth/phone-check-policy";

export const ID_DOCUMENT_SLOTS = ["ID_FRONT", "ID_BACK", "SELFIE"] as const;
export const OWNERSHIP_DOCUMENT_SLOTS = ["NAPR_EXTRACT"] as const;
export const BUSINESS_DOCUMENT_SLOTS = ["BUSINESS_REGISTRATION"] as const;

export type DocumentSlot =
  | (typeof ID_DOCUMENT_SLOTS)[number]
  | (typeof OWNERSHIP_DOCUMENT_SLOTS)[number]
  | (typeof BUSINESS_DOCUMENT_SLOTS)[number];

/** Slots that must be filled. A passport has no back side, so ID_BACK is optional. */
export const REQUIRED_SLOTS: Record<"ID" | "OWNERSHIP" | "BUSINESS", readonly DocumentSlot[]> = {
  ID: ["ID_FRONT", "SELFIE"],
  OWNERSHIP: ["NAPR_EXTRACT"],
  BUSINESS: ["BUSINESS_REGISTRATION"],
};

/** Selfies must be photos; documents may also be PDFs. */
export function acceptsPdf(slot: DocumentSlot): boolean {
  return slot !== "SELFIE";
}

export const uploadedFileSchema = z.object({
  key: z.string().trim().min(1).max(300),
  mime: z.enum(["image/jpeg", "application/pdf"]),
  bytes: z.number().int().positive().max(20 * 1024 * 1024),
  name: z.string().trim().max(160).nullable().optional(),
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

const noteSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => v || null);

export const idVerificationSchema = z.object({
  front: uploadedFileSchema,
  back: uploadedFileSchema.nullable().optional(),
  selfie: uploadedFileSchema.refine((f) => f.mime !== "application/pdf", { message: "selfie_must_be_photo" }),
  note: noteSchema,
});

/** Georgian cadastral code: groups of digits separated by dots, e.g. 01.10.14.003.012. */
export function normalizeCadastral(code: string): string {
  return code
    .trim()
    .replace(/[\s\-_/:,]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

export const CADASTRAL_PATTERN = /^\d{1,3}(\.\d{1,5}){2,7}$/;

export function isValidCadastralCode(code: string): boolean {
  return CADASTRAL_PATTERN.test(normalizeCadastral(code));
}

export const ownershipVerificationSchema = z.object({
  listingId: z.string().trim().min(1).max(64),
  extract: uploadedFileSchema,
  cadastralCode: z
    .string()
    .max(60)
    .transform(normalizeCadastral)
    .refine((v) => CADASTRAL_PATTERN.test(v), { message: "invalid_cadastral" }),
  note: noteSchema,
});

export const businessVerificationSchema = z.object({
  registration: uploadedFileSchema,
  note: noteSchema,
});

/** Request statuses that block a new request of the same kind. */
export function isOpenRequest(status: VerificationStatus): boolean {
  return status === "PENDING";
}

export type RequestSummary = {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
  listingId: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  decisionReason: string | null;
};

/** The newest request of a type (for one listing, for OWNERSHIP). */
export function latestRequest(
  requests: readonly RequestSummary[],
  type: VerificationType,
  listingId?: string | null,
): RequestSummary | null {
  let best: RequestSummary | null = null;
  for (const r of requests) {
    if (r.type !== type) continue;
    if (listingId !== undefined && r.listingId !== listingId) continue;
    if (!best || r.createdAt > best.createdAt) best = r;
  }
  return best;
}

export type BadgeState = "verified" | "pending" | "actionNeeded" | "notStarted";

/** State of a badge from "verified" and the newest request. */
export function badgeState(verified: boolean, latest: Pick<RequestSummary, "status"> | null): BadgeState {
  if (verified) return "verified";
  if (!latest) return "notStarted";
  if (latest.status === "PENDING") return "pending";
  if (latest.status === "REJECTED" || latest.status === "NEEDS_MORE_INFO") return "actionNeeded";
  return "notStarted";
}

export type VerificationProgress = {
  /**
   * null: a guest whose phone is not verified. The paid SMS check is offered to hosts only on the
   * account pages; guests verify inside the booking review (src/lib/auth/phone-check-policy.ts).
   */
  phone: BadgeState | null;
  id: BadgeState;
  /** Owner verified on at least one listing (null when the user has no listings to verify). */
  owner: BadgeState | null;
  done: number;
  total: number;
};

export function verificationProgress(input: {
  phoneVerified: boolean;
  /** Has a listing, drafts included (isHostAccount). Defaults to true (the round-2 behaviour). */
  isHost?: boolean;
  idVerified: boolean;
  idLatest: Pick<RequestSummary, "status"> | null;
  hasListings: boolean;
  ownerVerifiedListings: number;
  ownershipLatest: Pick<RequestSummary, "status"> | null;
}): VerificationProgress {
  const row = accountPhoneRow({ phoneVerified: input.phoneVerified, isHost: input.isHost ?? true });
  const phone: BadgeState | null = row === "verified" ? "verified" : row === "offer" ? "notStarted" : null;
  const id = badgeState(input.idVerified, input.idLatest);
  const owner = input.hasListings ? badgeState(input.ownerVerifiedListings > 0, input.ownershipLatest) : null;
  const states = [...(phone ? [phone] : []), id, ...(owner ? [owner] : [])];
  return { phone, id, owner, done: states.filter((s) => s === "verified").length, total: states.length };
}
