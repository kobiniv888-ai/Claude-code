"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AuthErrorKey } from "@/lib/auth/error-codes";

/** Translates an auth error key (or a server action error code) from `auth.errors.*`. */
export function useAuthErrorMessage() {
  const t = useTranslations("auth.errors");
  return useCallback(
    (key: AuthErrorKey | string | null | undefined): string | null => {
      if (!key) return null;
      return t.has(key) ? t(key) : t("unknown");
    },
    [t],
  );
}

/** "m:ss" with Western digits (for the "send a new code" countdown). */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
