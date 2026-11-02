"use client";

import { useId, useMemo, useState, useSyncExternalStore, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon } from "lucide-react";
import PhoneNumberInput, {
  getCountryCallingCode,
  type Country,
  type Value,
} from "react-phone-number-input";
import englishLabels from "react-phone-number-input/locale/en.json";
import { locales, siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  readRememberedPhoneCountry,
  rememberPhoneCountry,
  type PhoneCountryPurpose,
} from "@/lib/auth/phone-defaults";
import { normalizeSearchText } from "@/lib/search-text";
import { cn } from "@/lib/utils";

/**
 * International phone number input: country picker + national number, value in E.164
 * ("+995555123456"). Always left-to-right, also on Hebrew and Arabic pages.
 *
 *   const [phone, setPhone] = useState<string | undefined>();
 *   <PhoneInput label={t("phone")} value={phone} onChange={setPhone} error={error} />
 *
 * Validate with `isValidPhoneNumber` from "react-phone-number-input" on the client and again
 * on the server.
 *
 * The country list is searchable by name in any of our five languages, by dialing code ("972",
 * "+995") or ISO code. With `rememberAs`, the visitor's last pick is remembered (localStorage)
 * and used instead of `defaultCountry` next time.
 */

export type { Country as PhoneCountry };

/**
 * Country names in the page language. Intl.DisplayNames only returns names (no digits), so the
 * "format numbers with @/lib/format" rule does not apply; English labels fill any gaps.
 */
function useCountryNames(locale: string): (country: Country) => string {
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, "en"], { type: "region", fallback: "none" });
    } catch {
      names = null;
    }
    const english = englishLabels as Record<string, string>;
    return (country: Country) => names?.of(country) ?? english[country] ?? country;
  }, [locale]);
}

/** Lower-cased country names in all five site languages, for search ("ישראל", "Israel", "Израиль"…). */
function useAllLanguageNames(): (country: Country) => string {
  return useMemo(() => {
    const displayNames = locales.flatMap((locale) => {
      try {
        return [new Intl.DisplayNames([locale], { type: "region", fallback: "none" })];
      } catch {
        return [];
      }
    });
    const english = englishLabels as Record<string, string>;
    return (country: Country) =>
      normalizeSearchText(
        [...displayNames.map((names) => names.of(country) ?? ""), english[country] ?? ""].join(" "),
      );
  }, []);
}

/** Matches a search against "names +code ISO": every typed word must appear. */
function countryFilter(itemValue: string, search: string): number {
  const words = normalizeSearchText(search.replace(/\+/g, " ")).split(" ").filter(Boolean);
  if (words.length === 0) return 1;
  const haystack = itemValue.replace(/\+/g, " ");
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}

/** The visitor's last pick for this purpose (null on the server and on the first client render). */
function useRememberedCountry(purpose: PhoneCountryPurpose | undefined): Country | null {
  return useSyncExternalStore(
    subscribeToStorage,
    () => (purpose ? (readRememberedPhoneCountry(purpose) as Country | null) : null),
    () => null,
  );
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

type CountrySelectProps = {
  value?: Country;
  onChange: (country?: Country) => void;
  options: { value?: Country; label: string; divider?: boolean }[];
  disabled?: boolean;
  readOnly?: boolean;
  /** Passed through `countrySelectProps`. */
  size: "default" | "lg";
  invalid?: boolean;
  rememberAs?: PhoneCountryPurpose;
};

function CountrySelect({ value, onChange, options, disabled, readOnly, size, invalid, rememberAs }: CountrySelectProps) {
  const t = useTranslations("auth.country");
  const locale = useLocale();
  const nameOf = useCountryNames(locale);
  const searchNamesOf = useAllLanguageNames();
  const [open, setOpen] = useState(false);

  const countries = useMemo(
    () =>
      options
        .filter((option): option is { value: Country; label: string } => !option.divider && !!option.value)
        .map((option) => ({
          country: option.value,
          name: nameOf(option.value),
          code: `+${getCountryCallingCode(option.value)}`,
          searchText: `${searchNamesOf(option.value)} +${getCountryCallingCode(option.value)} ${option.value.toLowerCase()}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [options, nameOf, searchNamesOf, locale],
  );

  const callingCode = value ? `+${getCountryCallingCode(value)}` : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || readOnly}
          aria-label={callingCode ? t("selected", { code: callingCode }) : t("label")}
          aria-invalid={invalid || undefined}
          className={cn(
            "gap-1.5 rounded-e-none border-e-0 border-input px-3 focus-visible:z-10",
            size === "lg" ? "h-12 rounded-s-xl" : "h-10 rounded-s-lg",
          )}
        >
          {callingCode ? (
            <span className="text-sm font-medium tabular-nums">{callingCode}</span>
          ) : (
            <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
          )}
          <ChevronsUpDownIcon className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="start" collisionPadding={16}>
        <Command filter={countryFilter}>
          <CommandInput placeholder={t("search")} aria-label={t("search")} />
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            <CommandGroup>
              {countries.map(({ country, name, code, searchText }) => (
                <CommandItem
                  key={country}
                  value={searchText}
                  onSelect={() => {
                    onChange(country);
                    if (rememberAs) rememberPhoneCountry(rememberAs, country);
                    setOpen(false);
                  }}
                  className="gap-2.5"
                >
                  <span className="flex-1 truncate">{name}</span>
                  <bdi dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                    {code}
                  </bdi>
                  <CheckIcon
                    className={cn("size-4", country === value ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type NumberFieldProps = ComponentProps<"input"> & { fieldSize?: "default" | "lg" };

function NumberField({ className, fieldSize = "default", ...props }: NumberFieldProps) {
  return (
    <input
      {...props}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-e-lg border border-input bg-transparent px-3 text-base tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
        fieldSize === "lg" ? "h-12 rounded-e-xl" : "h-10",
        className,
      )}
    />
  );
}

export type PhoneInputProps = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** ISO 3166-1 alpha-2, e.g. "GE" (the default) or "IL". */
  defaultCountry?: Country;
  /**
   * Remember the visitor's pick under this purpose and start with it next time (it wins over
   * `defaultCountry` while the field is empty). "login" for guests, "listing-contact" for hosts.
   */
  rememberAs?: PhoneCountryPurpose;
  /** Limit the country list (e.g. to countries that can receive SMS codes). */
  countries?: Country[];
  onCountryChange?: (country?: Country) => void;
  /** Visible label. Without it, pass `aria-label` or point a <Label htmlFor={id}> at `id`. */
  label?: string;
  description?: string;
  /** Validation message shown under the field. */
  error?: string | null;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  size?: "default" | "lg";
  className?: string;
  "aria-label"?: string;
  onBlur?: () => void;
};

export function PhoneInput({
  value,
  onChange,
  defaultCountry = siteConfig.phone.defaultCountry as Country,
  countries,
  onCountryChange,
  rememberAs,
  label,
  description,
  error,
  id,
  name,
  disabled,
  required,
  autoFocus,
  placeholder,
  size = "default",
  className,
  "aria-label": ariaLabel,
  onBlur,
}: PhoneInputProps) {
  const t = useTranslations("auth.country");
  const generatedId = useId();
  const inputId = id ?? `phone-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const remembered = useRememberedCountry(rememberAs);
  const startCountry =
    remembered && (!countries || countries.includes(remembered)) ? remembered : defaultCountry;

  return (
    <div className={cn("grid gap-2", className)}>
      {label && (
        <Label htmlFor={inputId} className={cn(size === "lg" && "text-sm")}>
          {label}
        </Label>
      )}
      <div dir="ltr">
        <PhoneNumberInput
          value={(value || undefined) as Value | undefined}
          onChange={(next) => onChange(next || undefined)}
          onCountryChange={onCountryChange}
          defaultCountry={startCountry}
          countries={countries}
          international={false}
          addInternationalOption={false}
          countryCallingCodeEditable={false}
          limitMaxLength
          labels={{ country: t("label"), phone: label ?? ariaLabel ?? "" }}
          className="flex w-full"
          countrySelectComponent={CountrySelect}
          countrySelectProps={{ size, invalid: !!error, rememberAs }}
          inputComponent={NumberField}
          numberInputProps={{
            id: inputId,
            name,
            fieldSize: size,
            required,
            autoFocus,
            placeholder,
            autoComplete: "tel-national",
            inputMode: "tel",
            dir: "ltr",
            "aria-label": label ? undefined : ariaLabel,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
          }}
          onBlur={onBlur}
          disabled={disabled}
        />
      </div>
      {description && !error && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
