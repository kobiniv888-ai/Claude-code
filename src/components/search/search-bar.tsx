"use client";

import { useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, MapPin, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { formatStay } from "@/lib/search/format-stay";
import { searchPath } from "@/lib/listing/urls";
import { withFilters, type SearchFilters } from "@/lib/listing/search-params";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import {
  SEARCH_BAR_DEALS,
  searchBarFilters,
  usesDatesAndGuests,
  usesMoveInDate,
  type SearchBarDeal,
  type SearchBarState,
} from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";
import { GuestsStepper } from "./guests-stepper";
import { HolidayCalendar } from "./holiday-calendar";
import { PlaceCombobox, type PopularPlace } from "./place-combobox";
import { useMediaQuery } from "./use-media-query";

export type SearchBarProps = {
  /** "hero": the big bar on the home page (with the deal tabs); "compact": the bar above the results. */
  variant: "hero" | "compact";
  initial: SearchBarState;
  /** On /search: the current filters, kept when the bar changes place, dates or guests. */
  baseFilters?: SearchFilters;
  popular: PopularPlace[];
  /** Jewish holidays for the next 18 months (from the server). */
  holidays: HolidayMark[];
  className?: string;
};

/**
 * The search bar: Where · Deal · Dates (or move-in date) · Guests · Search → /search?….
 * From the md breakpoint it is one wide bar; on phones it collapses into a "Where to?" pill
 * that opens a full-screen sheet with the same fields.
 */
export function SearchBar({ variant, initial, baseFilters, popular, holidays, className }: SearchBarProps) {
  const t = useTranslations("search.bar");
  const router = useRouter();
  const [state, setState] = useState<SearchBarState>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const sheetInput = useRef<HTMLInputElement>(null);
  const wide = useMediaQuery("(min-width: 768px)");

  const patch = (next: Partial<SearchBarState>) => setState((s) => ({ ...s, ...next }));
  const showStay = usesDatesAndGuests(state.deal);
  const moveIn = usesMoveInDate(state.deal);

  function setDeal(deal: SearchBarDeal) {
    setState((s) => ({ ...s, deal, checkOut: usesMoveInDate(deal) ? null : s.checkOut }));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const fromBar = searchBarFilters(state);
    const filters = baseFilters ? withFilters(baseFilters, fromBar) : fromBar;
    setSheetOpen(false);
    setDatesOpen(false);
    setGuestsOpen(false);
    router.push(searchPath(filters));
  }

  const dealTabs =
    variant === "hero" ? (
      <DealTabs value={state.deal} onChange={setDeal} />
    ) : null;

  return (
    <div className={className}>
      {/* Phones: the pill that opens the full-screen sheet. */}
      <div className="md:hidden">
        {variant === "hero" ? <div className="mb-3">{dealTabs}</div> : null}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-full border bg-card px-4 text-start shadow-card outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
            variant === "hero" ? "py-3.5" : "py-2.5",
          )}
        >
          <Search className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-semibold" dir="auto">
              {state.place?.label || t("whereTo")}
            </span>
            <SummaryLine state={state} />
          </span>
        </button>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-dvh gap-0 overflow-hidden rounded-none p-0 data-[side=bottom]:h-dvh md:hidden"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            sheetInput.current?.focus();
          }}
        >
          <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <SheetTitle className="text-base font-semibold">{t("sheetTitle")}</SheetTitle>
              <SheetDescription className="sr-only">{t("sheetDescription")}</SheetDescription>
              <Button type="button" variant="ghost" size="icon" onClick={() => setSheetOpen(false)} aria-label={t("closeSheet")}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              {dealTabs}
              <div className="rounded-2xl border bg-card p-4 shadow-xs">
                <PlaceCombobox
                  value={state.place}
                  onChange={(place) => patch({ place })}
                  popular={popular}
                  inputRef={sheetInput}
                  inputClassName="mt-1 h-10 rounded-lg border bg-background px-3 text-base"
                />
              </div>
              {showStay ? (
                <>
                  <section className="rounded-2xl border bg-card p-4 shadow-xs" aria-labelledby="sheet-dates">
                    <h3 id="sheet-dates" className="mb-3 text-sm font-semibold">
                      {moveIn ? t("moveIn") : t("dates")}
                    </h3>
                    <DatesCalendar state={state} patch={patch} holidays={holidays} months={1} />
                  </section>
                  <div className="rounded-2xl border bg-card p-4 shadow-xs">
                    <GuestsStepper value={state.guests} onChange={(guests) => patch({ guests })} />
                  </div>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setState((s) => ({ ...s, place: null, checkIn: null, checkOut: null, guests: 0 }))}
              >
                {t("clear")}
              </Button>
              <Button type="submit" size="lg" className="rounded-full px-6">
                <Search aria-hidden="true" />
                {t("submit")}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Tablets and desktops: one wide bar. */}
      <form onSubmit={submit} role="search" aria-label={t("label")} className="hidden md:block">
        {variant === "hero" ? <div className="mb-4">{dealTabs}</div> : null}
        <div
          className={cn(
            "flex items-stretch rounded-full border bg-card shadow-card",
            variant === "hero" ? "min-h-18 p-2" : "min-h-14 p-1.5",
          )}
        >
          <Segment icon={MapPin} className="min-w-0 flex-[1.4]">
            <PlaceCombobox
              value={state.place}
              onChange={(place) => patch({ place })}
              popular={popular}
              onPicked={() => {
                if (showStay) setDatesOpen(true);
              }}
              className="w-full"
              inputClassName="mt-0.5 h-6"
            />
          </Segment>

          {showStay ? (
            <>
              <Divider />
              <Popover open={datesOpen} onOpenChange={setDatesOpen}>
                <PopoverTrigger asChild>
                  <SegmentButton icon={CalendarDays} label={moveIn ? t("moveIn") : t("dates")}>
                    <DatesValue state={state} />
                  </SegmentButton>
                </PopoverTrigger>
                <PopoverContent align="center" sideOffset={12} className="w-auto rounded-2xl p-4">
                  <DatesCalendar
                    state={state}
                    patch={patch}
                    holidays={holidays}
                    months={wide ? 2 : 1}
                    onComplete={() => setDatesOpen(false)}
                  />
                  {state.checkIn ? (
                    <div className="mt-2 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => patch({ checkIn: null, checkOut: null })}>
                        {t("clearDates")}
                      </Button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
              <Divider />
              <Popover open={guestsOpen} onOpenChange={setGuestsOpen}>
                <PopoverTrigger asChild>
                  <SegmentButton icon={Users} label={t("guests")} className="flex-[0.8]">
                    <GuestsValue guests={state.guests} />
                  </SegmentButton>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={12} className="w-80 rounded-2xl p-5">
                  <GuestsStepper value={state.guests} onChange={(guests) => patch({ guests })} />
                </PopoverContent>
              </Popover>
            </>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className={cn("ms-2 shrink-0 self-center rounded-full", variant === "hero" ? "h-13 px-6 text-base" : "h-11 px-4")}
          >
            <Search aria-hidden="true" className="size-5" />
            <span className={cn(variant === "compact" && "sr-only lg:not-sr-only")}>{t("submit")}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function DealTabs({ value, onChange }: { value: SearchBarState["deal"]; onChange: (deal: SearchBarDeal) => void }) {
  const t = useTranslations("search.bar");
  return (
    <div
      role="group"
      aria-label={t("dealLabel")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
    >
      {SEARCH_BAR_DEALS.map((deal) => {
        const active = value === deal;
        return (
          <button
            key={deal}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(deal)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary",
            )}
          >
            {t(`deal.${deal}`)}
          </button>
        );
      })}
    </div>
  );
}

function Segment({ icon: Icon, className, children }: { icon: typeof MapPin; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-full px-5 py-1.5 focus-within:bg-muted/70 hover:bg-muted/50", className)}>
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      {children}
    </div>
  );
}

function SegmentButton({
  icon: Icon,
  label,
  className,
  children,
  ...props
}: { icon: typeof MapPin; label: string; children: ReactNode } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-full px-5 py-1.5 text-start outline-none hover:bg-muted/50 focus-visible:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/40 data-[state=open]:bg-muted/70",
        className,
      )}
      {...props}
    >
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="grid min-w-0">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="truncate text-sm text-muted-foreground">{children}</span>
      </span>
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="my-3 w-px shrink-0 bg-border" />;
}

function DatesCalendar({
  state,
  patch,
  holidays,
  months,
  onComplete,
}: {
  state: SearchBarState;
  patch: (next: Partial<SearchBarState>) => void;
  holidays: HolidayMark[];
  months: number;
  onComplete?: () => void;
}) {
  if (usesMoveInDate(state.deal)) {
    return (
      <HolidayCalendar
        mode="single"
        holidays={holidays}
        numberOfMonths={months}
        checkIn={state.checkIn}
        onChange={(checkIn) => {
          patch({ checkIn, checkOut: null });
          if (checkIn) onComplete?.();
        }}
      />
    );
  }
  return (
    <HolidayCalendar
      mode="range"
      holidays={holidays}
      numberOfMonths={months}
      checkIn={state.checkIn}
      checkOut={state.checkOut}
      onChange={(checkIn, checkOut) => {
        patch({ checkIn, checkOut });
        if (checkIn && checkOut) onComplete?.();
      }}
    />
  );
}

function DatesValue({ state }: { state: SearchBarState }) {
  const t = useTranslations("search.bar");
  const locale = useLocale();
  if (!state.checkIn) return <>{usesMoveInDate(state.deal) ? t("addMoveIn") : t("addDates")}</>;
  if (usesMoveInDate(state.deal) || !state.checkOut) {
    return <>{formatDate(state.checkIn, locale, { day: "numeric", month: "short", year: "numeric" })}</>;
  }
  return <>{formatStay(state.checkIn, state.checkOut, locale)}</>;
}

function GuestsValue({ guests }: { guests: number }) {
  const t = useTranslations("search.bar");
  return <>{guests > 0 ? t("guestCount", { count: guests }) : t("addGuests")}</>;
}

function SummaryLine({ state }: { state: SearchBarState }) {
  const t = useTranslations("search.bar");
  const parts: ReactNode[] = [];
  if (usesDatesAndGuests(state.deal)) {
    parts.push(<DatesValue key="dates" state={state} />);
    parts.push(<GuestsValue key="guests" guests={state.guests} />);
  } else {
    parts.push(<span key="deal">{t("deal.buy")}</span>);
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </span>
      ))}
    </span>
  );
}
