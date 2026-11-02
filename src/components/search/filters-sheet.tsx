"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SearchXIcon } from "lucide-react";
import { BottomSheet, Button, Chip, NumberRoll, RemovableChip } from "@/components/ds";
import { useCurrency } from "@/components/providers/currency-provider";
import { formatNumber } from "@/lib/format";
import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  activeFilterChips,
  clearFilters,
  parseSearchParams,
  removeFilter,
  serializeSearchQuery,
  withFilters,
  type SearchFilters,
} from "@/lib/listing/search-params";
import { countSearchResults, getLoosenFixes, getSearchPriceHistogram } from "@/lib/search/actions";
import { chipLabel } from "@/lib/search/chip-label";
import type { LoosenFix } from "@/lib/search/loosen";
import type { PriceHistogram } from "@/lib/search/price-histogram";
import { cn } from "@/lib/utils";
import { FiltersPanel } from "./filters-panel";
import { useLoosenLabel } from "./loosen-label";
import { useSearch } from "./search-context";
import type { FilterFocus } from "./search-sheets";

const COUNT_DELAY_MS = 300;
const HISTOGRAM_DELAY_MS = 250;

type Fix = { id: string; fix: LoosenFix; count: number; query: string };

/**
 * The filters sheet (brief 5.4): full height on phones, an end-side panel on desktops. Changes
 * stay a draft with a live count ("Show 24 places", the number rolls) until the big button; with
 * 0 matches it explains and offers the one-step changes that bring results.
 */
export function FiltersSheet({
  open,
  onOpenChange,
  focus,
  placeNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus: FilterFocus | null;
  placeNames: { city: string | null; neighborhood: string | null };
}) {
  const t = useTranslations("search.filters");
  const s = useTranslations("search.sheet");
  const chipsT = useTranslations("search.chips");
  const fx = useTranslations("search.fixes");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const { currency } = useCurrency();
  const { filters, navigate, holidays, total } = useSearch();
  const fixLabel = useLoosenLabel(placeNames);

  const currentQuery = serializeSearchQuery({ ...filters, page: 1 });
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const [count, setCount] = useState<{ query: string; value: number | null }>({ query: currentQuery, value: total });
  const [histogram, setHistogram] = useState<{ query: string; value: PriceHistogram | null } | null>(null);
  const [fixes, setFixes] = useState<{ query: string; list: Fix[] } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Every opening starts from the filters on screen and their known count.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(filters);
      setCount({ query: currentQuery, value: total });
    }
  }

  const draftQuery = serializeSearchQuery({ ...draft, page: 1 });
  const histogramQuery = draft.deal
    ? serializeSearchQuery({ ...draft, priceMin: null, priceMax: null, page: 1, sort: DEFAULT_SORT, view: DEFAULT_VIEW })
    : null;
  const counting = draftQuery !== count.query;
  const none = !counting && count.value === 0;

  // Live count (debounced).
  useEffect(() => {
    if (!open || draftQuery === count.query) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await countSearchResults(draftQuery).catch(() => null);
      if (!cancelled) setCount({ query: draftQuery, value: result?.ok ? result.data.count : null });
    }, COUNT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, draftQuery, count.query]);

  // Price histogram for every filter except the price (only when a deal is chosen).
  useEffect(() => {
    if (!open || !histogramQuery || histogram?.query === histogramQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await getSearchPriceHistogram(histogramQuery).catch(() => null);
      if (!cancelled) setHistogram({ query: histogramQuery, value: result?.ok ? result.data.histogram : null });
    }, histogram ? HISTOGRAM_DELAY_MS : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, histogramQuery, histogram]);

  // Nothing matches: ask which single change brings results.
  useEffect(() => {
    if (!open || !none || fixes?.query === draftQuery) return;
    let cancelled = false;
    void getLoosenFixes(draftQuery)
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setFixes({ query: draftQuery, list: result?.ok ? result.data.fixes : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, none, draftQuery, fixes?.query]);

  // Opened from the deal, price or rooms chip: start at that part of the sheet.
  useEffect(() => {
    if (!open || !focus) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-slot="bottom-sheet"] [data-filter-section="${focus}"]`)
        ?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, focus]);

  const update = (patch: Partial<SearchFilters>) => setDraft((d) => withFilters(d, patch));
  const clearAll = () => setDraft((d) => clearFilters(d, { keepLocation: true }));
  const apply = () => {
    onOpenChange(false);
    if (draftQuery !== currentQuery) navigate({ ...draft, page: 1 });
  };

  const chips = activeFilterChips(draft);
  const label = (chip: (typeof chips)[number]) => chipLabel(chip, draft, { t: chipsT, f, locale, currency, placeNames });
  const histogramValue = histogramQuery ? (histogram?.query === histogramQuery ? histogram.value : (histogram?.value ?? undefined)) : null;
  const shownCount = count.value;
  const fixList = fixes?.query === draftQuery ? fixes.list : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      size="full"
      desktop="side"
      onClear={chips.length > 0 ? clearAll : undefined}
      clearLabel={t("clear")}
      footer={
        <div className="grid gap-3">
          {none ? (
            <div role="status" className="flex animate-fade-in items-start gap-3 rounded-card bg-coral-soft p-3 text-small text-foreground">
              <SearchXIcon className="mt-0.5 size-5 shrink-0 text-coral-strong" aria-hidden="true" />
              <div className="grid min-w-0 gap-2">
                <p className="font-semibold">{s("noneTitle")}</p>
                {fixList && fixList.length > 0 ? (
                  <>
                    <p className="text-muted-foreground">{s("noneHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      {fixList.map((fix) => (
                        <Chip
                          key={fix.id}
                          size="sm"
                          onClick={() => setDraft(parseSearchParams(new URLSearchParams(fix.query)))}
                        >
                          {fixLabel(fix.fix, draft)}
                          <span className="ms-1 text-muted-foreground">· {fx("count", { count: fix.count, formatted: formatNumber(fix.count, locale) })}</span>
                        </Chip>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">{s("noneGeneric")}</p>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" onClick={clearAll} disabled={chips.length === 0} className="shrink-0 px-3">
              {s("clearAll")}
            </Button>
            <Button type="button" size="lg" block onClick={apply} aria-live="polite" className="min-w-0 flex-1">
              <span className={cn("truncate transition-opacity duration-(--motion-fast)", counting && "opacity-70")}>
                {shownCount === null
                  ? t("showResults")
                  : s.rich("showCount", { count: shownCount, n: () => <NumberRoll value={shownCount} /> })}
              </span>
            </Button>
          </div>
        </div>
      }
    >
      {chips.length > 0 ? (
        <div className="pb-4">
          <h3 className="sr-only">{chipsT("heading")}</h3>
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const text = label(chip);
              return (
                <li key={`${chip.key}:${chip.value ?? ""}`} className="animate-fade-in">
                  <RemovableChip
                    size="sm"
                    removeLabel={s("removeChip", { label: text })}
                    onRemove={() => setDraft((d) => removeFilter(d, chip.key, chip.value))}
                  >
                    <span dir={chip.key === "q" ? "auto" : undefined}>{text}</span>
                  </RemovableChip>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <FiltersPanel filters={draft} onChange={update} holidays={holidays} histogram={histogramValue} />
    </BottomSheet>
  );
}
