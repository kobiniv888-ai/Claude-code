"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { errorMessageKey } from "@/lib/errors";

/**
 * Translates an error code of the account-security actions: `security.errors.*` first, then the
 * login texts (`auth.errors.*`), then the shared `errors.*`.
 */
export function useSecurityErrorMessage() {
  const own = useTranslations("security.errors");
  const auth = useTranslations("auth.errors");
  const shared = useTranslations("errors");
  return useCallback(
    (code: string | null | undefined): string => {
      const key = code || "server_error";
      if (own.has(key)) return own(key);
      if (auth.has(key)) return auth(key);
      return shared(errorMessageKey(key));
    },
    [own, auth, shared],
  );
}
