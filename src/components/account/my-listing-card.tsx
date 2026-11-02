"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  HeartIcon,
  ImageOffIcon,
  KeyRoundIcon,
  MousePointerClickIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Ltr } from "@/components/common/ltr";
import { Price } from "@/components/listing/price";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/config/site";
import { Link, useRouter } from "@/i18n/navigation";
import { runListingAction } from "@/lib/account/actions";
import { daysUntil, ownerActionsFor, type MutatingListingAction, type OwnerListingAction } from "@/lib/account/listing-status";
import type { MyListing } from "@/lib/account/queries";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hostCalendarPath } from "@/components/host-calendar/paths";
import { ListingStatusBadge } from "./listing-status-badge";
import { useActionError } from "./use-action-error";

const ICONS: Record<OwnerListingAction, LucideIcon> = {
  continue: PencilIcon,
  edit: PencilIcon,
  view: ExternalLinkIcon,
  stats: BarChart3Icon,
  pause: PauseIcon,
  unpause: PlayIcon,
  renew: RefreshCwIcon,
  markRented: KeyRoundIcon,
  markSold: KeyRoundIcon,
  bump: RocketIcon,
  delete: Trash2Icon,
};

/** Actions that hide the listing or remove it ask first. */
const CONFIRM: readonly MutatingListingAction[] = ["delete", "markRented", "markSold"];

function primaryAction(actions: OwnerListingAction[], status: MyListing["status"]): OwnerListingAction | null {
  if (actions.includes("continue")) return "continue";
  if (actions.includes("unpause")) return "unpause";
  if (actions.includes("renew") && status !== "LIVE") return "renew";
  return actions.includes("edit") ? "edit" : null;
}

export function MyListingCard({ listing }: { listing: MyListing }) {
  const t = useTranslations("account.listings");
  const tCalendar = useTranslations("hostBooking.listingCard");
  const tm = useTranslations("moderation");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useActionError();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<MutatingListingAction | null>(null);

  const actions = ownerActionsFor(listing, { bumpEnabled: siteConfig.features.bump });
  const primary = primaryAction(actions, listing.status);
  // Stays and rentals get their calendar (block dates, bookings, iCal) next to the main action;
  // statistics then move into the "more" menu.
  const calendarHref =
    listing.status !== "DRAFT" && listing.status !== "DELETED" && listing.dealType !== "SALE" ? hostCalendarPath(listing.id) : null;
  const secondary: OwnerListingAction | null = !calendarHref && actions.includes("stats") && primary !== "stats" ? "stats" : null;
  const menu = actions.filter((a) => a !== primary && a !== secondary);
  const title = listing.title || t("untitled");
  const titleId = `my-listing-${listing.id}`;
  const left = daysUntil(listing.expiresAt);
  const showsReason = listing.status === "NEEDS_CHANGES" || listing.status === "REJECTED";
  const reasonKey = listing.moderationReason && tm.has(`reasons.${listing.moderationReason}.label`) ? listing.moderationReason : null;

  const hrefFor = (action: OwnerListingAction): string | null => {
    switch (action) {
      case "continue":
        return `/post/${listing.id}`;
      case "edit":
        return `/account/listings/${listing.id}/edit`;
      case "stats":
        return `/account/listings/${listing.id}/stats`;
      case "view":
        return listing.href;
      default:
        return null;
    }
  };

  const run = (action: MutatingListingAction) => {
    startTransition(async () => {
      const result = await runListingAction({ listingId: listing.id, action });
      setConfirming(null);
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      if (action === "bump" && !result.data.changed) toast(t("toast.bumpLater"));
      else if (action === "renew" && !result.data.changed) toast(t("toast.renewLater"));
      // Edited since the last check and the checks want a person to look (see ownerAction).
      else if ((action === "unpause" || action === "renew") && result.data.status === "IN_REVIEW") toast(t("toast.inReview"));
      else toast.success(t(`toast.${action}`));
      router.refresh();
    });
  };

  const trigger = (action: OwnerListingAction) => {
    if (hrefFor(action)) return;
    const mutating = action as MutatingListingAction;
    if (CONFIRM.includes(mutating)) setConfirming(mutating);
    else run(mutating);
  };

  const label = (action: OwnerListingAction) => t(`actions.${action}`);

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-4 rounded-2xl border bg-card p-3 shadow-xs sm:flex-row sm:p-4">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-44">
        {listing.coverUrl ? (
          <Image src={listing.coverUrl} alt="" fill sizes="(min-width: 640px) 176px, 100vw" className="object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOffIcon className="size-7" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ListingStatusBadge status={listing.status} />
          {listing.ownerVerified ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-tint px-2.5 text-xs font-semibold text-success">
              <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
              {t("ownerVerified")}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t("id")} <Ltr>{listing.publicId}</Ltr>
          </span>
        </div>

        <div className="grid gap-1">
          <h3 id={titleId} className="line-clamp-2 font-semibold break-words" dir="auto">
            {title}
          </h3>
          {listing.place ? <p className="text-sm text-muted-foreground">{listing.place}</p> : null}
          <Price amount={listing.price.amount} currency={listing.price.currency} period={listing.price.period} from={listing.price.from} size="sm" />
        </div>

        {showsReason ? (
          <div className="rounded-xl border border-border-strong/30 bg-surface-muted p-3 text-sm">
            <p className="font-semibold">{reasonKey ? tm(`reasons.${reasonKey}.label`) : tm(`statuses.${listing.status}.label`)}</p>
            <p className="mt-1 text-muted-foreground">
              {reasonKey ? tm(`reasons.${reasonKey}.explanation`) : tm(`statuses.${listing.status}.description`)}
            </p>
            {listing.moderationNote ? (
              <p className="mt-2 border-s-2 border-border-strong/50 ps-3">
                <span className="block text-xs font-semibold text-muted-foreground">{t("moderatorNote")}</span>
                <span dir="auto" className="whitespace-pre-line">
                  {listing.moderationNote}
                </span>
              </p>
            ) : null}
          </div>
        ) : listing.status !== "LIVE" ? (
          <p className="text-sm text-muted-foreground">{tm(`statuses.${listing.status}.description`)}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {listing.status === "DRAFT" ? (
            <span>{t("draftStep", { step: formatNumber(listing.wizardStep, locale) })}</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1" title={t("counters.views")}>
                <EyeIcon className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("counters.views")}</span>
                {formatNumber(listing.views, locale)}
              </span>
              <span className="inline-flex items-center gap-1" title={t("counters.contacts")}>
                <MousePointerClickIcon className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("counters.contacts")}</span>
                {formatNumber(listing.contacts, locale)}
              </span>
              <span className="inline-flex items-center gap-1" title={t("counters.saves")}>
                <HeartIcon className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("counters.saves")}</span>
                {formatNumber(listing.saves, locale)}
              </span>
            </>
          )}
          {(listing.status === "LIVE" || listing.status === "PAUSED") && left !== null ? (
            <span className={cn(left <= 7 && "font-medium text-foreground")}>
              {left === 0 ? t("expiresToday") : t("expiresIn", { count: left, countText: formatNumber(left, locale) })}
            </span>
          ) : null}
          {listing.status === "EXPIRED" && listing.expiresAt ? (
            <span>{t("expiredOn", { date: formatDate(listing.expiresAt, locale, { dateStyle: "medium" }) })}</span>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {([primary, secondary] as const).map((action, i) => {
            if (!action) return null;
            const Icon = ICONS[action];
            const href = hrefFor(action);
            const variant = i === 0 ? "default" : "outline";
            return href ? (
              <Button key={action} asChild variant={variant} className="h-10 rounded-xl px-4">
                <Link href={href}>
                  <Icon aria-hidden="true" />
                  {label(action)}
                </Link>
              </Button>
            ) : (
              <Button key={action} variant={variant} className="h-10 rounded-xl px-4" disabled={pending} onClick={() => trigger(action)}>
                <Icon aria-hidden="true" />
                {label(action)}
              </Button>
            );
          })}
          {calendarHref ? (
            <Button asChild variant="outline" className="h-10 rounded-xl px-4">
              <Link href={calendarHref}>
                <CalendarDaysIcon aria-hidden="true" />
                {tCalendar("calendar")}
              </Link>
            </Button>
          ) : null}
          {menu.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl px-3" disabled={pending} aria-label={t("moreFor", { title })}>
                  <EllipsisVerticalIcon aria-hidden="true" />
                  <span className="hidden sm:inline">{t("more")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {menu.map((action) => {
                  const Icon = ICONS[action];
                  const href = hrefFor(action);
                  const destructive = action === "delete";
                  return (
                    <div key={action}>
                      {destructive ? <DropdownMenuSeparator /> : null}
                      {href ? (
                        <DropdownMenuItem asChild className="min-h-10">
                          <Link href={href}>
                            <Icon aria-hidden="true" />
                            {label(action)}
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="min-h-10"
                          variant={destructive ? "destructive" : "default"}
                          onSelect={() => trigger(action)}
                        >
                          <Icon aria-hidden="true" />
                          {label(action)}
                        </DropdownMenuItem>
                      )}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !pending && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming ? t(`confirm.${confirming}.title`) : null}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming ? t(`confirm.${confirming}.body`, { title }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("confirm.cancel")}</AlertDialogCancel>
            <Button
              variant={confirming === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => confirming && run(confirming)}
            >
              {pending ? t("working") : confirming ? t(`confirm.${confirming}.action`) : null}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
