import { FlagIcon as Flag, HeartHandshakeIcon as HeartHandshake, QuoteIcon as Quote } from "@/components/ds/sprite-icons";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { IconCircle } from "@/components/ds/icon-circle";
import { WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { Reveal } from "@/components/ds/reveal";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";

const POINTS: readonly { key: "everyHost" | "noRefusal" | "report"; icon: IconComponent; tone: "green" | "navy" | "coral" }[] = [
  { key: "everyHost", icon: WelcomeHomeIcon, tone: "green" },
  { key: "noRefusal", icon: HeartHandshake, tone: "navy" },
  { key: "report", icon: Flag, tone: "coral" },
];

/**
 * "The Bayit pledge": why nobody here will be turned away, in three icon lines, with the exact
 * words every host accepts before publishing (the current pledge version).
 */
export async function PledgeSection({ locale }: { locale: AppLocale }) {
  const [t, tPledge] = await Promise.all([
    getTranslations({ locale, namespace: "home.pledge" }),
    getTranslations({ locale, namespace: "pledge" }),
  ]);
  const statement = tPledge(`versions.v${siteConfig.pledge.currentVersion}.statement`);

  return (
    <section aria-labelledby="home-pledge-title" className="py-[calc(var(--section-space)*0.55)]">
      <Container>
        <Reveal className="relative isolate overflow-hidden rounded-card bg-primary-tint px-5 py-7 ring-1 ring-primary-tint-border sm:px-8 sm:py-10 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:px-12">
          <WelcomeHomeIcon
            aria-hidden="true"
            className="pointer-events-none absolute -end-6 -bottom-8 -z-10 size-48 text-primary-text/10 sm:size-64"
          />
          <div>
            <p className="inline-flex items-center gap-2 text-small font-bold text-primary-text">
              <IconCircle icon={WelcomeHomeIcon} tone="green" size="sm" className="bg-card" />
              {tPledge("title")}
            </p>
            <h2 id="home-pledge-title" className="mt-3 text-h1 text-balance text-foreground">
              {t("title")}
            </h2>
            <figure className="mt-5 rounded-input bg-card/80 p-4 shadow-xs ring-1 ring-foreground/5">
              <figcaption className="text-caption font-semibold text-muted-foreground">{t("statementLabel")}</figcaption>
              <blockquote className="mt-1.5 flex gap-2 text-body font-semibold text-foreground">
                <Quote className="mt-1 size-4 shrink-0 text-primary-text rtl:-scale-x-100" aria-hidden="true" />
                <p className="text-pretty">{statement}</p>
              </blockquote>
            </figure>
          </div>
          <ul className="mt-6 grid gap-3 lg:mt-0">
            {POINTS.map(({ key, icon, tone }) => (
              <li key={key} className="flex items-center gap-3 rounded-input bg-card p-3 shadow-xs ring-1 ring-foreground/5 sm:p-4">
                <IconCircle icon={icon} tone={tone} size="md" />
                <span className="text-body font-semibold text-pretty text-foreground">
                  {key === "report" ? (
                    <Link href="/contact" className="underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                      {tPledge(`points.${key}`)}
                    </Link>
                  ) : (
                    tPledge(`points.${key}`)
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
