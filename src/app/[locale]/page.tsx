import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("common");
  return <main className="p-8 text-2xl font-semibold">{t("siteTagline")}</main>;
}
