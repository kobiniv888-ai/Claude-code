"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { BedDouble, CalendarDays, MapPin, Minus, Plus, Search, Users, type LucideIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ds/button";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { useCurrency } from "@/components/providers/currency-provider";
import { PlaceCombobox, type PopularPlace } from "@/components/search/place-combobox";
import { useRouter } from "@/i18n/navigation";
import { currencySymbol, formatDate, formatNumber } from "@/lib/format";
import { asksForDates, HOME_ROOM_OPTIONS, homeSearchFilters, parseBudget, type HomeSearchState } from "@/lib/home/search-card";
import { searchPath } from "@/lib/listing/urls";
import { formatStay } from "@/lib/search/format-stay";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import { MAX_GUESTS, SEARCH_BAR_DEALS, type SearchBarDeal } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";

// The calendar (react-day-picker) and the sheet (vaul) load the first time "When?" is opened.
const loadDatesSheet = () => import("./home-dates-sheet");
const HomeDatesSheet = dynamic(() => loadDatesSheet().then((m) => m.HomeDatesSheet), { ssr: false });

export type HomeSearchLabels = {
  label: string;
  dealLabel: string;
  deals: Record<SearchBarDeal, string>;
  where: string;
  when: string;
  addDates: string;
  datesTitle: string;
  datesDone: string;
  clearDates: string;
  guests: string;
  /** Shown while no number is chosen (0 = any number of guests). */
  guestsAny: string;
  /** "1 guest" … "16 guests" (index = count - 1). */
  guestCounts: string[];
  fewerGuests: string;
  moreGuests: string;
  rooms: string;
  roomsAny: string;
  /** "1 or more rooms" … (index = count - 1), read out by screen readers next to "2+". */
  roomCounts: string[];
  fewerRooms: string;
  moreRooms: string;
  budget: string;
  budgetMonthly: string;
  budgetPlaceholder: string;
  submit: string;
};

const INITIAL: HomeSearchState = {
  deal: "short-stay",
  place: null,
  checkIn: null,
  checkOut: null,
  guests: 0,
  rooms: 0,
  budget: null,
};

/**
 * The home search card (brief round 2, 3.8 and 5.2): the four deal tabs, "Where to?" with instant
 * suggestions, then two half-width fields ("When?" + "Guests" for short stays and hotels, "Rooms" +
 * "Budget" for monthly rentals and buying) and a full-width purple "Search" → /search?…
 * Every tab has the same height, so the card never jumps and always fits above the bottom nav.
 * White with a soft shadow in light mode; a #18161F card with a hairline border in dark mode.
 */
export function HomeSearchCard({
  labels,
  popular,
  holidays,
}: {
  labels: HomeSearchLabels;
  popular: PopularPlace[];
  holidays: HolidayMark[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const { currency } = useCurrency();
  const [state, setState] = useState<HomeSearchState>(INITIAL);
  const [budgetText, setBudgetText] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const ids = useId();
  const datesButton = useRef<HTMLButtonElement>(null);

  const patch = (next: Partial<HomeSearchState>) => setState((s) => ({ ...s, ...next }));
  const withDates = asksForDates(state.deal);
  const symbol = currencySymbol(currency);

  function openDates() {
    setDatesLoaded(true);
    setDatesOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(searchPath(homeSearchFilters(state)));
  }

  const datesValue =
    state.checkIn && state.checkOut
      ? compactStay(state.checkIn, state.checkOut, locale)
      : state.checkIn
        ? formatDate(state.checkIn, locale, { day: "numeric", month: "short" })
        : null;

  const maxRooms = HOME_ROOM_OPTIONS[HOME_ROOM_OPTIONS.length - 1];

  return (
    <form
      role="search"
      aria-label={labels.label}
      onSubmit={submit}
      className="rounded-card bg-card p-3 text-start text-card-foreground shadow-raised sm:p-4 md:p-5 dark:border dark:border-border dark:shadow-none"
    >
      <SegmentedControl
        aria-label={labels.dealLabel}
        options={SEARCH_BAR_DEALS.map((deal) => ({ value: deal, label: labels.deals[deal] }))}
        value={state.deal}
        onValueChange={(deal) => patch({ deal })}
        // Russian, Georgian and English labels are long ("Short stay" wrapped onto two lines):
        // smaller text on narrow phones so all four fit on one line.
        className={cn(
          "md:max-w-xl",
          (locale === "ka" || locale === "ru" || locale === "en") &&
            "max-sm:[&_[role=radio]]:px-1 max-sm:[&_[role=radio]]:text-xs",
        )}
      />

      <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-stretch md:gap-3">
        <Field icon={MapPin} className="col-span-2 md:col-span-1">
          <PlaceCombobox
            value={state.place}
            onChange={(place) => patch({ place })}
            popular={popular}
            label={labels.where}
            // Next field: "When?" (focus only; the calendar opens on tap).
            onPicked={() => datesButton.current?.focus()}
            className="min-w-0 flex-1"
            inputClassName="mt-0.5 h-7 text-base"
          />
        </Field>

        {withDates ? (
          <>
            <button
              ref={datesButton}
              type="button"
              onClick={openDates}
              onPointerEnter={() => void loadDatesSheet()}
              onFocus={() => void loadDatesSheet()}
              aria-haspopup="dialog"
              className={cn(fieldClass, "text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
            >
              <CalendarDays className="size-5 shrink-0 text-primary max-[379px]:hidden" aria-hidden="true" />
              <span className="grid min-w-0">
                <span className="truncate text-caption font-semibold text-foreground">{labels.when}</span>
                <span className={`truncate text-small ${datesValue ? "font-medium text-foreground" : "text-placeholder"}`}>
                  {datesValue ?? labels.addDates}
                </span>
              </span>
            </button>

            <StepperField
              id={`${ids}-guests`}
              icon={Users}
              label={labels.guests}
              value={state.guests}
              max={MAX_GUESTS}
              display={state.guests > 0 ? formatNumber(state.guests, locale) : labels.guestsAny}
              spoken={state.guests > 0 ? labels.guestCounts[state.guests - 1] : labels.guestsAny}
              fewer={labels.fewerGuests}
              more={labels.moreGuests}
              onChange={(guests) => patch({ guests })}
            />
          </>
        ) : (
          <>
            <StepperField
              id={`${ids}-rooms`}
              icon={BedDouble}
              label={labels.rooms}
              value={state.rooms}
              max={maxRooms}
              display={state.rooms > 0 ? <Ltr>{`${formatNumber(state.rooms, locale)}+`}</Ltr> : labels.roomsAny}
              spoken={state.rooms > 0 ? labels.roomCounts[state.rooms - 1] : labels.roomsAny}
              fewer={labels.fewerRooms}
              more={labels.moreRooms}
              onChange={(rooms) => patch({ rooms })}
            />

            <label className={cn(fieldClass, "cursor-text")}>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-caption font-semibold text-foreground">
                  {state.deal === "monthly" ? labels.budgetMonthly : labels.budget}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  <Ltr className="text-base font-semibold text-muted-foreground">{symbol}</Ltr>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={budgetText}
                    placeholder={labels.budgetPlaceholder}
                    onChange={(event) => {
                      const budget = parseBudget(event.target.value);
                      setBudgetText(budget ? formatNumber(budget, locale) : "");
                      patch({ budget });
                    }}
                    className="h-7 w-full min-w-0 bg-transparent text-start text-base text-foreground tabular-nums outline-none placeholder:text-placeholder"
                  />
                </span>
              </span>
            </label>
          </>
        )}

        <Button type="submit" size="lg" block className="col-span-2 md:col-span-1 md:h-auto md:min-h-14 md:w-auto md:px-8">
          <Search className="size-5" aria-hidden="true" />
          {labels.submit}
        </Button>
      </div>

      {datesLoaded ? (
        <HomeDatesSheet
          open={datesOpen}
          onOpenChange={setDatesOpen}
          checkIn={state.checkIn}
          checkOut={state.checkOut}
          onChange={(checkIn, checkOut) => patch({ checkIn, checkOut })}
          holidays={holidays}
          labels={{ title: labels.datesTitle, done: labels.datesDone, clear: labels.clearDates }}
        />
      ) : null}
    </form>
  );
}

/** "11–14 Nov" within one month, else the shared "11 Nov – 2 Dec". */
function compactStay(checkIn: string, checkOut: string, locale: string): string {
  if (checkIn.slice(0, 7) !== checkOut.slice(0, 7)) return formatStay(checkIn, checkOut, locale);
  return `${formatNumber(Number(checkIn.slice(8, 10)), locale)}–${formatDate(checkOut, locale, { day: "numeric", month: "short" })}`;
}

const fieldClass =
  "flex min-h-14 min-w-0 items-center gap-2.5 rounded-input border border-border-strong bg-background px-3 py-2 transition-colors focus-within:border-ring hover:border-input";

function Field({ icon: Icon, className, children }: { icon: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <div className={cn(fieldClass, className)}>
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      {children}
    </div>
  );
}

/** A half-width field with a visible label and − value + buttons (guests, rooms). 0 = any. */
function StepperField({
  id,
  icon: Icon,
  label,
  value,
  max,
  display,
  spoken,
  fewer,
  more,
  onChange,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  value: number;
  max: number;
  display: ReactNode;
  /** What a screen reader hears for the value ("2 guests", "Any"). */
  spoken: string;
  fewer: string;
  more: string;
  onChange: (value: number) => void;
}) {
  return (
    <div role="group" aria-labelledby={id} className={cn(fieldClass, "gap-2 pe-1.5")}>
      <Icon className="size-5 shrink-0 text-primary max-[379px]:hidden" aria-hidden="true" />
      <span className="grid min-w-0 flex-1">
        <span id={id} className="truncate text-caption font-semibold text-foreground">
          {label}
        </span>
        <span className="flex items-center justify-between gap-1">
          <StepButton label={fewer} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
            <Minus className="size-4" aria-hidden="true" />
          </StepButton>
          <output
            aria-live="polite"
            aria-label={spoken}
            className={`min-w-6 truncate text-center ${value > 0 ? "text-base font-semibold" : "text-small text-placeholder"}`}
          >
            {display}
          </output>
          <StepButton label={more} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
            <Plus className="size-4" aria-hidden="true" />
          </StepButton>
        </span>
      </span>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-foreground outline-none transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
