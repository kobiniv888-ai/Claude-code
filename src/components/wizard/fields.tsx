"use client";

import { useEffect, useId, useState, type ComponentType, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, CircleAlertIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Form building blocks for the wizard steps. Every input has a visible label, a description
 * and an error linked with aria-describedby; groups use fieldset/legend.
 */

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export type ControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

/** Translates a validation code ("required", "tooLong"…) from wizard.json → validation.*. */
export function useIssueText() {
  const t = useTranslations("wizard.validation");
  return (code: string | undefined | null) => {
    if (!code) return null;
    return t.has(code) ? t(code) : t("invalid");
  };
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-destructive" role="alert">
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Label + control + description + error. `children` gets the ids to wire up. */
export function Field({
  label,
  description,
  error,
  optional,
  className,
  labelAddon,
  children,
  id: idProp,
}: {
  label: ReactNode;
  description?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  labelAddon?: ReactNode;
  id?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const t = useTranslations("wizard.chrome");
  const generated = useId();
  const id = idProp ?? `f${generated}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, descriptionId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-2", className)} data-invalid={error ? true : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {optional && <span className="ms-1.5 text-xs font-normal text-muted-foreground">{t("optional")}</span>}
        </label>
        {labelAddon}
      </div>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <FieldError id={errorId!}>{error}</FieldError>
      ) : null}
      {description && (
        <p id={descriptionId} className="text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/** A group of controls (checkbox cards, radios) with a legend. */
export function FieldGroup({
  legend,
  description,
  error,
  optional,
  className,
  children,
  legendClassName,
}: {
  legend: ReactNode;
  description?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  legendClassName?: string;
  children: ReactNode;
}) {
  const t = useTranslations("wizard.chrome");
  const id = useId();
  const descriptionId = description ? `${id}-d` : undefined;
  const errorId = error ? `${id}-e` : undefined;
  return (
    <fieldset
      className={cn("grid min-w-0 gap-3", className)}
      aria-describedby={[errorId, descriptionId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={cn("mb-1 text-base font-semibold", legendClassName)}>
        {legend}
        {optional && <span className="ms-1.5 text-xs font-normal text-muted-foreground">{t("optional")}</span>}
      </legend>
      {description && (
        <p id={descriptionId} className="-mt-2 text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </fieldset>
  );
}

/** A section card inside a step. */
export function Section({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-5 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6", className)}>
      {(title || description) && (
        <header className="flex items-start gap-3">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <div className="grid gap-1">
            {title && <h3 className="text-base font-semibold sm:text-lg">{title}</h3>}
            {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

// ─── Choice cards (radio) ─────────────────────────────────────

export function ChoiceCards<T extends string>({
  legend,
  legendHidden,
  name,
  value,
  options,
  onChange,
  error,
  columns = "sm:grid-cols-2",
  size = "lg",
}: {
  legend: ReactNode;
  legendHidden?: boolean;
  name: string;
  value: T | null;
  options: { value: T; title: ReactNode; description?: ReactNode; icon?: IconType; badge?: ReactNode }[];
  onChange: (value: T) => void;
  error?: string | null;
  columns?: string;
  size?: "lg" | "md";
}) {
  return (
    <FieldGroup legend={legend} error={error} legendClassName={legendHidden ? "sr-only" : undefined}>
      <div className={cn("grid gap-3", columns)}>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "group relative flex cursor-pointer items-start gap-4 rounded-2xl border bg-card text-start transition-all",
                "hover:border-primary/40 hover:shadow-card-hover has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                size === "lg" ? "p-4 sm:p-5" : "p-3.5",
                checked ? "border-primary bg-primary/5 shadow-card ring-1 ring-primary" : "border-border",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {Icon && (
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xl transition-colors",
                    size === "lg" ? "size-12 sm:size-14" : "size-10",
                    checked ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  <Icon className={size === "lg" ? "size-6 sm:size-7" : "size-5"} aria-hidden />
                </span>
              )}
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {option.title}
                  {option.badge}
                </span>
                {option.description && (
                  <span className="text-sm text-pretty text-muted-foreground">{option.description}</span>
                )}
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {checked && <CheckIcon className="size-3.5" />}
              </span>
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}

// ─── Check cards (checkbox list) ──────────────────────────────

export function CheckCards<T extends string>({
  legend,
  description,
  values,
  options,
  onChange,
  columns = "grid-cols-1 sm:grid-cols-2",
  error,
  optional,
}: {
  legend: ReactNode;
  description?: ReactNode;
  values: readonly string[];
  options: { value: T; label: ReactNode; help?: ReactNode; icon?: IconType }[];
  onChange: (values: T[]) => void;
  columns?: string;
  error?: string | null;
  optional?: boolean;
}) {
  const toggle = (value: T, on: boolean) => {
    const next = new Set(values as T[]);
    if (on) next.add(value);
    else next.delete(value);
    // Keep the vocabulary's order.
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  };
  return (
    <FieldGroup legend={legend} description={description} error={error} optional={optional}>
      <div className={cn("grid gap-2.5", columns)}>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = values.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/60",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggle(option.value, e.target.checked)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                )}
              >
                {checked && <CheckIcon className="size-3.5" />}
              </span>
              {Icon && <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium">{option.label}</span>
                {option.help && <span className="text-xs text-pretty text-muted-foreground">{option.help}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}

// ─── Yes / No ─────────────────────────────────────────────────

export function YesNo({
  legend,
  value,
  onChange,
  icon: Icon,
  description,
}: {
  legend: ReactNode;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  icon?: IconType;
  description?: ReactNode;
}) {
  const t = useTranslations("wizard.chrome");
  const name = useId();
  const options: { key: "yes" | "no"; value: boolean }[] = [
    { key: "yes", value: true },
    { key: "no", value: false },
  ];
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <legend className="sr-only">{legend}</legend>
      <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium" aria-hidden>
        {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
        <span className="grid">
          <span>{legend}</span>
          {description && <span className="text-xs font-normal text-muted-foreground">{description}</span>}
        </span>
      </span>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {options.map((option) => (
          <label
            key={option.key}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              onClick={() => {
                // Clicking the selected answer again clears it ("not specified").
                if (value === option.value) onChange(null);
              }}
            />
            {t(option.key)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ─── Numbers ──────────────────────────────────────────────────

function parseNumber(raw: string): number | null | "invalid" {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === "-" || cleaned === ".") return "invalid";
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : "invalid";
}

/** Numeric text input (keeps what the owner types; reports a number or null). */
export function NumberInput({
  value,
  onChange,
  decimals = false,
  className,
  suffix,
  prefix,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "prefix"> &
  Partial<ControlProps> & {
    value: number | null;
    onChange: (value: number | null) => void;
    decimals?: boolean;
    suffix?: ReactNode;
    prefix?: ReactNode;
  }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Changed from outside (e.g. a stepper): show the new value.
    setLastValue(value);
    const parsed = parseNumber(text);
    if (parsed !== value) setText(value === null ? "" : String(value));
  }
  return (
    <div className={cn("relative flex items-center", className)} dir="ltr">
      {prefix && <span className="pointer-events-none absolute start-3 text-sm text-muted-foreground">{prefix}</span>}
      <Input
        {...props}
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = parseNumber(raw);
          if (parsed === "invalid") return;
          const next = parsed === null ? null : decimals ? parsed : Math.trunc(parsed);
          setLastValue(next);
          onChange(next);
        }}
        className={cn("h-11 text-base tabular-nums", prefix && "ps-9", suffix && "pe-14")}
      />
      {suffix && <span className="pointer-events-none absolute end-3 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** − value + stepper for small counts (rooms, beds, guests). */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 50,
  step = 1,
  icon: Icon,
  error,
  description,
  optional,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  icon?: IconType;
  error?: string | null;
  description?: ReactNode;
  optional?: boolean;
}) {
  const t = useTranslations("wizard.chrome");
  const locale = useLocale();
  const id = useId();
  const errorId = error ? `${id}-e` : undefined;
  const descriptionId = description ? `${id}-d` : undefined;
  const current = value ?? null;
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)));
  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2.5",
          error ? "border-destructive" : "border-border",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
          <span id={`${id}-label`} className="text-sm font-medium">
            {label}
            {optional && <span className="ms-1.5 text-xs font-normal text-muted-foreground">{t("optional")}</span>}
          </span>
        </span>
        <div
          className="flex shrink-0 items-center gap-1"
          role="group"
          aria-labelledby={`${id}-label`}
          aria-describedby={[errorId, descriptionId].filter(Boolean).join(" ") || undefined}
        >
          <button
            type="button"
            onClick={() => (current === null ? onChange(null) : current - step < min ? onChange(null) : set(current - step))}
            disabled={current === null}
            aria-label={t("decrease", { label })}
            className="flex size-9 items-center justify-center rounded-full border border-input text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <MinusIcon className="size-4" aria-hidden />
          </button>
          <output
            aria-live="polite"
            className={cn("w-10 text-center text-base font-semibold tabular-nums", current === null && "text-muted-foreground")}
          >
            {current === null ? "–" : formatNumber(current, locale, { maximumFractionDigits: 1 })}
          </output>
          <button
            type="button"
            onClick={() => set(current === null ? Math.max(min, step >= 1 ? Math.max(min, 1) : min) : current + step)}
            disabled={current !== null && current >= max}
            aria-label={t("increase", { label })}
            className="flex size-9 items-center justify-center rounded-full border border-input text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <PlusIcon className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {error && <FieldError id={errorId!}>{error}</FieldError>}
      {description && !error && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/** Time of day (HH:MM), always left-to-right. */
export function TimeInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      {...props}
      type="time"
      dir="ltr"
      step={900}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full text-base tabular-nums"
    />
  );
}

/** Live character counter "120 / 5,000". */
export function CharCount({ value, max, id }: { value: string; max: number; id?: string }) {
  const locale = useLocale();
  const t = useTranslations("wizard.chrome");
  const length = value.length;
  return (
    <span
      id={id}
      className={cn("text-xs tabular-nums", length > max * 0.95 ? "text-warning" : "text-muted-foreground")}
      aria-label={t("charCount", { count: length, max })}
    >
      <bdi dir="ltr">
        {formatNumber(length, locale)} / {formatNumber(max, locale)}
      </bdi>
    </span>
  );
}

/** Mounts children only after hydration (for browser-only APIs). */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once after hydration
  useEffect(() => setMounted(true), []);
  return mounted;
}
