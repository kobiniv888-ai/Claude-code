"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { DEV_HINT_KEYS, phoneOnlyErrorKey, type AuthErrorKey, type AuthFailure } from "@/lib/auth/error-codes";

/**
 * Translates an auth error key (or a server action error code) from `auth.errors.*`.
 * `phoneOnly`: Google/Apple are not offered here, so use the wording that doesn't suggest them.
 */
export function useAuthErrorMessage({ phoneOnly = false }: { phoneOnly?: boolean } = {}) {
  const t = useTranslations("auth.errors");
  return useCallback(
    (key: AuthErrorKey | string | null | undefined): string | null => {
      if (!key) return null;
      const variant = phoneOnlyErrorKey(key, phoneOnly);
      if (t.has(variant)) return t(variant);
      return t.has(key) ? t(key) : t("unknown");
    },
    [t, phoneOnly],
  );
}

/**
 * Like useAuthErrorMessage, for a refused code send that names a wait (our server-side limits):
 * "you can ask for a new code in 2:00", "today's codes are used up, try again in 5 hours".
 */
export function useAuthFailureMessage({ phoneOnly = false }: { phoneOnly?: boolean } = {}) {
  const t = useTranslations("auth.errors");
  const plain = useAuthErrorMessage({ phoneOnly });
  return useCallback(
    (failure: AuthFailure | null | undefined): string | null => {
      if (!failure) return null;
      if (failure.key === "code_wait" && failure.retryAfter) return t("code_wait", { time: formatCountdown(failure.retryAfter) });
      if (failure.key === "code_daily_cap" && failure.retryAfter) {
        return t("code_daily_cap", { hours: Math.max(1, Math.ceil(failure.retryAfter / 3600)) });
      }
      return plain(failure.key);
    },
    [t, plain],
  );
}

/** A developer hint for an auth error (`auth.devHints.*`), only in development; otherwise null. */
export function useAuthDevHint() {
  const t = useTranslations("auth.devHints");
  return useCallback(
    (key: AuthErrorKey | string | null | undefined): string | null => {
      if (process.env.NODE_ENV !== "development" || !key) return null;
      return DEV_HINT_KEYS.has(key as AuthErrorKey) && t.has(key) ? t(key) : null;
    },
    [t],
  );
}

/** "m:ss" with Western digits (for the "send a new code" countdown). */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
