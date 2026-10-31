import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { SectionHeading } from "@/components/common/section-heading";
import type { AppLocale } from "@/config/site";
import { HowItWorksTabs } from "./how-it-works-tabs";

const STEPS = ["one", "two", "three"] as const;

/** "How it works" in three steps, for guests and for owners (tabs), with a link to the full page. */
export async function HowItWorks({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.howItWorks" });
  const track = (audience: "guests" | "owners") => ({
    label: t(`tabs.${audience}`),
    steps: STEPS.map((step) => ({ title: t(`${audience}.${step}.title`), text: t(`${audience}.${step}.text`) })),
  });
  return (
    <section aria-labelledby="home-how-title" className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          id="home-how-title"
          title={t("title")}
          description={t("lead")}
          action={{ label: t("more"), href: "/how-it-works" }}
        />
        <HowItWorksTabs guests={track("guests")} owners={track("owners")} label={t("tabsLabel")} />
      </Container>
    </section>
  );
}
