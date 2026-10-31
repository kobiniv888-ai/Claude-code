import { BookOpen, CalendarDays, Flame, HeartHandshake, MapPinned, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { AppLocale } from "@/config/site";
import { JlContainer } from "./section";

/** Top band of /jewish-life: title, lead, jump links and (as `aside`) this week's Shabbat card. */
export async function JewishLifeHero({
  locale,
  aside,
  showGuidesLink,
}: {
  locale: AppLocale;
  aside?: ReactNode;
  showGuidesLink: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "jewishLife.hero" });
  const links = [
    { href: "#places", icon: MapPinned, label: t("jump.places") },
    { href: "#shabbat-times", icon: Flame, label: t("jump.times") },
    { href: "#calendar", icon: CalendarDays, label: t("jump.calendar") },
    ...(showGuidesLink ? [{ href: "#guides", icon: BookOpen, label: t("jump.guides") }] : []),
    { href: "#emergency", icon: Phone, label: t("jump.emergency") },
  ];

  return (
    <section
      aria-labelledby="jewish-life-title"
      className="relative isolate overflow-hidden border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-terracotta/10 blur-3xl sm:size-96"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -start-16 -z-10 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <JlContainer className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:gap-12 lg:py-16">
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-sm font-semibold text-accent-foreground shadow-card">
            <HeartHandshake aria-hidden="true" className="size-4 text-terracotta" />
            {t("eyebrow")}
          </p>
          <h1 id="jewish-life-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("lead")}</p>
          <nav aria-label={t("jumpLabel")} className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {links.map(({ href, icon: Icon, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    className="inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-card transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Icon aria-hidden="true" className="size-4 text-primary" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {aside ? <div className="w-full lg:max-w-sm lg:justify-self-end">{aside}</div> : null}
      </JlContainer>
    </section>
  );
}
