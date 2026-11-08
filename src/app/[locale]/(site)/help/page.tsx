import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ContactOptions } from "@/components/help/contact-options";
import { HelpCenter } from "@/components/help/help-center";
import { getPublishedFaq } from "@/lib/help/faq";
import { absoluteUrl, localizedPath, pageMetadata, siteName } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help.meta" });
  return pageMetadata({
    locale,
    path: "/help",
    title: t("title"),
    description: t("description", { siteName: siteName(locale) }),
  });
}

export default async function HelpPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const items = await getPublishedFaq(locale);
  const pageUrl = absoluteUrl(localizedPath(locale, "/help"));

  return (
    <div className="pb-16">
      <HelpCenter items={items} pageUrl={pageUrl} />
      <Container size="default" className="max-w-6xl pt-12">
        <ContactOptions />
      </Container>
    </div>
  );
}
