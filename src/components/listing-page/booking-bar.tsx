"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDaysIcon, CheckIcon, EllipsisIcon, GitCompareArrowsIcon, MessageCircleQuestionIcon, UsersRoundIcon } from "lucide-react";
import { DatesGuestsSheet } from "@/components/booking/dates-guests-sheet";
import { useGuestSummary } from "@/components/booking/guest-summary";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button, buttonStyles } from "@/components/ds/button";
import { StickyContactBar } from "@/components/ds/sticky-contact-bar";
import { ChannelIcon } from "@/components/contact/channel-icon";
import { ContactPanel } from "@/components/contact/contact-panel";
import { useContact } from "@/components/contact/contact-provider";
import { Price } from "@/components/listing/price";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompare } from "@/hooks/use-compare";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { contactLayout } from "@/lib/listing-page/helpers";
import { COMPARE_PATH } from "@/lib/listing/urls";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useStay, useStayMoney } from "./stay-dates";

/** The phone bar's height goes to --bottom-nav-height, so the page end and toasts make room. */
const BAR_SPACE_CSS =
  "@media (width < 64rem){body:has([data-listing-contact-bar]){--bottom-nav-height:calc(4.5rem + 1px + env(safe-area-inset-bottom, 0px))}}";

/** "Choose dates": the dates and guests sheet (a dialog on desktop), on to the review page. */
export function DatesSheet() {
  return <DatesGuestsSheet mode="continue" />;
}

/** "3 nights · Total ≈ ₪1,310" once both dates are chosen. */
function StaySummary({ className }: { className?: string }) {
  const t = useTranslations("listing.booking");
  const tc = useTranslations("listing.calendar");
  const money = useStayMoney();
  const { nights, total, price } = useStay();
  if (nights === 0) return null;
  const nightsText = tc("nights", { count: nights });
  return (
    <span className={cn("block truncate text-caption text-muted-foreground", className)}>
      {total !== null ? t("summary", { nights: nightsText, total: money(total, price.currency) }) : nightsText}
    </span>
  );
}

/**
 * The main action: "Book" with dates (→ the review page), else "Choose dates" (→ the sheet).
 * Listings without instant booking (the host has not saved booking settings) ask the host instead.
 */
function BookButton({ block = false }: { block?: boolean }) {
  const t = useTranslations("listing.booking");
  const { bookHref, setSheetOpen, instant } = useStay();
  const { listing, availability, contact, revealing } = useContact();
  const { primary } = contactLayout(listing.channels);
  if (!instant && availability === "ok" && primary) {
    return (
      <Button block={block} className="px-4" disabled={revealing} onClick={() => contact(primary)}>
        {primary === "WHATSAPP" ? <ChannelIcon channel={primary} className="size-5" /> : <MessageCircleQuestionIcon aria-hidden />}
        {t("ask")}
      </Button>
    );
  }
  if (bookHref && instant) {
    return (
      <Link href={bookHref} className={buttonStyles({ block, className: "px-5" })}>
        {t("book")}
      </Link>
    );
  }
  return (
    <Button block={block} className="px-4" onClick={() => setSheetOpen(true)}>
      <CalendarDaysIcon aria-hidden />
      {t("chooseDates")}
    </Button>
  );
}

function useCompareItem(publicId: number) {
  const t = useTranslations("listingCard.compare");
  const router = useRouter();
  const compare = useCompare();
  const active = compare.has(publicId);
  const openCompare = { label: t("open"), onClick: () => router.push(COMPARE_PATH) };
  return {
    active,
    label: active ? t("remove") : t("add"),
    toggle: () => {
      const result = compare.toggle(publicId);
      if (result === "full") toast.error(t("full", { count: compare.max }), { action: openCompare });
      else if (result === "added") toast.success(t("added"), compare.count + 1 >= 2 ? { action: openCompare } : undefined);
      else if (result === "removed") toast(t("removed"));
    },
  };
}

/** The contact sheet ("All ways to contact"): the owner's channels after "Show contact". */
function ContactSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("contact");
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("contactOwner")}>
      <div className="grid gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <ContactPanel />
      </div>
    </BottomSheet>
  );
}

/**
 * Short stays and hotel rooms on phones: the nightly price (and the total once dates are chosen)
 * with a purple "Book" / "Choose dates" button. "Ask the host" (the owner's WhatsApp, through the
 * contact flow: login, safety tip, click count), all contact options and "Compare" are in "…".
 */
export function BookingBar() {
  const t = useTranslations("listing.booking");
  const tc = useTranslations("contact");
  const { listing, availability, contact, reveal, revealing } = useContact();
  const { price } = useStay();
  const compareItem = useCompareItem(listing.publicId);
  const [contactOpen, setContactOpen] = useState(false);
  const canContact = availability === "ok" && listing.channels.length > 0;
  const { primary } = contactLayout(listing.channels);

  return (
    <>
      <style>{BAR_SPACE_CSS}</style>
      <StickyContactBar
        label={t("barLabel")}
        spacer={false}
        className="bottom-0 animate-sheet-up pb-[env(safe-area-inset-bottom,0px)] motion-reduce:animate-none"
        price={
          <div className="grid min-w-0">
            <Price amount={price.amount} currency={price.currency} period={price.period} from={price.from} size="line" showOriginal={false} className="flex-nowrap" />
            <StaySummary />
          </div>
        }
        primary={<BookButton />}
        menu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("more")}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" sideOffset={10} className="min-w-60 rounded-xl p-1.5">
              {canContact && primary ? (
                <>
                  <DropdownMenuItem className="min-h-11 gap-3 rounded-lg" disabled={revealing} onSelect={() => contact(primary)}>
                    {primary === "WHATSAPP" ? <ChannelIcon channel={primary} className="size-5" /> : <MessageCircleQuestionIcon className="size-5" aria-hidden />}
                    <span className="grid">
                      {t("ask")}
                      <span className="text-caption text-muted-foreground">{tc(`channel.${primary}`)}</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-3 rounded-lg" disabled={revealing} onSelect={() => reveal(() => setContactOpen(true))}>
                    <UsersRoundIcon className="size-5" aria-hidden="true" />
                    {tc("allOptions")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem className="min-h-11 gap-3 rounded-lg" onSelect={compareItem.toggle}>
                {compareItem.active ? <CheckIcon className="size-5" aria-hidden /> : <GitCompareArrowsIcon className="size-5" aria-hidden />}
                {compareItem.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {canContact ? <ContactSheet open={contactOpen} onOpenChange={setContactOpen} /> : null}
    </>
  );
}

/** One date "field" of the desktop box: the label and the chosen day, opens the dates sheet. */
function DateField({ label, value, onClick, className }: { label: string; value: string | null; onClick: () => void; className?: string }) {
  const t = useTranslations("listing.booking");
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("grid min-h-14 content-center px-3 py-2 text-start outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span className="text-caption font-semibold text-foreground">{label}</span>
      <span className={cn("text-small", value ? "text-foreground" : "text-muted-foreground")}>
        {value ? formatDate(value, locale, { weekday: "short", day: "numeric", month: "short" }) : t("addDate")}
      </span>
    </button>
  );
}

/**
 * Desktop: the booking box beside the content. The price, the two dates (they open the
 * calendar), the price breakdown once dates are chosen, "Book", and "Ask the host" / "Compare".
 */
export function BookingBox() {
  const t = useTranslations("listing.booking");
  const tc = useTranslations("listing.calendar");
  const { listing, availability, contact, revealing } = useContact();
  const ts = useTranslations("booking.sheet");
  const guestSummary = useGuestSummary();
  const { dates, nights, quote, price, setSheetOpen, rules, guests } = useStay();
  const compareItem = useCompareItem(listing.publicId);
  const { primary } = contactLayout(listing.channels);
  const canContact = availability === "ok" && !!primary;
  const open = () => setSheetOpen(true);

  return (
    <div className="grid gap-4 rounded-card border border-border bg-card p-5">
      <Price amount={price.amount} currency={price.currency} period={price.period} from={price.from} size="lg" />
      <div className="grid grid-cols-2 overflow-hidden rounded-input border border-border-strong">
        <DateField label={t("checkIn")} value={dates.checkIn} onClick={open} className="border-e border-border-strong" />
        <DateField label={t("checkOut")} value={dates.checkOut} onClick={open} />
        <button
          type="button"
          onClick={open}
          className="col-span-2 grid min-h-14 content-center border-t border-border-strong px-3 py-2 text-start outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="text-caption font-semibold text-foreground">{ts("guests")}</span>
          <span className="text-small text-foreground">{guestSummary(guests)}</span>
        </button>
      </div>
      <BookButton block />
      {rules.minNights && rules.minNights > 1 && nights === 0 ? (
        <p className="text-center text-caption text-muted-foreground">{tc("minStay", { count: rules.minNights })}</p>
      ) : null}
      {quote ? <PriceBreakdown quote={quote} /> : null}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border pt-3">
        {canContact ? (
          <Button variant="ghost" size="sm" className="h-11" disabled={revealing} onClick={() => contact(primary)}>
            {primary === "WHATSAPP" ? <ChannelIcon channel={primary} className="size-4" /> : <MessageCircleQuestionIcon aria-hidden />}
            {t("ask")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="h-11" aria-pressed={compareItem.active} onClick={compareItem.toggle}>
          {compareItem.active ? <CheckIcon aria-hidden /> : <GitCompareArrowsIcon aria-hidden />}
          {compareItem.label}
        </Button>
      </div>
    </div>
  );
}
