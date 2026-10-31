"use client";

import { useEffect, useId, useMemo, useState, type ComponentProps, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon } from "lucide-react";
import PhoneNumberInput, {
  getCountryCallingCode,
  type Country,
  type Value,
} from "react-phone-number-input";
import englishLabels from "react-phone-number-input/locale/en.json";
import { siteConfig } from "@/config/site";
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
 */

export type { Country as PhoneCountry };

type FlagComponents = Partial<Record<Country, ComponentType<{ title?: string; className?: string }>>>;

// Flags (≈60 kB) load after the first render, so they never block the page.
let flagsPromise: Promise<FlagComponents> | null = null;
function loadFlags(): Promise<FlagComponents> {
  flagsPromise ??= import("react-phone-number-input/flags").then(
    (module) => module.default as unknown as FlagComponents,
  );
  return flagsPromise;
}

function useFlags(): FlagComponents | null {
  const [flags, setFlags] = useState<FlagComponents | null>(null);
  useEffect(() => {
    let active = true;
    loadFlags()
      .then((loaded) => active && setFlags(loaded))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return flags;
}

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

function CountryFlag({ country, flags }: { country?: Country; flags: FlagComponents | null }) {
  const Flag = country ? flags?.[country] : undefined;
  return (
    <span className="flex h-4 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-muted [&_svg]:size-full">
      {Flag ? <Flag /> : <GlobeIcon className="size-3.5 text-muted-foreground" aria-hidden />}
    </span>
  );
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
};

function CountrySelect({ value, onChange, options, disabled, readOnly, size, invalid }: CountrySelectProps) {
  const t = useTranslations("auth.country");
  const locale = useLocale();
  const nameOf = useCountryNames(locale);
  const flags = useFlags();
  const [open, setOpen] = useState(false);

  const countries = useMemo(
    () =>
      options
        .filter((option): option is { value: Country; label: string } => !option.divider && !!option.value)
        .map((option) => ({
          country: option.value,
          name: nameOf(option.value),
          code: `+${getCountryCallingCode(option.value)}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [options, nameOf, locale],
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
          <CountryFlag country={value} flags={flags} />
          {callingCode && <span className="text-sm font-medium tabular-nums">{callingCode}</span>}
          <ChevronsUpDownIcon className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) ? 1 : 0
          }
        >
          <CommandInput placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            <CommandGroup>
              {countries.map(({ country, name, code }) => (
                <CommandItem
                  key={country}
                  value={`${name} ${code} ${country}`}
                  onSelect={() => {
                    onChange(country);
                    setOpen(false);
                  }}
                  className="gap-2.5"
                >
                  <CountryFlag country={country} flags={flags} />
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
          defaultCountry={defaultCountry}
          countries={countries}
          international={false}
          addInternationalOption={false}
          countryCallingCodeEditable={false}
          limitMaxLength
          labels={{ country: t("label"), phone: label ?? ariaLabel ?? "" }}
          className="flex w-full"
          countrySelectComponent={CountrySelect}
          countrySelectProps={{ size, invalid: !!error }}
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
