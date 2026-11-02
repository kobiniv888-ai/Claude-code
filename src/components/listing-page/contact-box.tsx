import { useLocale, useTranslations } from "next-intl";
import { CalendarCheckIcon, ClockIcon, LanguagesIcon, MoonStarIcon, PhoneCallIcon, VideoIcon } from "lucide-react";
import { ContactPanel } from "@/components/contact/contact-panel";
import { Ltr } from "@/components/common/ltr";
import { ArrowEnd } from "@/components/common/directional-icon";
import { BayitBadge } from "@/components/ds/badges";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { Price } from "@/components/listing/price";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTime } from "@/lib/format";
import { clockDate, languageName, safeTimeZone } from "@/lib/listing-page/helpers";
import type { ListingPageData, OwnerSummary } from "@/lib/listing-page/types";
import { ownerPath } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "./owner-avatar";
import { OwnerBadges } from "./owner-badges";
import { OwnerLocalTime } from "./owner-local-time";

export type ShabbatNow = { active: boolean; kind: "shabbat" | "holiday" | null };

/** Avatar, "Hosted by", name (→ profile) and the trust badges. */
export function OwnerHeader({
  owner,
  ownerVerified = false,
  propertyVerified = false,
  welcomes = false,
  sale = false,
  compact = false,
}: {
  owner: OwnerSummary;
  ownerVerified?: boolean;
  propertyVerified?: boolean;
  /** The owner's welcome pledge is valid (green badge). */
  welcomes?: boolean;
  /** A sale listing: "Listed by" instead of "Hosted by". */
  sale?: boolean;
  /** One line: avatar and name only (the desktop side box). */
  compact?: boolean;
}) {
  const t = useTranslations("listing.contactBox");
  const role = owner.badges.business ? t("hostedByBusiness") : sale ? t("listedBy") : t("hostedBy");
  const name = (
    <Link
      href={ownerPath(owner.id)}
      dir="auto"
      className={cn(
        "truncate rounded font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        compact ? "text-body" : "text-h3",
      )}
    >
      {owner.name}
    </Link>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <OwnerAvatar name={owner.name} image={owner.image} size={40} />
        <div className="grid min-w-0">
          <span className="text-caption text-muted-foreground">{role}</span>
          {name}
        </div>
      </div>
    );
  }
  return (
    // grid-cols-1 = minmax(0, 1fr): a long badge (Georgian "welcomes") truncates instead of widening the page.
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center gap-3">
        <OwnerAvatar name={owner.name} image={owner.image} size={60} className="ring-4 ring-navy-soft" />
        <div className="grid min-w-0 gap-0.5">
          <span className="text-small text-muted-foreground">{role}</span>
          {name}
        </div>
      </div>
      {welcomes ? <BayitBadge kind="welcomes" size="md" className="justify-self-start" /> : null}
      <OwnerBadges badges={owner.badges} ownerVerified={ownerVerified} propertyVerified={propertyVerified} />
    </div>
  );
}

/** Languages, member since, local time and contact hours — real data only (no reply times). */
export function OwnerFacts({ owner, contactHours, nowIso }: { owner: OwnerSummary; contactHours?: { from: string | null; to: string | null }; nowIso: string }) {
  const t = useTranslations("listing.contactBox");
  const locale = useLocale();
  const zone = safeTimeZone(owner.timezone);
  const from = clockDate(contactHours?.from);
  const to = clockDate(contactHours?.to);
  const rows = [
    owner.languages.length > 0 && {
      icon: LanguagesIcon,
      label: t("languages"),
      value: owner.languages.map((code) => languageName(code, locale)).join(", "),
    },
    {
      icon: CalendarCheckIcon,
      label: t("memberSince"),
      value: formatDate(owner.memberSince, locale, { month: "long", year: "numeric" }),
    },
    { icon: ClockIcon, label: t("localTime"), value: <OwnerLocalTime timeZone={zone} initial={nowIso} /> },
    from &&
      to && {
        icon: PhoneCallIcon,
        label: t("contactHours"),
        value: (
          <>
            <bdi>{formatTime(from, locale, "UTC")}</bdi> – <bdi>{formatTime(to, locale, "UTC")}</bdi>
          </>
        ),
      },
  ].filter(Boolean) as { icon: typeof ClockIcon; label: string; value: React.ReactNode }[];

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(({ icon: Icon, label, value }) => (
        // dt/dd must be direct children of the row (WCAG "definition-list"): the icon sits inside the dt.
        <div key={label} className="relative grid min-w-0 content-center rounded-2xl bg-muted/70 py-2.5 ps-11 pe-3">
          <dt className="text-caption text-muted-foreground">
            <Icon className="absolute start-3 top-1/2 size-5 -translate-y-1/2 text-navy" aria-hidden />
            {label}
          </dt>
          <dd className="text-small font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Replies after Shabbat" while it is Shabbat or a holiday where the listing is. */
export function ShabbatReplyNotice({ now, className }: { now: ShabbatNow; className?: string }) {
  const t = useTranslations("listing.contactBox");
  if (!now.active) return null;
  return (
    <p className={cn("flex gap-2 rounded-xl bg-navy-soft p-3 text-small text-navy", className)} role="status">
      <MoonStarIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {now.kind === "holiday" ? t("repliesAfterHoliday") : t("repliesAfterShabbat")}
    </p>
  );
}

/** "Before you pay, ask for a live video call…" */
export function VideoTip({ publicId, className }: { publicId: number; className?: string }) {
  const t = useTranslations("listing.contactBox");
  return (
    <p className={cn("flex gap-2 text-caption leading-relaxed text-muted-foreground", className)}>
      <VideoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{t.rich("videoTip", { id: publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}</span>
    </p>
  );
}

/** Desktop: the sticky contact box beside the content (phones use the bottom contact bar). */
export function ContactBox({ data, shabbatNow }: { data: ListingPageData; shabbatNow: ShabbatNow }) {
  return (
    <div className="grid gap-4 rounded-card border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="hero" />
        {data.price ? <CurrencySwitcher align="end" className="h-9 bg-muted px-2.5 hover:bg-muted/70" /> : null}
      </div>
      <OwnerHeader owner={data.owner} sale={data.dealType === "SALE"} compact />
      <ShabbatReplyNotice now={shabbatNow} />
      <ContactPanel />
      <VideoTip publicId={data.publicId} />
    </div>
  );
}

/** The host card in the page: photo or initials, name, badges, languages, member since. */
export function HostCard({
  data,
  welcomes,
  nowIso,
  shabbatNow,
  showContact,
}: {
  data: ListingPageData;
  welcomes: boolean;
  nowIso: string;
  shabbatNow: ShabbatNow;
  /** Phones without the contact bar (preview, own listing, no channels): show the panel here. */
  showContact: boolean;
}) {
  const t = useTranslations("listing.host");
  return (
    <div className="grid gap-4 rounded-card border bg-card p-4 shadow-card sm:p-5">
      <OwnerHeader
        owner={data.owner}
        ownerVerified={data.ownerVerified}
        propertyVerified={data.propertyVerified}
        welcomes={welcomes}
        sale={data.dealType === "SALE"}
      />
      <OwnerFacts owner={data.owner} contactHours={{ from: data.contactHoursFrom, to: data.contactHoursTo }} nowIso={nowIso} />
      <ShabbatReplyNotice now={shabbatNow} className="lg:hidden" />
      {showContact ? <ContactPanel className="lg:hidden" /> : null}
      <Link
        href={ownerPath(data.owner.id)}
        className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full text-small font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("profile")}
        <ArrowEnd className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
