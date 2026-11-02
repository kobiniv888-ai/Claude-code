"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { CalendarDays, MapPin, Minus, Plus, Search, Users } from "lucide-react";
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
 * The home search card: the four deal tabs, "Where to?" with instant suggestions, then "When?" and
 * "How many guests?" for short stays and hotels, or rooms and a budget for monthly rentals and
 * buying, and a big navy "Search" → /search?…
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

  return (
    <form
      role="search"
      aria-label={labels.label}
      onSubmit={submit}
      className="rounded-card bg-card p-3 text-start text-card-foreground shadow-raised ring-1 ring-foreground/5 sm:p-5"
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

      <div
        className={cn(
          "mt-3 grid grid-cols-2 gap-2 sm:gap-3 md:mt-4 md:items-stretch",
          withDates
            ? "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]"
            : "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]",
        )}
      >
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
              <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="grid min-w-0">
                <span className="text-caption font-semibold text-foreground">{labels.when}</span>
                <span className={`truncate text-small ${datesValue ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {datesValue ?? labels.addDates}
                </span>
              </span>
            </button>

            <div role="group" aria-labelledby={`${ids}-guests`} className={cn(fieldClass, "pe-1.5")}>
              <Users className="size-5 shrink-0 text-primary max-[379px]:hidden" aria-hidden="true" />
              <span className="grid min-w-0 flex-1">
                <span id={`${ids}-guests`} className="truncate text-caption font-semibold text-foreground">
                  {labels.guests}
                </span>
                <span className="flex items-center justify-between gap-1">
                  <StepButton
                    label={labels.fewerGuests}
                    disabled={state.guests <= 0}
                    onClick={() => patch({ guests: Math.max(0, state.guests - 1) })}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </StepButton>
                  <output
                    aria-live="polite"
                    aria-label={state.guests > 0 ? labels.guestCounts[state.guests - 1] : labels.guestsAny}
                    className={`min-w-6 text-center ${state.guests > 0 ? "text-base font-semibold" : "text-small text-muted-foreground"}`}
                  >
                    {state.guests > 0 ? formatNumber(state.guests, locale) : labels.guestsAny}
                  </output>
                  <StepButton
                    label={labels.moreGuests}
                    disabled={state.guests >= MAX_GUESTS}
                    onClick={() => patch({ guests: Math.min(MAX_GUESTS, state.guests + 1) })}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </StepButton>
                </span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="col-span-2 grid gap-1 rounded-input border bg-background px-3 py-2 md:col-span-1">
              <span id={`${ids}-rooms`} className="text-caption font-semibold text-foreground">
                {labels.rooms}
              </span>
              <SegmentedControl
                aria-labelledby={`${ids}-rooms`}
                size="sm"
                tone="card"
                options={HOME_ROOM_OPTIONS.map((rooms) => ({
                  value: String(rooms),
                  label: rooms === 0 ? labels.roomsAny : `${formatNumber(rooms, locale)}+`,
                }))}
                value={String(state.rooms)}
                onValueChange={(value) => patch({ rooms: Number(value) })}
              />
            </div>

            <label className={cn(fieldClass, "col-span-2 cursor-text md:col-span-1")}>
              <span className="grid min-w-0 flex-1">
                <span className="text-caption font-semibold text-foreground">
                  {state.deal === "monthly" ? labels.budgetMonthly : labels.budget}
                </span>
                <span className="flex items-center gap-1.5">
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
                    className="h-7 w-full min-w-0 bg-transparent text-start text-base text-foreground tabular-nums outline-none placeholder:text-muted-foreground"
                  />
                </span>
              </span>
            </label>
          </>
        )}

        <Button type="submit" size="lg" block className="col-span-2 h-13 md:col-span-1 md:h-auto md:min-h-14 md:w-auto md:px-8">
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
  "flex min-h-14 min-w-0 items-center gap-2.5 rounded-input border bg-background px-3 py-2 transition-colors focus-within:border-ring hover:border-input";

function Field({ icon: Icon, className, children }: { icon: typeof MapPin; className?: string; children: ReactNode }) {
  return (
    <div className={cn(fieldClass, className)}>
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      {children}
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
      className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-foreground outline-none transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
