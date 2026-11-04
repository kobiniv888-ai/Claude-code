"use client";

import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { errorAt, FormField, FormFooter, SwitchRow, useFieldErrors } from "@/components/admin/content/form";
import { useContentAction } from "@/components/admin/content/use-content-action";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { currencyCodes, type CurrencyCode } from "@/config/site";
import type { DealType } from "@/generated/prisma/enums";
import { useRouter } from "@/i18n/navigation";
import { saveReferencePriceAction } from "@/lib/admin/actions/reference-prices";
import { parseAmount, REFERENCE_LIMITS, referenceFieldErrors, referencePriceSchema, sourceMonthProblem, UNIT_BY_DEAL } from "@/lib/admin/reference-prices";
import { formatDate, formatMoney } from "@/lib/format";
import { DEAL_TYPES, PROPERTY_TYPES } from "@/lib/listing/fields";
import { toast } from "@/lib/toast";

const ALL = "__all__";

export type ReferenceFormValues = {
  cityId: string;
  neighborhoodId: string;
  dealType: DealType | "";
  propertyType: string;
  bedrooms: string;
  perSqm: boolean;
  low: string;
  high: string;
  currency: CurrencyCode;
  sourceName: string;
  sourceUrl: string;
  /** "YYYY-MM" */
  sourceMonth: string;
  note: string;
};

export type ReferenceCityOption = { id: string; name: string; neighborhoods: { id: string; name: string }[] };

export function emptyReferenceValues(): ReferenceFormValues {
  return {
    cityId: "",
    neighborhoodId: "",
    dealType: "",
    propertyType: "",
    bedrooms: "",
    perSqm: false,
    low: "",
    high: "",
    currency: "GEL",
    sourceName: "",
    sourceUrl: "",
    sourceMonth: "",
    note: "",
  };
}

/** Add or edit one reference price range (staff with "moderation"). */
export function ReferencePriceForm({ id, initial, cities }: { id: string | null; initial?: ReferenceFormValues; cities: ReferenceCityOption[] }) {
  const t = useTranslations("admin.referencePrices");
  const tFields = useTranslations("listingFields");
  const tForm = useTranslations("adminContent.form");
  const locale = useLocale();
  const router = useRouter();
  const { run, pending } = useContentAction();
  const { errors, setErrors, fromServer } = useFieldErrors();
  const [values, setValues] = useState<ReferenceFormValues>(() => initial ?? emptyReferenceValues());
  const set = <K extends keyof ReferenceFormValues>(key: K, value: ReferenceFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const city = cities.find((c) => c.id === values.cityId);
  const unit = values.dealType ? UNIT_BY_DEAL[values.dealType] : null;

  const payload = () => ({
    cityId: values.cityId,
    neighborhoodId: values.neighborhoodId || null,
    dealType: values.dealType || undefined,
    propertyType: values.propertyType || null,
    bedrooms: values.bedrooms,
    unit: unit ?? undefined,
    perSqm: values.dealType === "SALE" ? values.perSqm : false,
    low: values.low,
    high: values.high,
    currency: values.currency,
    sourceName: values.sourceName,
    sourceUrl: values.sourceUrl,
    sourceMonth: values.sourceMonth,
    note: values.note,
  });

  // The same reading of "45,5" / "1,500" as the server (src/lib/admin/reference-prices.ts).
  const lowNumber = parseAmount(values.low);
  const highNumber = parseAmount(values.high);
  const previewReady = values.sourceName.trim() && /^\d{4}-\d{2}$/.test(values.sourceMonth) && lowNumber > 0 && highNumber > 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = referencePriceSchema.safeParse(payload());
        const monthProblem = sourceMonthProblem(values.sourceMonth);
        if (!parsed.success || monthProblem) {
          const fieldErrors = parsed.success ? {} : referenceFieldErrors(parsed.error);
          if (monthProblem && !fieldErrors.sourceMonth) fieldErrors.sourceMonth = [monthProblem];
          setErrors(fieldErrors);
          toast.error(tForm("checkFields"));
          return;
        }
        run(() => saveReferencePriceAction({ id, values: payload() }), {
          success: id ? t("saved") : t("created"),
          onError: fromServer,
          onSuccess: (d) => {
            if (!id) router.push(`/admin/reference-prices/${d.id}`);
          },
        });
      }}
    >
      <p className="rounded-xl border border-border-strong/40 bg-surface-muted p-3 text-sm">{t("form.publicOnly")}</p>

      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2" aria-labelledby="rp-where">
        <h2 id="rp-where" className="text-sm font-semibold sm:col-span-2">
          {t("form.whereTitle")}
        </h2>
        <FormField label={t("form.city")} required error={errorAt(errors, "cityId")}>
          {(props) => (
            <Select
              value={values.cityId || undefined}
              onValueChange={(v) => setValues((prev) => ({ ...prev, cityId: v, neighborhoodId: "" }))}
            >
              <SelectTrigger {...props} className="w-full">
                <SelectValue placeholder={t("form.chooseCity")} />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("form.neighborhood")} hint={t("form.neighborhoodHint")} error={errorAt(errors, "neighborhoodId")}>
          {(props) => (
            <Select value={values.neighborhoodId || ALL} onValueChange={(v) => set("neighborhoodId", v === ALL ? "" : v)} disabled={!city || city.neighborhoods.length === 0}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("form.wholeCity")}</SelectItem>
                {(city?.neighborhoods ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("form.dealType")} required error={errorAt(errors, "dealType") ?? errorAt(errors, "unit")}>
          {(props) => (
            <Select
              value={values.dealType || undefined}
              onValueChange={(v) => setValues((prev) => ({ ...prev, dealType: v as DealType, perSqm: v === "SALE" ? prev.perSqm : false }))}
            >
              <SelectTrigger {...props} className="w-full">
                <SelectValue placeholder={t("form.chooseDealType")} />
              </SelectTrigger>
              <SelectContent>
                {DEAL_TYPES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {tFields(`dealType.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("form.propertyType")} hint={t("form.propertyTypeHint")} error={errorAt(errors, "propertyType")}>
          {(props) => (
            <Select value={values.propertyType || ALL} onValueChange={(v) => set("propertyType", v === ALL ? "" : v)}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("form.allTypes")}</SelectItem>
                {PROPERTY_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {tFields(`propertyType.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("form.bedrooms")} hint={t("form.bedroomsHint")} error={errorAt(errors, "bedrooms")}>
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              dir="ltr"
              className="w-full sm:w-32"
              value={values.bedrooms}
              onChange={(e) => set("bedrooms", e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("form.unit")}</span>
          <p className="flex min-h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">
            {unit ? t(`unit.${unit}${values.perSqm ? "_sqm" : ""}`) : t("form.unitHint")}
          </p>
        </div>
        {values.dealType === "SALE" ? (
          <SwitchRow
            className="sm:col-span-2"
            label={t("form.perSqm")}
            description={t("form.perSqmHint")}
            checked={values.perSqm}
            onCheckedChange={(v) => set("perSqm", v)}
          />
        ) : null}
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-3" aria-labelledby="rp-range">
        <h2 id="rp-range" className="text-sm font-semibold sm:col-span-3">
          {t("form.rangeTitle")}
        </h2>
        <FormField label={t("form.low")} required error={errorAt(errors, "low")}>
          {(props) => <Input {...props} inputMode="decimal" dir="ltr" value={values.low} onChange={(e) => set("low", e.target.value.slice(0, 16))} />}
        </FormField>
        <FormField label={t("form.high")} required error={errorAt(errors, "high")}>
          {(props) => <Input {...props} inputMode="decimal" dir="ltr" value={values.high} onChange={(e) => set("high", e.target.value.slice(0, 16))} />}
        </FormField>
        <FormField label={t("form.currency")} required error={errorAt(errors, "currency")}>
          {(props) => (
            <Select value={values.currency} onValueChange={(v) => set("currency", v as CurrencyCode)}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyCodes.map((c) => (
                  <SelectItem key={c} value={c}>
                    <Ltr>{c}</Ltr>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2" aria-labelledby="rp-source">
        <h2 id="rp-source" className="text-sm font-semibold sm:col-span-2">
          {t("form.sourceTitle")}
        </h2>
        <FormField label={t("form.sourceName")} hint={t("form.sourceNameHint")} required error={errorAt(errors, "sourceName")}>
          {(props) => (
            <Input {...props} dir={values.sourceName ? "auto" : undefined} maxLength={REFERENCE_LIMITS.sourceName} value={values.sourceName} onChange={(e) => set("sourceName", e.target.value)} />
          )}
        </FormField>
        <FormField label={t("form.sourceMonth")} hint={t("form.sourceMonthHint")} required error={errorAt(errors, "sourceMonth")}>
          {(props) => <Input {...props} type="month" dir="ltr" className="w-full sm:w-48" value={values.sourceMonth} onChange={(e) => set("sourceMonth", e.target.value)} />}
        </FormField>
        <FormField label={t("form.sourceUrl")} hint={t("form.sourceUrlHint")} error={errorAt(errors, "sourceUrl")} className="sm:col-span-2">
          {(props) => (
            <Input
              {...props}
              type="url"
              inputMode="url"
              dir="ltr"
              placeholder="https://"
              maxLength={REFERENCE_LIMITS.sourceUrl}
              value={values.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t("form.note")} hint={t("form.noteHint")} error={errorAt(errors, "note")} className="sm:col-span-2">
          {(props) => <Textarea {...props} dir={values.note ? "auto" : undefined} rows={3} maxLength={REFERENCE_LIMITS.note} value={values.note} onChange={(e) => set("note", e.target.value)} />}
        </FormField>
      </section>

      <section className="rounded-xl border border-dashed bg-card p-4 text-sm" aria-live="polite">
        <h2 className="mb-1 text-xs font-medium text-muted-foreground">{t("form.preview")}</h2>
        {previewReady ? (
          <p>
            <Ltr className="font-semibold">
              {formatMoney(lowNumber, values.currency, locale)} – {formatMoney(highNumber, values.currency, locale)}
            </Ltr>{" "}
            {unit ? <span className="text-muted-foreground">{t(`unit.${unit}${values.perSqm ? "_sqm" : ""}`)}</span> : null}
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("sourceLabel", {
                source: values.sourceName.trim(),
                month: formatDate(`${values.sourceMonth}-01`, locale, { month: "long", year: "numeric" }),
              })}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">{t("form.previewEmpty")}</p>
        )}
      </section>

      <FormFooter>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/reference-prices")} disabled={pending}>
          {t("form.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          <Save aria-hidden />
          {pending ? t("form.saving") : t("form.save")}
        </Button>
      </FormFooter>
    </form>
  );
}
