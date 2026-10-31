"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Building2, LoaderCircle, MapPin, Search, X } from "lucide-react";
import type { PlaceValue } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";

/** A suggestion row (cities and neighborhoods from /api/places/search, or the popular cities). */
type Suggestion = {
  key: string;
  value: PlaceValue;
  title: string;
  subtitle: string | null;
  kind: "city" | "neighborhood" | "text";
};

type ApiPlace = {
  type: "city" | "neighborhood";
  id: string;
  slug: string;
  citySlug: string;
  name: string;
  cityName: string | null;
};

export type PopularPlace = { slug: string; name: string };

const DEBOUNCE_MS = 180;
const MIN_QUERY = 1;

function toSuggestion(place: ApiPlace): Suggestion {
  if (place.type === "neighborhood") {
    return {
      key: `n:${place.id}`,
      kind: "neighborhood",
      title: place.name,
      subtitle: place.cityName,
      value: {
        kind: "neighborhood",
        citySlug: place.citySlug,
        neighborhoodSlug: place.slug,
        label: [place.name, place.cityName].filter(Boolean).join(", "),
      },
    };
  }
  return {
    key: `c:${place.id}`,
    kind: "city",
    title: place.name,
    subtitle: null,
    value: { kind: "city", citySlug: place.slug, label: place.name },
  };
}

/**
 * "Where" field: a combobox (WAI-ARIA 1.2 pattern) with suggestions from /api/places/search in
 * any of the five languages. Empty input shows the popular cities. Typing without picking a
 * suggestion searches the text itself (titles, neighborhoods, listing IDs).
 */
export function PlaceCombobox({
  value,
  onChange,
  popular,
  inputRef,
  onPicked,
  className,
  inputClassName,
  label,
  hideLabel = false,
}: {
  value: PlaceValue | null;
  onChange: (value: PlaceValue | null) => void;
  popular: PopularPlace[];
  inputRef?: Ref<HTMLInputElement>;
  /** After a suggestion is picked (to move focus to the next field). */
  onPicked?: () => void;
  className?: string;
  inputClassName?: string;
  label?: string;
  hideLabel?: boolean;
}) {
  const t = useTranslations("search.bar");
  const locale = useLocale();
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<{ query: string; items: Suggestion[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [syncedLabel, setSyncedLabel] = useState(value?.label ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // A new value from outside (e.g. the mobile sheet and the desktop bar share state).
  const outsideLabel = value?.label ?? "";
  if (outsideLabel !== syncedLabel) {
    setSyncedLabel(outsideLabel);
    setText(outsideLabel);
  }

  const query = text.trim();
  const picked = value !== null && value.kind !== "text" && value.label === text;
  const searching = query.length >= MIN_QUERY && !picked;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({ q: query, locale, limit: "8" });
        const response = await fetch(`/api/places/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { results?: ApiPlace[] };
        setResults({ query, items: (body.results ?? []).map(toSuggestion) });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, locale, searching]);

  const popularItems: Suggestion[] = popular.map((city) => ({
    key: `p:${city.slug}`,
    kind: "city",
    title: city.name,
    subtitle: null,
    value: { kind: "city", citySlug: city.slug, label: city.name },
  }));

  let items: Suggestion[];
  let heading: string;
  if (!searching) {
    items = popularItems;
    heading = t("popularPlaces");
  } else {
    const found = results && results.query === query ? results.items : [];
    const textItem: Suggestion = {
      key: "text",
      kind: "text",
      title: t("searchFor", { query }),
      subtitle: null,
      value: { kind: "text", text: query, label: query },
    };
    items = [...found, textItem];
    heading = t("suggestions");
  }
  const activeIndex = active >= 0 && active < items.length ? active : -1;
  const showList = open && items.length > 0;

  function choose(item: Suggestion) {
    onChange(item.value);
    setText(item.value.label);
    setSyncedLabel(item.value.label);
    setOpen(false);
    setActive(-1);
    onPicked?.();
  }

  function onType(next: string) {
    setText(next);
    setOpen(true);
    setActive(-1);
    const trimmed = next.trim();
    const nextValue: PlaceValue | null = trimmed ? { kind: "text", text: trimmed, label: next } : null;
    setSyncedLabel(nextValue?.label ?? "");
    onChange(nextValue);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActive((i) => (items.length === 0 ? -1 : (i + 1) % items.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setOpen(true);
        setActive((i) => (items.length === 0 ? -1 : i <= 0 ? items.length - 1 : i - 1));
        break;
      case "Enter":
        if (showList && activeIndex >= 0) {
          event.preventDefault();
          choose(items[activeIndex]);
        } else if (showList && searching && results?.query === query && results.items.length > 0) {
          // Enter on a typed name picks the best match ("tbil" → Tbilisi).
          event.preventDefault();
          choose(results.items[0]);
        } else {
          setOpen(false);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        } else if (text) {
          event.preventDefault();
          onType("");
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  // Close when focus or a click leaves the field.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const optionId = (index: number) => `${id}-option-${index}`;
  const inputId = `${id}-input`;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <label htmlFor={inputId} className={cn("block text-xs font-semibold text-foreground", hideLabel && "sr-only")}>
        {label ?? t("where")}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          dir="auto"
          value={text}
          placeholder={t("wherePlaceholder")}
          onChange={(event) => onType(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full truncate bg-transparent pe-7 text-sm text-foreground outline-none placeholder:text-muted-foreground",
            inputClassName,
          )}
        />
        {text ? (
          <button
            type="button"
            onClick={() => onType("")}
            className="absolute end-0 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("clearPlace")}</span>
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "absolute inset-x-0 top-full z-50 mt-3 min-w-72 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg",
          !showList && "hidden",
        )}
      >
        <p className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
          <span>{heading}</span>
          {loading ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        </p>
        <ul id={listId} role="listbox" aria-label={heading} className="max-h-80 overflow-y-auto p-1.5">
          {items.map((item, index) => {
            const Icon = item.kind === "text" ? Search : item.kind === "neighborhood" ? MapPin : Building2;
            return (
              <li
                key={item.key}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onPointerMove={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm",
                  index === activeIndex ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="grid min-w-0">
                  <span className="truncate font-medium" dir="auto">
                    {item.title}
                  </span>
                  {item.subtitle ? (
                    <span className="truncate text-xs text-muted-foreground" dir="auto">
                      {item.subtitle}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {failed && searching ? (
          <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">
            {t("suggestionsFailed")}
          </p>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {showList && searching && results?.query === query ? t("suggestionCount", { count: results.items.length }) : ""}
      </p>
    </div>
  );
}
