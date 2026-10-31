"use client";

import { useTranslations } from "next-intl";
import { errorMessageKey } from "@/lib/errors";

/**
 * Turns a server action error code into a sentence: the account namespace's own codes first,
 * then the listing lifecycle codes (moderation.errors), upload codes, then the shared errors.
 */
export function useActionError(): (code: string | null | undefined) => string {
  const own = useTranslations("account.errors");
  const lifecycle = useTranslations("moderation.errors");
  const uploads = useTranslations("uploads.errors");
  const shared = useTranslations("errors");
  return (code) => {
    const key = code ?? "server_error";
    if (own.has(key)) return own(key);
    if (lifecycle.has(key)) return lifecycle(key);
    if (uploads.has(key)) return uploads(key);
    return shared(errorMessageKey(key));
  };
}
