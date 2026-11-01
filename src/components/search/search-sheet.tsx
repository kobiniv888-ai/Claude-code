"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { BottomSheet, Button, Chip } from "@/components/ds";
import { DEAL_TYPE_ICONS } from "@/components/listing/field-icons";
import type { DealType } from "@/generated/prisma/enums";
import { withFilters } from "@/lib/listing/search-params";
import {
  SEARCH_BAR_DEALS,
  searchBarFilters,
  searchBarStateFrom,
  usesDatesAndGuests,
  usesMoveInDate,
  type SearchBarDeal,
  type SearchBarState,
} from "@/lib/search/search-bar";
import { GuestsStepper } from "./guests-stepper";
import { HolidayCalendar } from "./holiday-calendar";
import { PlaceCombobox, type PopularPlace } from "./place-combobox";
import { useSearch } from "./search-context";

const DEAL_ICON: Record<SearchBarDeal, DealType> = {
  "short-stay": "SHORT_STAY",
  monthly: "MONTHLY_RENT",
  buy: "SALE",
  hotels: "HOTEL_ROOM",
};

/**
 * The search sheet of /search (opened from the compact summary): deal, where, dates or move-in
 * date, and guests — the same fields as the home search card. "Search" keeps every other filter.
 */
export function SearchSheet({
  open,
  onOpenChange,
  popular,
  placeNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  popular: PopularPlace[];
  placeNames: { city: string | null; neighborhood: string | null };
}) {
  const t = useTranslations("search.bar");
  const { filters, navigate, holidays } = useSearch();
  const [state, setState] = useState<SearchBarState>(() => searchBarStateFrom(filters, placeNames));
  const [wasOpen, setWasOpen] = useState(open);

  // Each opening starts from the search on screen.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setState(searchBarStateFrom(filters, placeNames));
  }

  const patch = (next: Partial<SearchBarState>) => setState((s) => ({ ...s, ...next }));
  const stay = usesDatesAndGuests(state.deal);
  const moveIn = usesMoveInDate(state.deal);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    onOpenChange(false);
    navigate(withFilters(filters, searchBarFilters(state)));
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("sheetTitle")}
      size="full"
      onClear={() => setState((s) => ({ ...s, place: null, checkIn: null, checkOut: null, guests: 0 }))}
      clearLabel={t("clear")}
      footer={
        <Button type="submit" form="search-sheet-form" size="lg" block>
          <SearchIcon aria-hidden="true" />
          {t("submit")}
        </Button>
      }
    >
      <form id="search-sheet-form" onSubmit={submit} role="search" aria-label={t("label")} className="grid gap-5">
        <div role="group" aria-label={t("dealLabel")} className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
          {SEARCH_BAR_DEALS.map((deal) => (
            <Chip
              key={deal}
              size="sm"
              pressed={state.deal === deal}
              icon={DEAL_TYPE_ICONS[DEAL_ICON[deal]]}
              onClick={() => setState((s) => ({ ...s, deal, checkOut: usesMoveInDate(deal) ? null : s.checkOut }))}
            >
              {t(`deal.${deal}`)}
            </Chip>
          ))}
        </div>

        <div className="rounded-card bg-muted/50 p-4 ring-1 ring-border/60">
          <PlaceCombobox
            value={state.place}
            onChange={(place) => patch({ place })}
            popular={popular}
            inputClassName="mt-1 h-11 rounded-input border bg-card px-3 text-base"
          />
        </div>

        {stay ? (
          <>
            <section aria-labelledby="search-sheet-dates" className="rounded-card bg-muted/50 p-4 ring-1 ring-border/60">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 id="search-sheet-dates" className="text-small font-semibold">
                  {moveIn ? t("moveIn") : t("dates")}
                </h3>
                {state.checkIn ? (
                  <button
                    type="button"
                    onClick={() => patch({ checkIn: null, checkOut: null })}
                    className="min-h-11 rounded-full px-2 text-small font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t("clearDates")}
                  </button>
                ) : null}
              </div>
              <div className="-mx-1 overflow-x-auto">
                {moveIn ? (
                  <HolidayCalendar
                    mode="single"
                    holidays={holidays}
                    checkIn={state.checkIn}
                    onChange={(checkIn) => patch({ checkIn, checkOut: null })}
                    className="mx-auto [--cell-size:--spacing(10)]"
                  />
                ) : (
                  <HolidayCalendar
                    mode="range"
                    holidays={holidays}
                    checkIn={state.checkIn}
                    checkOut={state.checkOut}
                    onChange={(checkIn, checkOut) => patch({ checkIn, checkOut })}
                    className="mx-auto [--cell-size:--spacing(10)]"
                  />
                )}
              </div>
            </section>
            <div className="rounded-card bg-muted/50 p-4 ring-1 ring-border/60">
              <GuestsStepper value={state.guests} onChange={(guests) => patch({ guests })} />
            </div>
          </>
        ) : null}
      </form>
    </BottomSheet>
  );
}
