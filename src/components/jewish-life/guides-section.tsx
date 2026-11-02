import { ArrowRight, BookOpen, Building2, Flame, Landmark, Plane, Scale, Utensils } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { getPublishedGuides, type GuideSummary } from "@/lib/jewish-life/queries";

const TOPICS = [
  { key: "history", icon: Landmark },
  { key: "kosher", icon: Utensils },
  { key: "shabbat", icon: Flame },
  { key: "travel", icon: Plane },
  { key: "property", icon: Building2 },
] as const;

async function loadGuides(locale: AppLocale): Promise<GuideSummary[]> {
  if (!siteConfig.features.articles) return [];
  try {
    return await getPublishedGuides(locale);
  } catch (error) {
    console.error("[jewish-life] could not load guides:", error);
    return [];
  }
}

/**
 * Guide articles (Phase 2, behind siteConfig.features.articles). Until guides are published,
 * a "coming soon" card lists the planned topics — no placeholder articles.
 */
export async function GuidesSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.guides" });
  const guides = await loadGuides(locale);

  if (guides.length > 0) {
    return (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <article className="relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-balance" dir="auto">
                <Link
                  href={`/jewish-life/guides/${guide.slug}`}
                  className="rounded-sm after:absolute after:inset-0 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {guide.title}
                </Link>
              </h3>
              {guide.excerpt ? (
                <p className="mt-2 line-clamp-3 text-sm text-pretty text-muted-foreground" dir="auto">
                  {guide.excerpt}
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted-foreground">
                {guide.publishedAt ? <span>{formatDate(guide.publishedAt, locale)}</span> : null}
                {guide.reviewedByLawyer ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <Scale aria-hidden="true" className="size-3.5" />
                    {t("reviewedByLawyer")}
                  </span>
                ) : null}
                <span className="ms-auto inline-flex items-center gap-1 font-semibold text-primary">
                  {t("read")}
                  <ArrowRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
                </span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="relative isolate overflow-hidden rounded-3xl border bg-card p-6 shadow-card sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -end-16 -z-10 size-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
        <div className="max-w-sm">
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {t("comingSoonBadge")}
          </span>
          <h3 className="mt-3 text-xl font-semibold text-balance">{t("comingSoonTitle")}</h3>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">{t("comingSoonBody")}</p>
        </div>
        <ul className="grid flex-1 gap-3 sm:grid-cols-2">
          {TOPICS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-card">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="font-medium">{t(`topics.${key}.title`)}</p>
                <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{t(`topics.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
