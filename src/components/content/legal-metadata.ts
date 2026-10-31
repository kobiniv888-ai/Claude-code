import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { legalDocs, type LegalDocKey } from "./legal-docs";
import { contentMetadata } from "./metadata";
import { contentValues } from "./rich";

/** generateMetadata for a legal page: translated title/description + hreflang alternates. */
export async function legalMetadata(locale: string, doc: LegalDocKey): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "legal" });
  const values = contentValues(locale);
  return contentMetadata({
    locale,
    path: legalDocs[doc].path,
    title: t(`${doc}.title`),
    description: t(`${doc}.metaDescription`, values),
  });
}
