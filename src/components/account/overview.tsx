import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  CircleDashedIcon,
  ClockIcon,
  FilePenLineIcon,
  HeartIcon,
  HourglassIcon,
  LifeBuoyIcon,
  MessageCircleReplyIcon,
  PlusIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  type LucideIcon,
} from "lucide-react";
import { ChevronEnd } from "@/components/common/directional-icon";
import { Ltr } from "@/components/common/ltr";
import { Progress } from "@/components/ui/progress";
import { Link } from "@/i18n/navigation";
import type { ListingFilter } from "@/lib/account/listing-status";
import { daysUntil } from "@/lib/account/listing-status";
import type { AccountOverview, AttentionItem } from "@/lib/account/queries";
import type { BadgeState } from "@/lib/account/verification";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATE_STYLE: Record<BadgeState, { icon: LucideIcon; className: string }> = {
  verified: { icon: BadgeCheckIcon, className: "bg-primary-tint text-success" },
  pending: { icon: ClockIcon, className: "bg-surface-muted text-foreground" },
  actionNeeded: { icon: AlertTriangleIcon, className: "bg-destructive/10 text-destructive" },
  notStarted: { icon: CircleDashedIcon, className: "bg-muted text-muted-foreground" },
};

export function BadgeStateChip({ state, className }: { state: BadgeState; className?: string }) {
  const t = useTranslations("account.badgeState");
  const { icon: Icon, className: tone } = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", tone, className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(state)}
    </span>
  );
}

export const sectionCard = "rounded-2xl border bg-card p-4 shadow-xs sm:p-6";

export function VerificationProgressCard({ progress }: { progress: AccountOverview["progress"] }) {
  const t = useTranslations("account.overview.verification");
  const locale = useLocale();
  const rows: { key: "phone" | "id" | "owner"; icon: LucideIcon; state: BadgeState; href: string }[] = [
    { key: "phone", icon: SmartphoneIcon, state: progress.phone, href: progress.phone === "verified" ? "/account/verification" : "/verify-phone" },
    { key: "id", icon: BadgeCheckIcon, state: progress.id, href: "/account/verification#id" },
  ];
  if (progress.owner) rows.push({ key: "owner", icon: ShieldCheckIcon, state: progress.owner, href: "/account/verification#owner" });
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section aria-labelledby="verification-progress" className={sectionCard}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="verification-progress" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <p className="text-sm font-semibold text-primary">
          {t("count", { done: formatNumber(progress.done, locale), total: formatNumber(progress.total, locale) })}
        </p>
      </div>
      <Progress value={percent} className="mt-4" aria-label={t("title")} />
      <ul className="mt-4 grid gap-2">
        {rows.map(({ key, icon: Icon, state, href }) => (
          <li key={key}>
            <Link
              href={href}
              className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{t(`badges.${key}`)}</span>
              <BadgeStateChip state={state} />
              <ChevronEnd className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TILES: { filter: ListingFilter; tone: string }[] = [
  { filter: "live", tone: "text-success" },
  { filter: "review", tone: "text-primary" },
  { filter: "changes", tone: "text-foreground" },
  { filter: "paused", tone: "text-muted-foreground" },
  { filter: "expired", tone: "text-destructive" },
  { filter: "drafts", tone: "text-muted-foreground" },
  { filter: "closed", tone: "text-muted-foreground" },
];

export function ListingCountTiles({ counts }: { counts: AccountOverview["counts"] }) {
  const t = useTranslations("account.overview.listings");
  const tf = useTranslations("account.listings.filters");
  const tl = useTranslations("account.listings");
  const locale = useLocale();
  return (
    <section aria-labelledby="listing-counts" className={sectionCard}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="listing-counts" className="text-lg font-semibold">
          {t("title")}
        </h2>
        {counts.all > 0 ? (
          <Link
            href="/account/listings"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("all", { count: counts.all, countText: formatNumber(counts.all, locale) })}
            <ChevronEnd className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {counts.all === 0 ? (
        // No listings yet: a clear next step instead of a row of zeros.
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-muted-foreground">{tl("emptyTitle")}</p>
          <Link
            href="/post"
            className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-1 text-sm font-medium text-primary hover:underline"
          >
            {tl("post")}
            <ChevronEnd className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {TILES.map(({ filter, tone }) => (
            <li key={filter}>
              <Link
                href={{ pathname: "/account/listings", query: { status: filter } }}
                className="flex h-full flex-col gap-1 rounded-xl border bg-background px-3 py-3 outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className={cn("text-2xl font-bold tabular-nums", counts[filter] === 0 ? "text-muted-foreground" : tone)}>
                  {formatNumber(counts[filter], locale)}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{tf(filter)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const t = useTranslations("account.overview.attention");
  const reasons = useTranslations("moderation.reasons");
  const locale = useLocale();
  const untitled = useTranslations("account.listings")("untitled");

  let icon: LucideIcon = AlertTriangleIcon;
  let tone = "bg-surface-muted text-foreground";
  let title: React.ReactNode;
  let body: React.ReactNode = null;
  let href: string;
  let cta: string;

  switch (item.kind) {
    case "needsChanges": {
      const reasonLabel = item.reason && reasons.has(`${item.reason}.label`) ? reasons(`${item.reason}.label`) : null;
      title = (
        <>
          {t("needsChanges")}: <span dir="auto">{item.title || untitled}</span>
        </>
      );
      body = (
        <>
          {reasonLabel ? <span className="font-medium">{reasonLabel}</span> : null}
          {item.note ? (
            <span dir="auto" className="block">
              {item.note}
            </span>
          ) : null}
        </>
      );
      href = `/account/listings/${item.listingId}/edit`;
      cta = t("fix");
      break;
    }
    case "expiring": {
      icon = HourglassIcon;
      const days = daysUntil(item.expiresAt) ?? 0;
      title = (
        <>
          {t("expiring", { count: days, countText: formatNumber(days, locale) })}: <span dir="auto">{item.title || untitled}</span>
        </>
      );
      body = t("expiringOn", { date: formatDate(item.expiresAt, locale, { dateStyle: "medium" }) });
      href = "/account/listings?status=live";
      cta = t("renew");
      break;
    }
    case "expired":
      icon = HourglassIcon;
      tone = "bg-destructive/10 text-destructive";
      title = t("expired", { count: item.count, countText: formatNumber(item.count, locale) });
      body = t("expiredHint");
      href = "/account/listings?status=expired";
      cta = t("review");
      break;
    case "drafts":
      icon = FilePenLineIcon;
      tone = "bg-muted text-muted-foreground";
      title = t("drafts", { count: item.count, countText: formatNumber(item.count, locale) });
      body = t("draftsHint");
      href = "/account/listings?status=drafts";
      cta = t("continue");
      break;
    case "ticket":
      icon = MessageCircleReplyIcon;
      tone = "bg-secondary text-primary";
      title = (
        <>
          {t("ticket")}{" "}
          <Ltr className="font-mono">#{item.number}</Ltr>
        </>
      );
      body = <span dir="auto">{item.subject}</span>;
      href = `/account/tickets/${item.number}`;
      cta = t("reply");
      break;
  }
  const Icon = icon;

  return (
    <li className="flex gap-3 rounded-xl border bg-background p-3 sm:items-center">
      <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words">{title}</p>
          {body ? <p className="mt-0.5 text-sm break-words text-muted-foreground">{body}</p> : null}
        </div>
        <Link
          href={href}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1 self-start rounded-lg border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:self-center"
        >
          {cta}
          <ChevronEnd className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const t = useTranslations("account.overview.attention");
  return (
    <section aria-labelledby="attention" className={sectionCard}>
      <h2 id="attention" className="text-lg font-semibold">
        {t("title")}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-3 text-sm font-medium text-success">
          <BadgeCheckIcon className="size-5 shrink-0" aria-hidden="true" />
          {t("allGood")}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {items.map((item, i) => (
            <AttentionRow key={`${item.kind}-${i}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function QuickActions({ idVerified, favorites, openTickets }: { idVerified: boolean; favorites: number; openTickets: number }) {
  const t = useTranslations("account.overview.quick");
  const locale = useLocale();
  const actions: { href: string; icon: LucideIcon; label: string; hint: string; primary?: boolean }[] = [
    { href: "/post", icon: PlusIcon, label: t("post"), hint: t("postHint"), primary: true },
    ...(idVerified ? [] : [{ href: "/account/verification#id", icon: BadgeCheckIcon, label: t("verify"), hint: t("verifyHint") }]),
    { href: "/account/favorites", icon: HeartIcon, label: t("favorites"), hint: t("favoritesHint", { count: favorites, countText: formatNumber(favorites, locale) }) },
    { href: "/account/tickets", icon: LifeBuoyIcon, label: t("support"), hint: t("supportHint", { count: openTickets, countText: formatNumber(openTickets, locale) }) },
  ];
  return (
    <section aria-labelledby="quick-actions">
      <h2 id="quick-actions" className="sr-only">
        {t("title")}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ href, icon: Icon, label, hint, primary }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex h-full items-center gap-3 rounded-2xl border p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "bg-card hover:border-primary/40",
              )}
            >
              <Icon className={cn("size-6 shrink-0", primary ? "" : "text-primary")} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold">{label}</span>
                <span className={cn("block text-sm", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
