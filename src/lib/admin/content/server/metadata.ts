import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/** Title (adminContent.<page>.title) for an admin page; never indexed. */
export async function adminContentMetadata(params: Promise<{ locale: string }>, page: string): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adminContent" });
  return { title: t(`${page}.title`), robots: { index: false, follow: false } };
}
