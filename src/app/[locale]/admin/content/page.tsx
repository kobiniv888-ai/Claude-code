import {
  ArrowRight,
  BadgeAlert,
  Building2,
  FileText,
  Languages,
  LayoutTemplate,
  MapPin,
  MessageCircleQuestion,
  Sparkles,
  TextSearch,
  type LucideIcon,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";
import { contentHubCounts } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content">) {
  return adminContentMetadata(params, "hub");
}

type Card = { key: string; href: string; icon: LucideIcon; stat: string };

export default async function ContentHubPage({ params }: PageProps<"/[locale]/admin/content">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, counts] = await Promise.all([getTranslations("adminContent.hub"), contentHubCounts()]);
  const n = (value: number) => formatNumber(value, locale);

  const cards: Card[] = [
    { key: "home", href: "/admin/content/home", icon: LayoutTemplate, stat: t("stats.home", { on: n(counts.homeSectionsOn), total: n(counts.homeSectionsTotal) }) },
    { key: "featured", href: "/admin/content/featured", icon: Sparkles, stat: t("stats.featured", { count: counts.featured }) },
    { key: "cities", href: "/admin/content/cities", icon: Building2, stat: t("stats.cities", { cities: n(counts.cities), neighborhoods: n(counts.neighborhoods) }) },
    { key: "places", href: "/admin/content/places", icon: MapPin, stat: t("stats.places", { count: counts.places, demo: n(counts.demoPlaces) }) },
    { key: "articles", href: "/admin/content/articles", icon: FileText, stat: t("stats.articles", { count: counts.articles, published: n(counts.publishedArticles) }) },
    { key: "faq", href: "/admin/content/faq", icon: MessageCircleQuestion, stat: t("stats.faq", { count: counts.faq }) },
    { key: "translations", href: "/admin/content/translations", icon: Languages, stat: t("stats.translations", { count: counts.overrides }) },
    { key: "alerts", href: "/admin/content/alerts", icon: BadgeAlert, stat: t("stats.alerts", { count: counts.activeAlerts }) },
    { key: "bannedWords", href: "/admin/content/banned-words", icon: TextSearch, stat: t("stats.bannedWords", { count: counts.bannedWords }) },
  ];

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ key, href, icon: Icon, stat }) => (
          <li key={key}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs outline-none transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{t(`cards.${key}.title`)}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t(`cards.${key}.description`)}</p>
                </div>
                <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
              </div>
              <p className="mt-auto text-xs font-medium text-foreground/80">{stat}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
