"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { isRtl } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import {
  clearFilters,
  countActiveFilters,
  serializeSearchQuery,
  withFilters,
  type SearchFilters,
} from "@/lib/listing/search-params";
import { countSearchResults } from "@/lib/search/actions";
import { cn } from "@/lib/utils";
import { FiltersPanel } from "./filters-panel";
import { useSearch } from "./search-context";

/** Desktop sidebar: every change applies at once. */
export function FiltersSidebar({ className }: { className?: string }) {
  const t = useTranslations("search.filters");
  const { filters, navigate, holidays, isPending } = useSearch();
  const count = countActiveFilters(filters);
  const headingId = useId();
  return (
    <aside aria-labelledby={headingId} className={className}>
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t("title")}
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
        </h2>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => navigate(clearFilters(filters, { keepLocation: true }))}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("clear")}
          </button>
        ) : null}
      </div>
      <FiltersPanel filters={filters} holidays={holidays} onChange={(patch) => navigate(withFilters(filters, patch))} />
    </aside>
  );
}

const COUNT_DELAY_MS = 350;

/**
 * "Filters (3)" button that opens every filter in a pull-up drawer (phones) or a side sheet (the
 * desktop map view). Changes stay a draft with a live count until "Show 123 homes".
 */
export function FiltersDialogButton({ kind, className }: { kind: "drawer" | "sheet"; className?: string }) {
  const t = useTranslations("search.filters");
  const locale = useLocale();
  const { filters, navigate, holidays, total } = useSearch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const [count, setCount] = useState<{ query: string; value: number | null }>({ query: "", value: total });
  const active = countActiveFilters(filters);
  const draftQuery = serializeSearchQuery({ ...draft, page: 1 });
  const currentQuery = serializeSearchQuery({ ...filters, page: 1 });

  function onOpenChange(next: boolean) {
    if (next) {
      setDraft(filters);
      setCount({ query: currentQuery, value: total });
    }
    setOpen(next);
  }

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

  const counting = draftQuery !== count.query;
  const apply = () => {
    setOpen(false);
    if (draftQuery !== currentQuery) navigate({ ...draft, page: 1 });
  };
  const showLabel =
    counting || count.value === null
      ? t("showResults")
      : count.value === 0
        ? t("noResults")
        : t("showCount", { count: count.value, formatted: formatNumber(count.value, locale) });

  const trigger = (
    <Button
      type="button"
      variant="outline"
      onClick={() => onOpenChange(true)}
      className={cn("h-10 gap-2 rounded-full px-4 font-semibold", className)}
      aria-haspopup="dialog"
    >
      <SlidersHorizontal aria-hidden="true" />
      {t("title")}
      {active > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.7rem] leading-5 text-primary-foreground">
          <span aria-hidden="true">{formatNumber(active, locale)}</span>
          <span className="sr-only">{t("activeCount", { count: active })}</span>
        </span>
      ) : null}
    </Button>
  );

  const header = (Title: typeof DrawerTitle | typeof SheetTitle, Description: typeof DrawerDescription | typeof SheetDescription) => (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("close")}>
        <X aria-hidden="true" />
      </Button>
      <Title className="text-base font-semibold">{t("title")}</Title>
      <Description className="sr-only">{t("dialogDescription")}</Description>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setDraft(clearFilters(draft, { keepLocation: true }))}
        disabled={countActiveFilters(draft) === 0}
      >
        {t("clear")}
      </Button>
    </div>
  );

  const body = (
    <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      <FiltersPanel filters={draft} holidays={holidays} onChange={(patch) => setDraft((d) => withFilters(d, patch))} />
    </div>
  );

  const footer = (
    <div className="border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Button type="button" size="lg" className="h-12 w-full rounded-xl text-base" onClick={apply} aria-live="polite">
        {counting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {showLabel}
      </Button>
    </div>
  );

  if (kind === "sheet") {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side={isRtl(locale) ? "right" : "left"}
            showCloseButton={false}
            className="w-full gap-0 p-0 sm:max-w-md"
          >
            {header(SheetTitle, SheetDescription)}
            {body}
            {footer}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92dvh] max-h-[92dvh]! gap-0">
          {header(DrawerTitle, DrawerDescription)}
          {body}
          {footer}
        </DrawerContent>
      </Drawer>
    </>
  );
}
