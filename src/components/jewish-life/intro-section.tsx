import { Flame, ScrollText, Utensils } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { JlContainer } from "./section";

/** "Jewish life in Georgia" — a short, general introduction (no invented specifics). */
export async function IntroSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.intro" });
  const highlights = [
    { key: "pray", icon: ScrollText, tone: "bg-primary/10 text-primary" },
    { key: "kosher", icon: Utensils, tone: "bg-terracotta/10 text-terracotta" },
    { key: "shabbat", icon: Flame, tone: "bg-wine/10 text-wine" },
  ] as const;

  return (
    <section aria-labelledby="jl-intro-title" className="py-12 sm:py-16">
      <JlContainer className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="max-w-2xl">
          <h2 id="jl-intro-title" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {t("title")}
          </h2>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-pretty text-foreground/85 sm:text-lg">
            <p>{t("p1")}</p>
            <p>{t("p2")}</p>
            <p>{t("p3")}</p>
          </div>
        </div>
        <ul className="grid gap-4 self-start sm:grid-cols-3 lg:grid-cols-1">
          {highlights.map(({ key, icon: Icon, tone }) => (
            <li key={key} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-card">
              <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-full ${tone}`}>
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{t(`highlights.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{t(`highlights.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </JlContainer>
    </section>
  );
}
