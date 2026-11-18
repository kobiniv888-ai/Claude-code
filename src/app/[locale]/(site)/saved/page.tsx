import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { DeviceListsView } from "@/components/lists/device-lists-view";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ACCOUNT_LISTS_PATH } from "@/lib/lists/paths";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lists" });
  return { ...pageMetadata({ locale, path: "/saved", title: t("device.metaTitle"), description: t("page.lead"), noIndex: true }), robots: { index: false, follow: false } };
}

/**
 * /saved — the lists a signed-out visitor keeps on this device (round 3, brief 7.2). Signed in:
 * the account's lists (/account/favorites), where anything left on the device is merged in.
 */
export default async function SavedOnDevicePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentUser()) redirect({ href: ACCOUNT_LISTS_PATH, locale });
  return (
    <Container>
      <DeviceListsView />
    </Container>
  );
}
