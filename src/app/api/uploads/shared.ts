import "server-only";
import { z } from "zod";
import { AppError, ForbiddenError, RateLimitError, ValidationError } from "@/lib/errors";
import { isSameOriginRequest } from "@/lib/same-origin";

/**
 * Helpers shared by the upload route handlers (not a route itself).
 * Errors are answered as JSON `{ error: code }` with the matching HTTP status; codes have
 * messages in messages/<locale>/uploads.json (errors.<code>) or the shared "errors" namespace.
 */

/** Multipart boundaries and the other form fields never need more than this. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export function jsonError(code: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error: code }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorResponse(error: unknown, scope: string): Response {
  if (error instanceof RateLimitError) {
    return jsonError("rate_limited", 429, { "Retry-After": String(error.retryAfterSeconds) });
  }
  if (error instanceof ValidationError) {
    return Response.json(
      { error: "invalid_input", fieldErrors: error.fieldErrors ?? {} },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof AppError && error.status < 500) return jsonError(error.code, error.status);
  if (error instanceof AppError && error.code === "file_scan_failed") return jsonError(error.code, error.status);
  console.error(`[uploads:${scope}] failed:`, error);
  return jsonError("server_error", 500);
}

/**
 * Refuses uploads sent from another site's page (CSRF). The session cookie is SameSite=Lax, which
 * already blocks most of them; this also covers sibling subdomains and older browsers.
 */
export function assertSameOrigin(request: Request): void {
  if (!isSameOriginRequest(request)) throw new ForbiddenError("Cross-site request refused");
}

/** Refuses bodies that announce more than `maxBytes` before reading them. */
export function assertContentLength(request: Request, maxBytes: number): void {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new AppError("file_too_large", "Request body too large", { status: 413 });
  }
}

export async function readForm(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new ValidationError({ file: ["multipart_required"] });
  }
  try {
    return await request.formData();
  } catch {
    throw new ValidationError({ file: ["unreadable_form"] });
  }
}

/** The uploaded file in field `name`, or a ValidationError. */
export function formFile(form: FormData, name = "file"): File {
  const value = form.get(name);
  if (!(value instanceof File) || value.size === 0) throw new ValidationError({ [name]: ["required"] });
  return value;
}

export function parseFields<T extends z.ZodType>(schema: T, input: Record<string, unknown>): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors);
  return parsed.data;
}

/** A form text field: trimmed string, or undefined when missing/empty. */
export function textField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * A display name for an uploaded file: no folders, control or bidi-override characters
 * (they can disguise "fdp.exe" as "exe.pdf"), at most 100 characters, with `extension`.
 */
export function sanitizeFileName(name: string | null | undefined, extension: string, fallback: string): string {
  const base = (name ?? "")
    .normalize("NFC")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩"<>:|?*]+/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  return `${base || fallback}.${extension}`;
}
