import { safeNextPath } from "@/lib/auth/next-path";

/**
 * "חזרה למודעה" (bug 2.10): pages reached from the post form get a button back to the form's step.
 * The way back travels as `?from=` (calendar links) or `?next=` (phone verification) and is only
 * accepted when it is the post form of a listing — /post/<id> or /account/listings/<id>/edit, with an
 * optional ?step= — never any other address (pure, client-safe; the form itself checks ownership).
 */
const FORM_PATH = /^\/(post\/[A-Za-z0-9_-]{1,64}|account\/listings\/[A-Za-z0-9_-]{1,64}\/edit)(\?step=(\d{1,2}|[a-z]{3,12}))?$/;

export function formReturnPath(value: unknown): string | null {
  const path = safeNextPath(value, "");
  return path && FORM_PATH.test(path) ? path : null;
}
