"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarHeartIcon, InfoIcon, SparklesIcon, TagIcon, Trash2Icon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Ltr } from "@/components/common/ltr";
import { Input } from "@/components/ui/input";
import { Field, NumberInput } from "@/components/wizard/fields";
import type { CurrencyCode } from "@/config/site";
import { MAX_STAY_NIGHTS } from "@/lib/booking/constants";
import { deleteDatePriceAction, saveDatePriceAction } from "@/lib/booking/date-price-actions";
import { DATE_PRICE_LIMITS, isDatePriceError, type HostDatePrice } from "@/lib/booking/date-prices";
import { addDays } from "@/lib/booking/dates";
import { currencySymbol, formatDateRange, formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { HolidayPeriod } from "./model";

/** Calendar pricing context: the listing's currency and the prices a holiday price replaces. */
export type CalendarPricing = { currency: CurrencyCode; nightlyPrice: number | null; weekendPrice: number | null };

/** A hotel room type a holiday price can be for (round 3), with the prices it replaces. */
export type PriceRoomType = { id: string; name: string } & CalendarPricing;

/** The nights a holiday price is for (inclusive), from the calendar's selection. */
export type PriceSelection = { start: string; last: string; nights: number };

const MAX_FOR: Record<string, number> = {
  label_too_long: DATE_PRICE_LIMITS.labelMax,
  too_many: DATE_PRICE_LIMITS.maxPerListing,
  too_many_nights: DATE_PRICE_LIMITS.maxNights,
};

/** A failed save or delete in words (`hostBooking.calendar.prices.errors`). */
function useErrorText() {
  const t = useTranslations("hostBooking.calendar.prices.errors");
  return (code: string | null | undefined) => {
    if (code && (isDatePriceError(code) || code === "rate_limited")) return t(code, { max: MAX_FOR[code] ?? 0 });
    return t("failed");
  };
}

/**
 * "מחיר לתאריכים" (round 3, brief 6.3): a price per night for the selected nights, an optional
 * minimum stay and an optional note for guests ("פסח"). The server checks everything again
 * (owner, dates from today, no overlap with another holiday price).
 */
export function DatePriceSheet({
  listingId,
  selection,
  pricing,
  roomTypes = [],
  initialRoomTypeId = null,
  holidays,
  onClose,
  onSaved,
  onCloseAutoFocus,
}: {
  listingId: string;
  selection: PriceSelection | null;
  pricing: CalendarPricing;
  /** Hotels: the price can be for one room type instead of every room (round 3). */
  roomTypes?: PriceRoomType[];
  /** Hotels: the room type the form starts with (a room type's own calendar); null = every room. */
  initialRoomTypeId?: string | null;
  /** Names of the holidays inside the selection ("פסח"), to suggest the note. */
  holidays: string[];
  onClose: () => void;
  onSaved: (prices: HostDatePrice[]) => void;
  /** Where focus goes when the sheet closes (the opener may be gone after a save). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <BottomSheet open={selection !== null} onOpenChange={(open) => !open && onClose()} title={<SheetTitle />} onCloseAutoFocus={onCloseAutoFocus}>
      {selection ? (
        <DatePriceForm
          key={`${selection.start}|${selection.last}`}
          listingId={listingId}
          selection={selection}
          pricing={pricing}
          roomTypes={roomTypes}
          initialRoomTypeId={initialRoomTypeId}
          holidays={holidays}
          onSaved={onSaved}
        />
      ) : null}
    </BottomSheet>
  );
}

function SheetTitle() {
  const t = useTranslations("hostBooking.calendar.prices");
  return <>{t("sheetTitle")}</>;
}

function DatePriceForm({
  listingId,
  selection,
  pricing: listingPricing,
  roomTypes,
  initialRoomTypeId,
  holidays,
  onSaved,
}: {
  listingId: string;
  selection: PriceSelection;
  pricing: CalendarPricing;
  roomTypes: PriceRoomType[];
  initialRoomTypeId: string | null;
  holidays: string[];
  onSaved: (prices: HostDatePrice[]) => void;
}) {
  const t = useTranslations("hostBooking.calendar.prices");
  const locale = useLocale();
  const errorText = useErrorText();
  const [price, setPrice] = useState<number | null>(null);
  const [minNights, setMinNights] = useState<number | null>(null);
  // A holiday inside the selection is the obvious note; the host can change or clear it.
  const [label, setLabel] = useState(holidays.length === 1 ? holidays[0] : "");
  const [error, setError] = useState<{ field: "price" | "minNights" | "label" | "form"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Hotels (round 3): every room, or one room type (its own price wins on those nights). A price
  // for every room is in the listing's currency, so it is offered only while every room type
  // uses that currency (the server refuses it otherwise).
  const allRoomsAllowed = roomTypes.every((r) => r.currency === listingPricing.currency);
  const [roomTypeId, setRoomTypeId] = useState<string | null>(() =>
    initialRoomTypeId && roomTypes.some((r) => r.id === initialRoomTypeId) ? initialRoomTypeId : allRoomsAllowed ? null : (roomTypes[0]?.id ?? null),
  );
  const room = roomTypes.find((r) => r.id === roomTypeId) ?? null;
  const pricing: CalendarPricing = room ?? listingPricing;
  const money = (amount: number) => formatMoney(amount, pricing.currency, locale);

  const save = async () => {
    if (saving) return;
    if (!price || price <= 0) {
      setError({ field: "price", text: errorText("price_required") });
      return;
    }
    if (minNights !== null && (minNights < 1 || minNights > MAX_STAY_NIGHTS)) {
      setError({ field: "minNights", text: t("minNightsRange", { max: MAX_STAY_NIGHTS }) });
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveDatePriceAction({ listingId, roomTypeId, start: selection.start, last: selection.last, price, minNights, label }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      toast.success(t("saved"));
      onSaved(result.data.datePrices);
      return;
    }
    const code = result && !result.ok ? result.error : null;
    setError({
      field: code === "price_required" || code === "price_too_high" ? "price" : code === "label_too_long" || code === "label_contact_info" ? "label" : "form",
      text: errorText(code),
    });
  };

  const regularOf = (of: CalendarPricing) => {
    const cost = (amount: number) => `⁦${formatMoney(amount, of.currency, locale)}⁩`;
    if (!of.nightlyPrice) return null;
    return of.weekendPrice ? t("regularWeekend", { price: cost(of.nightlyPrice), weekend: cost(of.weekendPrice) }) : cost(of.nightlyPrice);
  };
  // Every room of a hotel: one price instead of each room type's own, so list what it replaces.
  const allRoomsRegular = roomTypes
    .map((r) => {
      const text = regularOf(r);
      return text ? `${r.name || t("roomUnnamed")} ${text}` : null;
    })
    .filter((text): text is string => text !== null);
  const regular =
    !room && roomTypes.length > 0
      ? allRoomsRegular.length > 0
        ? t("allRoomsHelp", { prices: allRoomsRegular.join(" · ") })
        : undefined
      : pricing.nightlyPrice
        ? pricing.weekendPrice
          ? t("priceHelpWeekend", { price: `⁦${money(pricing.nightlyPrice)}⁩`, weekend: `⁦${money(pricing.weekendPrice)}⁩` })
          : t("priceHelp", { price: `⁦${money(pricing.nightlyPrice)}⁩` })
        : undefined;

  return (
    <form
      className="grid gap-5 px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
    >
      <div className="grid gap-1">
        <p className="text-body font-semibold">
          {t("sheetDates", {
            dates: formatDateRange(selection.start, selection.last, locale, { day: "numeric", month: "long" }),
            nights: t("nights", { count: selection.nights }),
          })}
        </p>
        {holidays.length > 0 ? (
          <p className="flex items-center gap-1.5 text-small text-primary-text">
            <CalendarHeartIcon className="size-4 shrink-0" aria-hidden />
            {t("holidayInRange", { names: holidays.join(" · ") })}
          </p>
        ) : null}
      </div>

      {roomTypes.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-small font-semibold">{t("roomScope")}</legend>
          <div className="flex flex-wrap gap-2">
            {[...(allRoomsAllowed ? [null] : []), ...roomTypes.map((r) => r.id)].map((id) => {
              const option = roomTypes.find((r) => r.id === id);
              return (
                <label
                  key={id ?? "all"}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-small font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    roomTypeId === id ? "border-primary bg-primary-tint text-primary-text" : "border-border-strong bg-card hover:bg-surface-muted",
                  )}
                >
                  <input type="radio" name="price-room" className="sr-only" checked={roomTypeId === id} onChange={() => setRoomTypeId(id)} />
                  <span dir="auto">{option ? option.name : t("allRooms")}</span>
                </label>
              );
            })}
          </div>
          {/* "A room type's own price comes before the all-rooms price": only while there is one. */}
          {room && allRoomsAllowed ? <p className="text-caption text-muted-foreground">{t("roomScopeHelp")}</p> : null}
          {allRoomsAllowed ? null : <p className="text-caption text-muted-foreground">{t("roomCurrencyHelp")}</p>}
        </fieldset>
      ) : null}

      <Field label={t("priceLabel")} description={regular} error={error?.field === "price" ? error.text : null}>
        {(props) => (
          <NumberInput
            {...props}
            decimals
            value={price}
            onChange={(value) => {
              setPrice(value);
              if (error?.field === "price") setError(null);
            }}
            prefix={<Ltr>{currencySymbol(pricing.currency)}</Ltr>}
            className="text-lg sm:max-w-xs"
            maxLength={10}
            autoFocus
          />
        )}
      </Field>

      <Field label={t("minNightsLabel")} description={t("minNightsHelp")} error={error?.field === "minNights" ? error.text : null} optional>
        {(props) => (
          <NumberInput
            {...props}
            value={minNights}
            onChange={(value) => {
              setMinNights(value);
              if (error?.field === "minNights") setError(null);
            }}
            maxLength={2}
            className="sm:max-w-40"
          />
        )}
      </Field>

      <Field label={t("labelLabel")} description={t("labelHelp")} error={error?.field === "label" ? error.text : null} optional>
        {(props) => (
          <Input
            {...props}
            dir="auto"
            value={label}
            maxLength={DATE_PRICE_LIMITS.labelMax}
            placeholder={t("labelPlaceholder")}
            onChange={(event) => setLabel(event.target.value)}
            className="h-11 text-base"
          />
        )}
      </Field>

      {error?.field === "form" ? (
        <p role="alert" className="rounded-input border border-destructive/40 bg-destructive/5 p-3 text-small font-medium text-destructive">
          {error.text}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" block disabled={saving} aria-busy={saving || undefined}>
          <TagIcon aria-hidden />
          {saving ? t("saving") : t("save")}
        </Button>
        <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("bookedNote")}
        </p>
      </div>
    </form>
  );
}

/** "מחירים מיוחדים ללילה": the holiday prices from today on, each with "delete". */
export function DatePriceList({
  listingId,
  prices,
  onChange,
  roomTypes = [],
}: {
  listingId: string;
  prices: HostDatePrice[];
  onChange: (prices: HostDatePrice[]) => void;
  /** Hotels: room types' own prices are listed with the room type's name (round 3). */
  roomTypes?: PriceRoomType[];
}) {
  const t = useTranslations("hostBooking.calendar.prices");
  const locale = useLocale();
  const errorText = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);
  const roomName = (id: string | null) => (id ? (roomTypes.find((r) => r.id === id)?.name ?? null) : null);
  // A room type's own price shows only while the room type is listed (hotels).
  const shown = prices.filter((p) => p.roomTypeId === null || roomName(p.roomTypeId) !== null);

  const remove = async (price: HostDatePrice) => {
    if (busy) return;
    setBusy(price.id);
    const result = await deleteDatePriceAction({ listingId, id: price.id }).catch(() => null);
    setBusy(null);
    if (result?.ok) {
      onChange(result.data.datePrices);
      toast.success(t("deleted"));
    } else {
      toast.error(errorText(result && !result.ok ? result.error : null));
    }
  };

  return (
    <section aria-labelledby="date-prices-title" className="grid gap-3 border-t border-border pt-4">
      <div className="grid gap-1">
        <h3 id="date-prices-title" className="flex items-center gap-2 text-h3">
          <TagIcon className="size-5 text-primary-text" aria-hidden />
          {t("title")}
        </h3>
        <p className="text-small text-pretty text-muted-foreground">{t("lead")}</p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-4 text-small text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((price) => {
            const nights = Math.round((Date.parse(price.end) - Date.parse(price.start)) / 86_400_000);
            const dates = formatDateRange(price.start, addDays(price.end, -1), locale, { day: "numeric", month: "short", year: "numeric" });
            return (
              <li key={price.id} className="flex items-center gap-3 rounded-card border border-border bg-card p-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="text-small font-semibold">
                    {dates} <span className="font-normal text-muted-foreground">· {t("nights", { count: nights })}</span>
                  </p>
                  {roomTypes.length > 0 ? (
                    <p className="truncate text-caption text-primary-text">
                      {price.roomTypeId ? <span dir="auto">{roomName(price.roomTypeId)}</span> : t("allRooms")}
                    </p>
                  ) : null}
                  <p className="text-small">
                    <span className="font-semibold">{t("perNight", { price: `⁦${formatMoney(price.price, price.currency, locale)}⁩` })}</span>
                    {price.minNights ? <span className="text-muted-foreground"> · {t("minNights", { count: price.minNights })}</span> : null}
                  </p>
                  {price.label ? (
                    <p dir="auto" className="truncate text-caption text-muted-foreground">
                      {price.label}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy !== null}
                  aria-busy={busy === price.id || undefined}
                  aria-label={t("delete", { dates })}
                  onClick={() => void remove(price)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * "חגים בחודשים האלה": the Jewish holidays of the two months shown (Israel schedule), with the hint
 * that demand from Israel peaks then. A tap selects the holiday's dates for a price.
 */
export function HolidayChips({ periods, onSelect }: { periods: HolidayPeriod[]; onSelect: (period: HolidayPeriod) => void }) {
  const t = useTranslations("hostBooking.calendar.holidays");
  const locale = useLocale();
  if (periods.length === 0) return null;
  return (
    <section aria-labelledby="calendar-holidays-title" className="grid gap-2 rounded-card border border-primary-tint-border bg-primary-tint p-3">
      <h3 id="calendar-holidays-title" className="flex items-center gap-2 text-small font-semibold">
        <SparklesIcon className="size-4 text-primary-text" aria-hidden />
        {t("title")}
      </h3>
      <p className="text-small text-pretty text-muted-foreground">{t("hint")}</p>
      <ul className="flex flex-wrap gap-2">
        {periods.map((period) => {
          const dates = formatDateRange(period.start, period.last, locale, { day: "numeric", month: "short" });
          return (
            <li key={`${period.key}-${period.start}`}>
              <button
                type="button"
                onClick={() => onSelect(period)}
                aria-label={t("select", { name: period.name, dates })}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary-tint-border bg-card px-3 text-small font-medium text-foreground",
                  "outline-none transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                <CalendarHeartIcon className="size-4 shrink-0 text-primary-text" aria-hidden />
                {t("chip", { name: period.name, dates })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
