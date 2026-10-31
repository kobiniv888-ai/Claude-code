import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomePlaceholder } from "@/components/layout/home-placeholder";
import { SiteShell } from "@/components/layout/site-shell";
import { pageMetadata, siteName } from "@/lib/seo";

// Temporary home page. It belongs in app/[locale]/(site)/page.tsx (inside the site layout); move
// it there — and delete this file — when the home page is built. Until then it renders the site
// frame itself.

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const metadata = pageMetadata({ locale, path: "/", title: t("siteTagline"), description: t("meta.description") });
  return { ...metadata, title: { absolute: `${siteName(locale)} · ${t("siteTagline")}` } };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <SiteShell>
      <HomePlaceholder />
    </SiteShell>
  );
}
