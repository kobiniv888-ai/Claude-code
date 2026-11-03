"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDaysIcon, LinkIcon, PercentIcon, PlusIcon, ReceiptIcon, Trash2Icon, WalletIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Ltr } from "@/components/common/ltr";
import { CopyLinkField } from "@/components/common/copy-link-field";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { enabledCurrencies } from "@/lib/currency/convert";
import { currencySymbol, formatArea, formatMoney } from "@/lib/format";
import { setAvailability } from "@/lib/wizard/actions";
import { LIMITS, PRICE_PERIODS_BY_DEAL } from "@/lib/wizard/schemas";
import { applies } from "@/lib/wizard/steps";
import type { DayRange } from "@/lib/wizard/types";
import { AvailabilityCalendar } from "../availability-calendar";
import { Field, NumberInput, Section, Stepper } from "../fields";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Step 8 — price, currency, period, fees, discounts, availability calendar and iCal sync. */
export function PriceStep({ listing, values, set, errors, kind, locale, blocked, setBlocked, track }: StepProps) {
  const t = useTranslations("wizard.price");
  const label = useOptionLabel();
  const [saving, setSaving] = useState(false);
  const lastGood = useRef<DayRange[]>(blocked);
  const periods = PRICE_PERIODS_BY_DEAL[kind.dealType];
  const symbol = currencySymbol(values.currency);
  const show = (field: Parameters<typeof applies>[0]) => applies(field, kind);

  const perSqm =
    show("pricePerSqm") && values.price && values.sizeSqm && values.sizeSqm > 0 ? values.price / values.sizeSqm : null;

  const saveBlocks = async (ranges: DayRange[]) => {
    const before = lastGood.current;
    setBlocked(ranges);
    setSaving(true);
    const result = await track(setAvailability(listing.id, ranges)).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      lastGood.current = result.data.blocked;
      setBlocked(result.data.blocked);
    } else {
      setBlocked(before);
      toast.error(t("calendarSaveFailed"));
    }
  };

  const icalUrls = values.icalImportUrls;
  const setIcal = (urls: string[]) => set({ icalImportUrls: urls });

  return (
    <div className="grid gap-6">
      <Section title={kind.dealType === "HOTEL_ROOM" ? t("priceFromTitle") : t("priceTitle")} icon={WalletIcon}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Field label={t("price")} error={errors.price}>
            {(props) => (
              <NumberInput
                {...props}
                decimals
                value={values.price}
                onChange={(price) => set({ price })}
                prefix={<Ltr>{symbol}</Ltr>}
                className="text-lg"
              />
            )}
          </Field>
          <Field label={t("currency")}>
            {(props) => (
              <Select value={values.currency} onValueChange={(currency) => set({ currency: currency as CurrencyCode })}>
                <SelectTrigger {...props} className="h-11 w-full min-w-32 bg-card text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {enabledCurrencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      <Ltr>
                        {currencySymbol(c)} {c}
                      </Ltr>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t("period")} error={errors.pricePeriod}>
            {(props) => (
              <Select
                value={values.pricePeriod}
                onValueChange={(pricePeriod) => set({ pricePeriod: pricePeriod as PricePeriod })}
                disabled={periods.length < 2}
              >
                <SelectTrigger {...props} className="h-11 w-full min-w-36 bg-card text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {periods.map((p) => (
                    <SelectItem key={p} value={p}>
                      {label("period", p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
        {kind.dealType === "HOTEL_ROOM" && <p className="text-sm text-muted-foreground">{t("priceFromHelp")}</p>}
        {show("pricePerSqm") && (
          <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm" aria-live="polite">
            {perSqm !== null ? (
              <>
                {t("perSqm")}{" "}
                <Ltr className="font-semibold">{formatMoney(perSqm, values.currency, locale, { maximumFractionDigits: 0 })}</Ltr>
                <span className="text-muted-foreground"> · {formatArea(values.sizeSqm ?? 0, locale)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{t("perSqmHelp")}</span>
            )}
          </p>
        )}
        {listing.status !== "DRAFT" && <p className="text-xs text-muted-foreground">{t("priceHistoryNote")}</p>}
      </Section>

      {(show("deposit") || show("cleaningFee") || show("utilities") || show("minStay")) && (
        <Section title={t("feesTitle")} icon={ReceiptIcon}>
          <div className="grid gap-4 sm:grid-cols-2">
            {show("deposit") && (
              <Field label={t("deposit")} error={errors.deposit} optional description={t("depositHelp")}>
                {(props) => (
                  <NumberInput {...props} decimals value={values.deposit} onChange={(deposit) => set({ deposit })} prefix={<Ltr>{symbol}</Ltr>} />
                )}
              </Field>
            )}
            {show("cleaningFee") && (
              <Field label={t("cleaningFee")} error={errors.cleaningFee} optional>
                {(props) => (
                  <NumberInput
                    {...props}
                    decimals
                    value={values.cleaningFee}
                    onChange={(cleaningFee) => set({ cleaningFee })}
                    prefix={<Ltr>{symbol}</Ltr>}
                  />
                )}
              </Field>
            )}
          </div>
          {show("utilities") && (
            <div className="grid gap-3 rounded-xl border border-border p-3.5">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                {t("utilitiesIncluded")}
                <Switch
                  checked={values.utilitiesIncluded === true}
                  onCheckedChange={(on) => set({ utilitiesIncluded: on, ...(on ? { utilitiesEstimate: null } : {}) })}
                />
              </label>
              {values.utilitiesIncluded !== true && (
                <Field label={t("utilitiesEstimate")} description={t("utilitiesEstimateHelp")} error={errors.utilitiesEstimate} optional>
                  {(props) => (
                    <NumberInput
                      {...props}
                      decimals
                      value={values.utilitiesEstimate}
                      onChange={(utilitiesEstimate) => set({ utilitiesEstimate, utilitiesIncluded: false })}
                      prefix={<Ltr>{symbol}</Ltr>}
                      className="sm:max-w-xs"
                    />
                  )}
                </Field>
              )}
            </div>
          )}
          {show("minStay") && (
            <div className="sm:max-w-sm">
              <Stepper
                label={t("minStay")}
                value={values.minStayNights}
                onChange={(minStayNights) => set({ minStayNights })}
                min={1}
                max={LIMITS.minStayMax}
                error={errors.minStayNights}
                optional
              />
            </div>
          )}
        </Section>
      )}

      {show("discounts") && (
        <Section title={t("discountsTitle")} description={t("discountsDescription")} icon={PercentIcon}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("weeklyDiscount")} error={errors.weeklyDiscountPct} optional>
              {(props) => (
                <NumberInput
                  {...props}
                  value={values.weeklyDiscountPct}
                  onChange={(weeklyDiscountPct) => set({ weeklyDiscountPct })}
                  suffix="%"
                  maxLength={2}
                />
              )}
            </Field>
            <Field label={t("monthlyDiscount")} error={errors.monthlyDiscountPct} optional>
              {(props) => (
                <NumberInput
                  {...props}
                  value={values.monthlyDiscountPct}
                  onChange={(monthlyDiscountPct) => set({ monthlyDiscountPct })}
                  suffix="%"
                  maxLength={2}
                />
              )}
            </Field>
          </div>
        </Section>
      )}

      {show("availability") && (
        <Section title={t("calendarTitle")} description={t("calendarDescription")} icon={CalendarDaysIcon}>
          <AvailabilityCalendar
            locale={locale}
            blocked={blocked}
            icalBlocked={listing.icalBlocked}
            onChange={(ranges) => void saveBlocks(ranges)}
            saving={saving}
          />
        </Section>
      )}

      {show("ical") && (
        <Section title={t("icalTitle")} description={t("icalDescription")} icon={LinkIcon}>
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("icalExport")}</p>
            <CopyLinkField value={listing.icalExportUrl} label={t("icalExport")} />
            <p className="text-xs text-muted-foreground">{t("icalExportHelp")}</p>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">{t("icalImport")}</legend>
            <p className="-mt-1 text-xs text-muted-foreground">{t("icalImportHelp")}</p>
            {icalUrls.map((url, index) => {
              const error = errors[`icalImportUrls.${index}`];
              const errorId = `ical-${index}-error`;
              return (
                <div key={index} className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <Input
                      type="url"
                      dir="ltr"
                      inputMode="url"
                      value={url}
                      maxLength={LIMITS.urlMax}
                      placeholder="https://www.airbnb.com/calendar/ical/….ics"
                      aria-label={t("icalImportLabel", { index: index + 1 })}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(e) => setIcal(icalUrls.map((u, i) => (i === index ? e.target.value : u)))}
                      className="h-11 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      onClick={() => setIcal(icalUrls.filter((_, i) => i !== index))}
                      aria-label={t("icalRemove", { index: index + 1 })}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </div>
                  {error && (
                    <p id={errorId} className="text-sm font-medium text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
            {errors.icalImportUrls && <p className="text-sm font-medium text-destructive">{errors.icalImportUrls}</p>}
            {icalUrls.length < LIMITS.maxIcalImports && (
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => setIcal([...icalUrls, ""])}>
                <PlusIcon aria-hidden />
                {t("icalAdd")}
              </Button>
            )}
          </fieldset>
        </Section>
      )}
    </div>
  );
}
