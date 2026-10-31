import { isOwnPrivateUpload } from "@/lib/media";

/**
 * Verification documents (pure, client-safe). VerificationRequest.documents is JSON:
 *   [{ key, kind, mime, bytes, name? }]
 * Files are encrypted in private storage and streamed to verification staff only through
 * GET /api/admin/documents/<requestId>/<index>. They are deleted right after the decision.
 */

export const DOCUMENT_KINDS = ["ID_FRONT", "ID_BACK", "SELFIE", "NAPR_EXTRACT", "BUSINESS_REGISTRATION", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type VerificationDocument = {
  key: string;
  kind: DocumentKind;
  mime: string;
  bytes: number;
  name: string | null;
};

export function parseVerificationDocuments(value: unknown): VerificationDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): VerificationDocument[] => {
    if (!item || typeof item !== "object") return [];
    const { key, kind, mime, bytes, name } = item as Record<string, unknown>;
    if (typeof key !== "string" || !key) return [];
    return [
      {
        key,
        kind: (DOCUMENT_KINDS as readonly string[]).includes(kind as string) ? (kind as DocumentKind) : "OTHER",
        mime: typeof mime === "string" ? mime.toLowerCase() : "application/octet-stream",
        bytes: typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0,
        name: typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null,
      },
    ];
  });
}

/** A document may be served only when its key is the request owner's own verification upload. */
export function isRequestDocumentKey(key: string, requestUserId: string): boolean {
  return isOwnPrivateUpload(key, requestUserId, "verification");
}

/** The staff-only address of one document. */
export function documentUrl(requestId: string, index: number): string {
  return `/api/admin/documents/${encodeURIComponent(requestId)}/${index}`;
}

export function isPdf(mime: string): boolean {
  return mime.split(";")[0].trim() === "application/pdf";
}

const INLINE_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isViewableImage(mime: string): boolean {
  return INLINE_IMAGES.has(mime.split(";")[0].trim());
}

/** Cadastral codes are compared without spaces, with any separator read as ".". */
export function normalizeCadastralCode(code: string | null | undefined): string | null {
  const cleaned = (code ?? "").trim().replace(/\s+/g, "").replace(/[-_/:,]+/g, ".").replace(/\.+/g, ".");
  return cleaned ? cleaned.replace(/^\.|\.$/g, "").toUpperCase() : null;
}

export type CadastralComparison = "match" | "mismatch" | "missing";

export function compareCadastralCodes(a: string | null | undefined, b: string | null | undefined): CadastralComparison {
  const x = normalizeCadastralCode(a);
  const y = normalizeCadastralCode(b);
  if (!x || !y) return "missing";
  return x === y ? "match" : "mismatch";
}
