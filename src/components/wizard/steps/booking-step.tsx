"use client";

import { useTranslations } from "next-intl";
import {
  BanknoteIcon,
  CalendarCheck2Icon,
  CalendarDaysIcon,
  ChevronRightIcon,
  ClockIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  UndoDotIcon,
  WalletIcon,
  ZapIcon,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ltr } from "@/components/common/ltr";
import { HostInstantNotice } from "@/components/booking/host-instant-notice";
import type { CurrencyCode } from "@/config/site";
import type { CancellationPolicy } from "@/generated/prisma/enums";
import { CANCELLATION_POLICIES, MAX_STAY_NIGHTS, PAYMENT_METHODS, type PaymentMethod } from "@/lib/booking/constants";
import { DEFAULT_CHECK_IN_TIME } from "@/lib/booking/dates";
import { enabledCurrencies } from "@/lib/currency/convert";
import { currencySymbol, formatMoney } from "@/lib/format";
import { clockLabel } from "@/lib/listing/check-times";
import { applies } from "@/lib/wizard/steps";
import { CheckCards, CheckTimeSelect, ChoiceCards, Field, NumberInput, Section, Stepper } from "../fields";
import type { StepProps } from "../step-props";

/**
 * "הזמנות ומחיר" — short stays and hotel rooms (brief 5.6): price per night, an optional weekend
 * price and cleaning fee, minimum nights, maximum guests, check-in/out times, the cancellation
 * policy and the payment methods accepted at check-in. Saving it (with a payment method) turns
 * instant booking on. It replaces the "price" step for these listings, so nothing is asked twice.
 */
export function BookingStep({ listing, values, set, errors, kind, locale, openCalendar }: StepProps) {
  const t = useTranslations("wizard.booking");
  const tb = useTranslations("booking");
  const isHotel = kind.dealType === "HOTEL_ROOM";
  const symbol = currencySymbol(values.currency);
  // An older weekly price is not a nightly price: the field starts empty until one is entered.
  const nightly = values.pricePeriod === "NIGHT" ? values.price : null;
  const legacyPrice = values.pricePeriod !== "NIGHT" && values.price !== null && values.price > 0 ? values.price : null;

  return (
    <div className="grid gap-6">
      {/* Hotels: contact-only until booking by room type; others: why instant booking is off, if it is (round 3). */}
      {isHotel ? (
        <HostInstantNotice hotel />
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-card border border-primary-tint-border bg-primary-tint p-4">
            <ZapIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
            <div className="grid min-w-0 gap-1">
              <p className="text-body font-semibold">{t("instantTitle")}</p>
              <p className="text-small text-pretty text-muted-foreground">{t("instantBody")}</p>
            </div>
          </div>
          <HostInstantNotice hotel={false} />
        </>
      )}

      <Section title={isHotel ? t("priceFromTitle") : t("priceTitle")} icon={WalletIcon}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field
            label={t("pricePerNight")}
            error={errors.price}
            optional={isHotel}
            description={isHotel ? t("hotelPriceHelp") : undefined}
          >
            {(props) => (
              <NumberInput
                {...props}
                decimals
                value={nightly}
                onChange={(price) => set({ price, pricePeriod: "NIGHT" })}
                prefix={<Ltr>{symbol}</Ltr>}
                className="text-lg"
              />
            )}
          </Field>
          <Field label={t("currency")} description={t("currencyHelp")}>
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
        </div>
        {legacyPrice !== null && (
          <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-pretty" role="note">
            {t.rich("legacyWeekly", {
              price: () => <Ltr className="font-semibold">{formatMoney(legacyPrice, values.currency, locale)}</Ltr>,
            })}
          </p>
        )}
        {!isHotel && (
          <Field label={t("weekendPrice")} description={t("weekendPriceHelp")} error={errors.weekendPrice} optional>
            {(props) => (
              <NumberInput
                {...props}
                decimals
                value={values.weekendPrice}
                onChange={(weekendPrice) => set({ weekendPrice })}
                prefix={<Ltr>{symbol}</Ltr>}
                className="sm:max-w-xs"
              />
            )}
          </Field>
        )}
        {listing.status !== "DRAFT" && <p className="text-xs text-muted-foreground">{t("priceHistoryNote")}</p>}
      </Section>

      <Section title={t("feesTitle")} description={t("feesDescription")} icon={ReceiptIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          {applies("cleaningFee", kind) && (
            <Field label={t("cleaningFee")} description={t("cleaningFeeHelp")} error={errors.cleaningFee} optional>
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
          {applies("deposit", kind) && (
            <Field label={t("deposit")} description={t("depositHelp")} error={errors.deposit} optional>
              {(props) => (
                <NumberInput {...props} decimals value={values.deposit} onChange={(deposit) => set({ deposit })} prefix={<Ltr>{symbol}</Ltr>} />
              )}
            </Field>
          )}
        </div>
      </Section>

      <Section title={t("stayTitle")} description={t("stayDescription")} icon={CalendarCheck2Icon}>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Stepper
            label={t("minNights")}
            value={values.minStayNights}
            onChange={(minStayNights) => set({ minStayNights })}
            min={1}
            max={MAX_STAY_NIGHTS}
            error={errors.minStayNights}
            optional
          />
          <Stepper
            label={t("maxGuests")}
            description={isHotel ? t("maxGuestsHotelHelp") : t("maxGuestsHelp")}
            value={values.maxGuests}
            onChange={(maxGuests) => set({ maxGuests })}
            min={1}
            max={100}
            error={errors.maxGuests}
            optional={isHotel}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("checkInFrom")} error={errors.checkInFrom} optional>
            {(props) => (
              <CheckTimeSelect
                {...props}
                kind="checkIn"
                time={values.checkInFrom}
                flexible={values.checkInFlexible}
                onChange={(choice) => set({ checkInFrom: choice.time, checkInFlexible: choice.flexible })}
              />
            )}
          </Field>
          <Field label={t("checkOutUntil")} error={errors.checkOutUntil} optional>
            {(props) => (
              <CheckTimeSelect
                {...props}
                kind="checkOut"
                time={values.checkOutUntil}
                flexible={values.checkOutFlexible}
                onChange={(choice) => set({ checkOutUntil: choice.time, checkOutFlexible: choice.flexible })}
              />
            )}
          </Field>
        </div>
        <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
          <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("timesHelp", { time: clockLabel(DEFAULT_CHECK_IN_TIME, locale) })}
        </p>
      </Section>

      <Section title={t("policyTitle")} description={t("policyDescription")} icon={UndoDotIcon}>
        <ChoiceCards<CancellationPolicy>
          legend={t("policyTitle")}
          legendHidden
          name="cancellationPolicy"
          value={values.cancellationPolicy}
          onChange={(cancellationPolicy) => set({ cancellationPolicy })}
          error={errors.cancellationPolicy}
          columns="sm:grid-cols-3"
          size="md"
          options={CANCELLATION_POLICIES.map((policy) => ({
            value: policy,
            title: tb(`policy.${policy}.name`),
            description: tb(`policy.${policy}.rule`),
          }))}
        />
        <p className="text-sm text-pretty text-muted-foreground">{t("policyNote")}</p>
      </Section>

      <Section title={t("paymentTitle")} icon={BanknoteIcon}>
        <CheckCards<PaymentMethod>
          legend={t("paymentLegend")}
          description={t("paymentHelp", { currency: tb(`inCurrency.${values.currency}`) })}
          values={values.paymentMethodsAtCheckIn}
          onChange={(paymentMethodsAtCheckIn) => set({ paymentMethodsAtCheckIn })}
          error={errors.paymentMethodsAtCheckIn}
          columns="sm:grid-cols-3"
          options={PAYMENT_METHODS.map((method) => ({ value: method, label: tb(`paymentMethod.${method}`) }))}
        />
        <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
          {t("noFeesNote")}
        </p>
      </Section>

      <Section title={t("calendarTitle")} description={t("calendarDescription")} icon={CalendarDaysIcon}>
        <button
          type="button"
          // A full-screen sheet over the form (bug 2.10): the step and its scroll position stay.
          onClick={openCalendar}
          aria-haspopup="dialog"
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-strong bg-card px-4 py-3 text-start font-medium transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">{t("calendarLink")}</span>
          <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
        </button>
      </Section>
    </div>
  );
}
