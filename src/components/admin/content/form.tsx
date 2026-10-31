"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useState, type ReactNode } from "react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { REQUIRED_LOCALES, type LocalizedForm } from "@/lib/admin/content/localized";
import { issuesToFieldErrors } from "@/lib/admin/content/schemas";
import type { FieldErrors } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Small form building blocks shared by the content editors. */

export type Errors = Record<string, string[] | undefined>;

/** Field errors keyed by dotted path ("names.he"); validate() runs a schema on the client. */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Errors>({});
  const validate = useCallback(<S extends z.ZodType>(schema: S, values: unknown): z.output<S> | null => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    setErrors(issuesToFieldErrors(parsed.error));
    return null;
  }, []);
  const fromServer = useCallback((_code: string, fieldErrors?: FieldErrors) => {
    if (fieldErrors) setErrors(fieldErrors);
  }, []);
  const clear = useCallback((path: string) => {
    setErrors((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);
  return { errors, setErrors, validate, fromServer, clear };
}

/** First error at `path` (or anywhere below it when `nested`). */
export function errorAt(errors: Errors, path: string, nested = false): string | undefined {
  if (errors[path]?.[0]) return errors[path]?.[0];
  if (!nested) return undefined;
  const key = Object.keys(errors).find((k) => k.startsWith(`${path}.`));
  return key ? errors[key]?.[0] : undefined;
}

export function FieldMessage({ id, code }: { id?: string; code?: string }) {
  const t = useTranslations("adminContent.form.errors");
  if (!code) return null;
  return (
    <p id={id} className="flex items-center gap-1 text-xs font-medium text-destructive">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {t.has(code) ? t(code) : t("invalid")}
    </p>
  );
}

/** Label + control + hint + error. The control gets `id` and `aria-describedby` from the render prop. */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const t = useTranslations("adminContent.form");
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-xs font-normal text-muted-foreground">({t("required")})</span> : null}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldMessage id={errorId} code={error} />
    </div>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-lg border bg-background p-3", className)}>
      <div className="min-w-0">
        <Label htmlFor={id} className="leading-snug">
          {label}
        </Label>
        {description ? (
          <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

/** Language tabs; each tab shows a check when its language is filled and a mark when it has an error. */
export function LanguageTabs({
  filled,
  invalid,
  children,
  className,
}: {
  filled: (locale: AppLocale) => boolean;
  invalid?: (locale: AppLocale) => boolean;
  children: (locale: AppLocale) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("adminContent.form");
  return (
    <Tabs defaultValue={siteConfig.i18n.primaryLocale} className={cn("w-full min-w-0 gap-3", className)}>
      <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-1">
        <TabsList aria-label={t("languages")} className="h-auto min-w-max flex-wrap">
          {locales.map((locale) => {
            const isFilled = filled(locale);
            const hasError = invalid?.(locale) ?? false;
            return (
              <TabsTrigger key={locale} value={locale} className="h-8 gap-1.5 px-3" lang={locale}>
                {hasError ? (
                  <CircleAlert aria-hidden className="size-3.5 text-destructive" />
                ) : isFilled ? (
                  <CircleCheck aria-hidden className="size-3.5 text-verified" />
                ) : (
                  <span aria-hidden className="size-2 rounded-full border border-muted-foreground/50" />
                )}
                {siteConfig.i18n.nativeNames[locale]}
                <span className="sr-only">
                  {hasError ? t("languageHasError") : isFilled ? t("languageFilled") : t("languageEmpty")}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {locales.map((locale) => (
        <TabsContent key={locale} value={locale} className="flex flex-col gap-4" lang={locale}>
          {children(locale)}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Five inputs (one per language) in a grid — for short texts such as names. */
export function LocalizedInputs({
  label,
  value,
  onChange,
  errors,
  path,
  required = REQUIRED_LOCALES,
  maxLength,
}: {
  label: ReactNode;
  value: LocalizedForm;
  onChange: (next: LocalizedForm) => void;
  errors: Errors;
  path: string;
  required?: readonly AppLocale[];
  maxLength?: number;
}) {
  const t = useTranslations("adminContent.form");
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locales.map((locale) => (
          <FormField
            key={locale}
            label={siteConfig.i18n.nativeNames[locale]}
            required={required.includes(locale)}
            error={errorAt(errors, `${path}.${locale}`)}
          >
            {(props) => (
              <Input
                {...props}
                lang={locale}
                dir={dirFor(locale)}
                value={value[locale]}
                maxLength={maxLength}
                placeholder={required.includes(locale) ? undefined : t("optional")}
                onChange={(e) => onChange({ ...value, [locale]: e.target.value })}
              />
            )}
          </FormField>
        ))}
      </div>
    </fieldset>
  );
}

/** One language's input inside LanguageTabs. */
export function LocaleText({
  locale,
  label,
  value,
  onChange,
  error,
  required,
  multiline,
  rows = 4,
  maxLength,
  hint,
  className,
}: {
  locale: AppLocale;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} className={className}>
      {(props) =>
        multiline ? (
          <Textarea
            {...props}
            lang={locale}
            dir={dirFor(locale)}
            rows={rows}
            value={value}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input
            {...props}
            lang={locale}
            dir={dirFor(locale)}
            value={value}
            maxLength={maxLength}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
    </FormField>
  );
}

/** "41.7151" → 41.7151; "" or junk → NaN (the schema reports it). */
export function parseNumber(value: string): number {
  const normalized = value.trim().replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

/** Optional number: "" → null. */
export function parseOptionalNumber(value: string): number | null {
  return value.trim() === "" ? null : parseNumber(value);
}

/** Bottom bar of an editor page with the main buttons (sticks to the bottom on phones). */
export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border sm:bg-card sm:px-4">
      {children}
    </div>
  );
}
