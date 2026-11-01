import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { HomeSection } from "./home-section";
import { HowItWorksTabs, type StepIcon } from "./how-it-works-tabs";

const STEPS = ["one", "two", "three"] as const;
const ICONS: Record<"guests" | "owners", readonly StepIcon[]> = {
  guests: ["search", "check", "chat"],
  owners: ["post", "pledge", "chat"],
};

/** "How it works": three numbered step cards for guests and for owners (tabs), with a link to the full page. */
export async function HowItWorks({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.howItWorks" });
  const track = (audience: "guests" | "owners") => ({
    label: t(`tabs.${audience}`),
    steps: STEPS.map((step, index) => ({
      number: formatNumber(index + 1, locale, { minimumIntegerDigits: 2 }),
      stepLabel: t("step", { number: formatNumber(index + 1, locale) }),
      icon: ICONS[audience][index],
      title: t(`${audience}.${step}.title`),
      text: t(`${audience}.${step}.text`),
    })),
  });
  return (
    <HomeSection id="home-how-title" title={t("title")} subtitle={t("lead")} href="/how-it-works" linkLabel={t("more")}>
      <HowItWorksTabs guests={track("guests")} owners={track("owners")} label={t("tabsLabel")} />
    </HomeSection>
  );
}
