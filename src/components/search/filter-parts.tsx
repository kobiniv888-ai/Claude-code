"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import type { IconComponent } from "@/components/ds/jewish-icons";
import { formatNumber } from "@/lib/format";
import type { SearchFilters } from "@/lib/listing/search-params";
import { sectionActiveCount, type FilterSection } from "@/lib/search/filter-sections";
import { cn } from "@/lib/utils";

/**
 * Building blocks of the filters sheet: sections (open or collapsible), labelled groups, choice
 * chips, check rows and min–max inputs. Stateless; the sheet keeps the draft.
 */

/** An always-open block with a big heading ("Price", "Kashrut & Shabbat"). */
export function SheetSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** Next to the heading (e.g. the selected price range). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section data-filter-section={id} aria-labelledby={headingId} className="grid scroll-mt-2 gap-3.5 py-5 first:pt-1">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-h3 text-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A collapsed section ("Amenities", "Property details"…) that opens by itself when it has a filter set. */
export function CollapsibleSection({
  id,
  title,
  filters,
  defaultOpen = false,
  children,
}: {
  id: FilterSection;
  title: string;
  filters: SearchFilters;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("search.filters");
  const locale = useLocale();
  const count = sectionActiveCount(filters, id);
  const [open, setOpen] = useState(defaultOpen || count > 0);
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-filter-section={id}>
      <h3>
        <CollapsibleTrigger className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-input text-start text-body font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="flex items-center gap-2">
            {title}
            {count > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-none font-bold text-primary-foreground">
                <span aria-hidden="true">{formatNumber(count, locale)}</span>
                <span className="sr-only">{t("selectedCount", { count })}</span>
              </span>
            ) : null}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground transition-transform duration-(--motion-base) group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="grid gap-5 pb-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** A labelled group of controls. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="grid gap-2.5">
      <span id={id} className="text-small font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Single choice as pill buttons (aria-pressed); `null` is the "Any" option. */
export function ChoiceChips<T extends string | number | null>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-10 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "border-primary-tint-border bg-primary-tint text-primary-text" : "border-border bg-card hover:border-input hover:bg-muted",
            )}
          >
            {label(option)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A plain on/off row (round 2: the "כשרות ושבת" group): the label at the start, a switch at the
 * end, the whole row is the 48px tap target. `children` show under it while it is on (e.g. the
 * walking-time choice).
 */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid">
      <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1.5">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-body leading-snug text-foreground">{label}</span>
          {hint ? (
            <span id={`${id}-hint`} className="text-caption text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </span>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={hint ? `${id}-hint` : undefined}
          // The "off" track needs 3:1 against the sheet (the default grey is too faint).
          className="data-unchecked:bg-muted-foreground/75 dark:data-unchecked:bg-muted-foreground/60"
        />
      </label>
      {checked && children ? <div className="pb-2">{children}</div> : null}
    </div>
  );
}

/** A large tappable tile with an icon (property types, the kashrut and Shabbat toggles). */
export function IconTile({
  icon: Icon,
  label,
  pressed,
  onToggle,
  layout = "column",
}: {
  icon: IconComponent;
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** column: icon over the label (property types); row: icon circle beside the label (toggles). */
  layout?: "column" | "row";
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "group relative flex rounded-card border text-foreground outline-none transition-[background-color,border-color,transform] duration-(--motion-fast) ease-standard",
        "focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
        layout === "column"
          ? "min-h-20 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center text-sm font-medium"
          : "min-h-16 items-center gap-3 p-3 text-start text-sm leading-snug font-semibold",
        pressed ? "border-primary bg-primary-tint text-primary-text" : "border-border bg-card hover:border-input hover:bg-muted/60",
      )}
    >
      {layout === "row" ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-(--motion-fast) [&_svg]:size-5",
            pressed ? "bg-primary text-primary-foreground" : "bg-primary-tint text-primary-text",
          )}
        >
          <Icon aria-hidden="true" />
        </span>
      ) : (
        <Icon aria-hidden="true" className="size-6" />
      )}
      <span className="min-w-0 text-balance">{label}</span>
    </button>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-5"
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CheckList<T extends string>({
  options,
  selected,
  label,
  hint,
  onToggle,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (option: T) => string;
  hint?: (option: T) => string;
  onToggle: (option: T) => void;
}) {
  return (
    <div className="grid gap-3">
      {options.map((option) => (
        <CheckRow
          key={option}
          checked={selected.includes(option)}
          onChange={() => onToggle(option)}
          label={label(option)}
          hint={hint?.(option)}
        />
      ))}
    </div>
  );
}

/** Parses a typed number (Western or Arabic-Indic digits, spaces and separators allowed). */
export function parseTyped(text: string): number | null {
  const western = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s,'’]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(western)) return null;
  const value = Number(western);
  return Number.isFinite(value) ? value : null;
}

const COMMIT_DELAY_MS = 700;

/** Two number inputs (min – max) that commit on blur, Enter, or a short pause in typing. */
export function NumberRange({
  min,
  max,
  unit,
  lowest,
  onCommit,
  labels,
}: {
  min: number | null;
  max: number | null;
  unit?: string;
  lowest: number;
  onCommit: (min: number | null, max: number | null) => void;
  labels: { min: string; max: string };
}) {
  const t = useTranslations("search.filters");
  const [text, setText] = useState({ min: min === null ? "" : String(min), max: max === null ? "" : String(max) });
  const [synced, setSynced] = useState({ min, max });
  const timer = useRef<number | undefined>(undefined);

  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max });
    setText({ min: min === null ? "" : String(min), max: max === null ? "" : String(max) });
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(next = text) {
    window.clearTimeout(timer.current);
    const low = parseTyped(next.min);
    const high = parseTyped(next.max);
    const cleanLow = low !== null && low >= lowest ? low : null;
    const cleanHigh = high !== null && high >= lowest ? high : null;
    if (cleanLow !== min || cleanHigh !== max) onCommit(cleanLow, cleanHigh);
  }

  function update(key: "min" | "max", value: string) {
    const next = { ...text, [key]: value };
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next), COMMIT_DELAY_MS);
  }

  const input = (key: "min" | "max") => (
    <label className="grid flex-1 gap-1">
      <span className="text-caption text-muted-foreground">{labels[key]}</span>
      {/* An LTR island (numbers): the unit sits after the digits, on the right, in every language. */}
      <span className="relative" dir="ltr">
        <input
          type="text"
          inputMode="numeric"
          value={text[key]}
          placeholder={key === "min" ? t("noMin") : t("noMax")}
          onChange={(event) => update(key, event.target.value)}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className={cn(
            "h-11 w-full rounded-input border border-input bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            unit && "pe-10",
          )}
        />
        {unit ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-small text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </span>
    </label>
  );

  return (
    <div className="flex items-end gap-2">
      {input("min")}
      <span aria-hidden="true" className="pb-2.5 text-muted-foreground">
        –
      </span>
      {input("max")}
    </div>
  );
}
