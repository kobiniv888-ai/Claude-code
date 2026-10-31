import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalDocument } from "@/components/content/legal-document";
import { legalMetadata } from "@/components/content/legal-metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata(locale, "accessibility");
}

export default async function AccessibilityStatementPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument locale={locale} doc="accessibility" />;
}
