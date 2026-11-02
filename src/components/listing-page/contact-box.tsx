import { useLocale, useTranslations } from "next-intl";
import { MoonStarIcon } from "lucide-react";
import { ContactPanel } from "@/components/contact/contact-panel";
import { Ltr } from "@/components/common/ltr";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { Price } from "@/components/listing/price";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTime } from "@/lib/format";
import { clockDate, languageName, safeTimeZone } from "@/lib/listing-page/helpers";
import type { ListingPageData, OwnerSummary } from "@/lib/listing-page/types";
import { ownerPath } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "./owner-avatar";
import { OwnerLocalTime } from "./owner-local-time";

export type ShabbatNow = { active: boolean; kind: "shabbat" | "holiday" | null };

/** Avatar, "Hosted by" and the name (→ profile): the contact sheet and the desktop box. */
export function OwnerHeader({ owner, sale = false }: { owner: OwnerSummary; sale?: boolean }) {
  const t = useTranslations("listing.contactBox");
  const role = owner.badges.business ? t("hostedByBusiness") : sale ? t("listedBy") : t("hostedBy");
  return (
    <div className="flex items-center gap-3">
      <OwnerAvatar name={owner.name} image={owner.image} size={40} />
      <div className="grid min-w-0">
        <span className="text-caption text-muted-foreground">{role}</span>
        <Link
          href={ownerPath(owner.id)}
          dir="auto"
          className="truncate rounded font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {owner.name}
        </Link>
      </div>
    </div>
  );
}

/** "Replies after Shabbat" while it is Shabbat or a holiday where the listing is. */
export function ShabbatReplyNotice({ now, className }: { now: ShabbatNow; className?: string }) {
  const t = useTranslations("listing.contactBox");
  if (!now.active) return null;
  return (
    <p className={cn("flex gap-2 rounded-input bg-primary-tint p-3 text-small text-primary-text", className)} role="status">
      <MoonStarIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {now.kind === "holiday" ? t("repliesAfterHoliday") : t("repliesAfterShabbat")}
    </p>
  );
}

/** Desktop, rentals and sales: the price and the contact buttons beside the content. */
export function ContactBox({ data, shabbatNow }: { data: ListingPageData; shabbatNow: ShabbatNow }) {
  return (
    <div className="grid gap-4 rounded-card border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="lg" />
        {data.price ? <CurrencySwitcher align="end" className="h-9 bg-surface-muted px-2.5 hover:bg-surface-muted/70" /> : null}
      </div>
      <OwnerHeader owner={data.owner} sale={data.dealType === "SALE"} />
      <ShabbatReplyNotice now={shabbatNow} />
      <ContactPanel />
    </div>
  );
}

/**
 * The full host card near the end: photo or initials, name, what the team verified, languages,
 * member since, the host's local time and the best time to call. Real data only.
 */
export function HostCard({
  data,
  nowIso,
  shabbatNow,
  showContact,
  report,
}: {
  data: ListingPageData;
  nowIso: string;
  shabbatNow: ShabbatNow;
  /** Phones without a contact bar (preview, own listing, no channels): the panel goes here. */
  showContact: boolean;
  /** "Report listing", under the card. */
  report?: React.ReactNode;
}) {
  const t = useTranslations("listing.host");
  const tc = useTranslations("listing.contactBox");
  const tb = useTranslations("listing.badges");
  const th = useTranslations("listing.header");
  const locale = useLocale();
  const { owner } = data;
  const sale = data.dealType === "SALE";
  const zone = safeTimeZone(owner.timezone);
  const from = clockDate(data.contactHoursFrom);
  const to = clockDate(data.contactHoursTo);

  const checks: string[] = [];
  if (owner.badges.phoneVerified) checks.push(tb("phoneVerified"));
  if (owner.badges.idVerified) checks.push(tb("idVerified"));
  if (data.ownerVerified) checks.push(tb("ownerVerified"));
  if (data.propertyVerified) checks.push(tb("propertyVerified"));
  if (owner.badges.businessVerified) checks.push(tb("businessVerified"));

  const facts: { key: string; icon: SpriteIconName; label: string; value: React.ReactNode }[] = [];
  if (owner.languages.length) {
    facts.push({ key: "languages", icon: "languages", label: tc("languages"), value: owner.languages.map((code) => languageName(code, locale)).join(", ") });
  }
  facts.push({
    key: "since",
    icon: "calendar-check",
    label: tc("memberSince"),
    value: formatDate(owner.memberSince, locale, { month: "long", year: "numeric" }),
  });
  facts.push({ key: "time", icon: "clock", label: tc("localTime"), value: <OwnerLocalTime timeZone={zone} initial={nowIso} /> });
  if (from && to) {
    facts.push({
      key: "call",
      icon: "phone-call",
      label: tc("contactHours"),
      value: (
        <>
          <bdi>{formatTime(from, locale, "UTC")}</bdi> – <bdi>{formatTime(to, locale, "UTC")}</bdi>
        </>
      ),
    });
  }
  const posted = data.publishedAt ?? data.contentUpdatedAt;

  return (
    <section id="host" aria-labelledby="host-title" className="scroll-mt-(--header-height) grid gap-4 border-t border-border pt-8">
      <h2 id="host-title" className="text-h2">
        {sale ? t("titleSale") : t("title")}
      </h2>
      <div className="grid gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <OwnerAvatar name={owner.name} image={owner.image} size={56} />
          <div className="grid min-w-0 gap-0.5">
            <Link
              href={ownerPath(owner.id)}
              dir="auto"
              className="truncate rounded text-body font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {owner.name}
            </Link>
            {owner.badges.business ? <span className="text-small text-muted-foreground">{tc("hostedByBusiness")}</span> : null}
          </div>
        </div>
        {checks.length ? (
          <ul className="grid gap-1.5 text-small" aria-label={tb("label")}>
            {checks.map((check) => (
              <li key={check} className="flex items-center gap-2">
                <SpriteIcon name="badge-check" className="size-4.5 shrink-0 text-success" />
                {check}
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {facts.map(({ key, icon, label, value }) => (
            // dt/dd are direct children of the row (WCAG "definition-list"): the icon sits inside the dt.
            <div key={key} className="relative grid min-w-0 content-start ps-8">
              <dt className="text-caption text-muted-foreground">
                <SpriteIcon name={icon} className="absolute start-0 top-0.5 size-5 text-muted-foreground" />
                {label}
              </dt>
              <dd className="text-small font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <ShabbatReplyNotice now={shabbatNow} />
        {showContact ? <ContactPanel className="lg:hidden" /> : null}
        <Link
          href={ownerPath(owner.id)}
          className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded text-small font-semibold text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("profile")}
          <SpriteIcon name="arrow-right" className="size-4 rtl:-scale-x-100" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <p>
          {th.rich("listingId", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
          <span aria-hidden="true" className="px-1.5">·</span>
          <time dateTime={posted}>
            {th(data.publishedAt ? "posted" : "updated", { date: formatDate(posted, locale, { day: "numeric", month: "short", year: "numeric" }) })}
          </time>
        </p>
        {report}
      </div>
    </section>
  );
}
