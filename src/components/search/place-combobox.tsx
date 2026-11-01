"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Building2, MapPin, Search, X } from "lucide-react";
import type { Localized } from "@/config/site";
import { matchPlaces, popularGazetteerCities, type PlaceMatch } from "@/lib/places-match";
import type { PlaceValue } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";

/** A suggestion row (cities and neighborhoods from the gazetteer, or the popular cities). */
type Suggestion = {
  key: string;
  value: PlaceValue;
  title: string;
  subtitle: string | null;
  kind: "city" | "neighborhood" | "text";
};

export type PopularPlace = { slug: string; name: string };

const MAX_SUGGESTIONS = 8;
const MIN_QUERY = 1;

function nameIn(names: Localized, locale: string): string {
  return names[locale as keyof Localized] || names.en;
}

function toSuggestion(place: PlaceMatch, locale: string): Suggestion {
  const name = nameIn(place.names, locale);
  if (place.type === "neighborhood") {
    const cityName = place.cityNames ? nameIn(place.cityNames, locale) : null;
    return {
      key: `n:${place.citySlug}/${place.slug}`,
      kind: "neighborhood",
      title: name,
      subtitle: cityName,
      value: {
        kind: "neighborhood",
        citySlug: place.citySlug,
        neighborhoodSlug: place.slug,
        label: [name, cityName].filter(Boolean).join(", "),
      },
    };
  }
  return {
    key: `c:${place.slug}`,
    kind: "city",
    title: name,
    subtitle: null,
    value: { kind: "city", citySlug: place.slug, label: name },
  };
}

/**
 * "Where" field: a combobox (WAI-ARIA 1.2 pattern) with instant suggestions from the bundled
 * gazetteer (src/config/places.ts) in any of the five languages, other spellings and small typos
 * (src/lib/places-match.ts) — no request, no spinner. Empty input shows the popular cities.
 * Typing without picking a suggestion searches the text itself (titles, neighborhoods, listing
 * IDs) on the search page.
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

  const found = useMemo(
    () => (searching ? matchPlaces(query, { limit: MAX_SUGGESTIONS }).map((place) => toSuggestion(place, locale)) : []),
    [query, searching, locale],
  );

  // The database's popular cities; the gazetteer's when the database has none (e.g. not seeded).
  const popularList: PopularPlace[] =
    popular.length > 0
      ? popular
      : popularGazetteerCities().map((city) => ({ slug: city.slug, name: nameIn(city.names, locale) }));

  const popularItems: Suggestion[] = popularList.map((city) => ({
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
        } else if (showList && searching && found.length > 0) {
          // Enter on a typed name picks the best match ("tbil" → Tbilisi).
          event.preventDefault();
          choose(found[0]);
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
        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{heading}</p>
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
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {showList && searching ? t("suggestionCount", { count: found.length }) : ""}
      </p>
    </div>
  );
}
