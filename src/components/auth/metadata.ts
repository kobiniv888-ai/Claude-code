import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Title for an auth page; these pages are never indexed. */
export async function authPageMetadata(
  locale: string,
  key: "login" | "verifyPhone" | "twoFactor" | "twoFactorSetup",
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "auth.meta" });
  return {
    title: t(key),
    robots: { index: false, follow: false },
  };
}
