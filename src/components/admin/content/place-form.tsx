"use client";

import { ShieldCheck, Save, FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { PhoneInput } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { deletePlace, savePlace } from "@/lib/admin/content/actions/places";
import { coordText, type CoordText } from "@/lib/admin/content/coords";
import { emptyLocalized, type LocalizedForm } from "@/lib/admin/content/localized";
import { JEWISH_PLACE_TYPES, LIMITS, placeSchema } from "@/lib/admin/content/schemas";
import { ConfirmButton } from "./bits";
import { errorAt, FormField, FormFooter, LanguageTabs, LocaleText, parseNumber, SwitchRow, useFieldErrors } from "./form";
import { MapField } from "./map-field";
import { useContentAction } from "./use-content-action";

const NO_CITY = "__none__";

export type PlaceFormValues = {
  type: string;
  names: LocalizedForm;
  description: LocalizedForm;
  address: LocalizedForm;
  hours: LocalizedForm;
  cityId: string;
  coords: CoordText;
  phone: string;
  website: string;
  active: boolean;
  isDemo: boolean;
};

export type PlaceCityOption = { id: string; name: string; lat: number; lng: number };

function newPlaceValues(): PlaceFormValues {
  return {
    type: "SYNAGOGUE",
    names: emptyLocalized(),
    description: emptyLocalized(),
    address: emptyLocalized(),
    hours: emptyLocalized(),
    cityId: "",
    coords: coordText(null, null),
    phone: "",
    website: "",
    active: true,
    isDemo: false,
  };
}

export function PlaceForm({ id, initial, cities }: { id: string | null; initial?: PlaceFormValues; cities: PlaceCityOption[] }) {
  const t = useTranslations("adminContent.places");
  const tForm = useTranslations("adminContent.form");
  const router = useRouter();
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<PlaceFormValues>(() => initial ?? newPlaceValues());
  const [focusKey, setFocusKey] = useState(0);
  const set = <K extends keyof PlaceFormValues>(key: K, value: PlaceFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const city = cities.find((c) => c.id === values.cityId);

  const payload = () => ({
    type: values.type,
    names: values.names,
    description: values.description,
    address: values.address,
    hours: values.hours,
    cityId: values.cityId || null,
    lat: parseNumber(values.coords.lat),
    lng: parseNumber(values.coords.lng),
    phone: values.phone,
    website: values.website,
    active: values.active,
    isDemo: values.isDemo,
  });

  const localeHasError = (locale: string) => ["names", "description", "address", "hours"].some((f) => Boolean(errors[`${f}.${locale}`]));

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate(placeSchema, payload())) {
          toast.error(tForm("checkFields"));
          return;
        }
        run(() => savePlace({ id, values: payload() }), {
          success: (d) => (d.listingsUpdated > 0 ? t("savedWithListings", { count: d.listingsUpdated }) : t("saved")),
          onError: fromServer,
          onSuccess: (d) => {
            if (!id) router.push(`/admin/content/places/${d.id}`);
          },
        });
      }}
    >
      <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        {t("realOnly")}
      </p>

      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2">
        <FormField label={t("type")} required error={errorAt(errors, "type")}>
          {(props) => (
            <Select value={values.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JEWISH_PLACE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`types.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("city")} hint={t("cityHint")} error={errorAt(errors, "cityId")}>
          {(props) => (
            <Select
              value={values.cityId || NO_CITY}
              onValueChange={(v) => {
                set("cityId", v === NO_CITY ? "" : v);
                setFocusKey((k) => k + 1);
              }}
            >
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CITY}>{t("noCity")}</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <LanguageTabs
          filled={(locale) => Boolean(values.names[locale].trim())}
          invalid={(locale) => localeHasError(locale)}
        >
          {(locale) => (
            <>
              <LocaleText
                locale={locale}
                label={t("name")}
                required={locale === "he" || locale === "en"}
                value={values.names[locale]}
                onChange={(v) => set("names", { ...values.names, [locale]: v })}
                error={errorAt(errors, `names.${locale}`)}
                maxLength={LIMITS.name}
              />
              <LocaleText
                locale={locale}
                label={t("address")}
                value={values.address[locale]}
                onChange={(v) => set("address", { ...values.address, [locale]: v })}
                error={errorAt(errors, `address.${locale}`)}
                maxLength={LIMITS.address}
              />
              <LocaleText
                locale={locale}
                label={t("descriptionField")}
                multiline
                rows={4}
                value={values.description[locale]}
                onChange={(v) => set("description", { ...values.description, [locale]: v })}
                error={errorAt(errors, `description.${locale}`)}
                maxLength={LIMITS.description}
              />
              <LocaleText
                locale={locale}
                label={t("hours")}
                hint={t("hoursHint")}
                multiline
                rows={3}
                value={values.hours[locale]}
                onChange={(v) => set("hours", { ...values.hours, [locale]: v })}
                error={errorAt(errors, `hours.${locale}`)}
                maxLength={LIMITS.hours}
              />
            </>
          )}
        </LanguageTabs>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <MapField
          label={t("pin")}
          value={values.coords}
          onChange={(coords) => set("coords", coords)}
          center={city ? { lat: city.lat, lng: city.lng } : null}
          focusKey={focusKey}
          zoom={city || values.coords.lat ? 14 : 7}
          errors={{ lat: errorAt(errors, "lat"), lng: errorAt(errors, "lng") }}
        />
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2">
        <PhoneInput
          label={t("phone")}
          value={values.phone || undefined}
          onChange={(v) => set("phone", v ?? "")}
          error={errorAt(errors, "phone") ? tForm(`errors.${errorAt(errors, "phone")}`) : null}
        />
        <FormField label={t("website")} error={errorAt(errors, "website")}>
          {(props) => (
            <Input {...props} type="url" dir="ltr" placeholder="https://" value={values.website} maxLength={LIMITS.url} onChange={(e) => set("website", e.target.value)} />
          )}
        </FormField>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <SwitchRow label={t("active")} description={t("activeHint")} checked={values.active} onCheckedChange={(v) => set("active", v)} />
        <SwitchRow
          label={
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical aria-hidden className="size-4 text-terracotta" />
              {t("isDemo")}
            </span>
          }
          description={t("isDemoHint")}
          checked={values.isDemo}
          onCheckedChange={(v) => set("isDemo", v)}
        />
      </section>

      <FormFooter>
        {id ? (
          <ConfirmButton
            label={t("delete")}
            title={t("deleteTitle")}
            description={t("deleteDescription")}
            variant="outline"
            className="me-auto"
            onConfirm={() =>
              run(() => deletePlace({ id }), {
                success: t("deleted"),
                refresh: false,
                onSuccess: () => router.push("/admin/content/places"),
              })
            }
          />
        ) : null}
        <Button type="submit" disabled={pending}>
          <Save aria-hidden />
          {id ? t("save") : t("create")}
        </Button>
      </FormFooter>
    </form>
  );
}
