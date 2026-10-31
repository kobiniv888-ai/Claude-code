import { useLocale, useTranslations } from "next-intl";
import { CalendarCheckIcon, ClockIcon, LanguagesIcon, MessageCircleReplyIcon, MoonStarIcon, PhoneCallIcon, VideoIcon } from "lucide-react";
import { ContactPanel } from "@/components/contact/contact-panel";
import { Ltr } from "@/components/common/ltr";
import { Price } from "@/components/listing/price";
import { Link } from "@/i18n/navigation";
import { formatDate, formatTime } from "@/lib/format";
import { clockDate, languageName, replyTimeBucket, safeTimeZone } from "@/lib/listing-page/helpers";
import type { ListingPageData, OwnerSummary } from "@/lib/listing-page/types";
import { ownerPath } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "./owner-avatar";
import { OwnerBadges } from "./owner-badges";
import { OwnerLocalTime } from "./owner-local-time";

export type ShabbatNow = { active: boolean; kind: "shabbat" | "holiday" | null };

/** Avatar, name (→ profile) and badges. */
export function OwnerHeader({
  owner,
  ownerVerified = false,
  propertyVerified = false,
}: {
  owner: OwnerSummary;
  ownerVerified?: boolean;
  propertyVerified?: boolean;
}) {
  const t = useTranslations("listing.contactBox");
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <OwnerAvatar name={owner.name} image={owner.image} size={56} />
        <div className="grid min-w-0">
          <span className="text-xs text-muted-foreground">{owner.badges.business ? t("hostedByBusiness") : t("hostedBy")}</span>
          <Link
            href={ownerPath(owner.id)}
            dir="auto"
            className="truncate rounded text-lg font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {owner.name}
          </Link>
        </div>
      </div>
      <OwnerBadges badges={owner.badges} ownerVerified={ownerVerified} propertyVerified={propertyVerified} />
    </div>
  );
}

/** Languages, member since, reply time, local time and contact hours. */
export function OwnerFacts({ owner, contactHours, nowIso }: { owner: OwnerSummary; contactHours?: { from: string | null; to: string | null }; nowIso: string }) {
  const t = useTranslations("listing.contactBox");
  const locale = useLocale();
  const bucket = replyTimeBucket(owner.avgReplyMinutes);
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
    bucket && { icon: MessageCircleReplyIcon, label: t("replyTime"), value: t(`replyTimes.${bucket}`) },
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
    <dl className="grid gap-2.5 text-sm">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="ms-auto text-end font-medium">{value}</dd>
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
    <p className={cn("flex gap-2 rounded-xl bg-secondary p-3 text-sm text-primary", className)} role="status">
      <MoonStarIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {now.kind === "holiday" ? t("repliesAfterHoliday") : t("repliesAfterShabbat")}
    </p>
  );
}

/** The sticky contact box (desktop sidebar; on phones it sits after the title). */
export function ContactBox({ data, shabbatNow, nowIso }: { data: ListingPageData; shabbatNow: ShabbatNow; nowIso: string }) {
  const t = useTranslations("listing.contactBox");
  return (
    <div className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="hidden lg:block">
        <Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="lg" stacked />
      </div>
      <OwnerHeader owner={data.owner} ownerVerified={data.ownerVerified} propertyVerified={data.propertyVerified} />
      <OwnerFacts owner={data.owner} contactHours={{ from: data.contactHoursFrom, to: data.contactHoursTo }} nowIso={nowIso} />
      <ShabbatReplyNotice now={shabbatNow} />
      <ContactPanel />
      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
        <VideoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t.rich("videoTip", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}</span>
      </p>
    </div>
  );
}
