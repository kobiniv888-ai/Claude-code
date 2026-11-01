"use client";

import { ImageOff, ImageUp, Plane, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { saveCity, uploadCityPhoto } from "@/lib/admin/content/actions/cities";
import { emptyLocalized, type LocalizedForm } from "@/lib/admin/content/localized";
import { CITY_TIMEZONES, LIMITS, citySchema, slugSchema } from "@/lib/admin/content/schemas";
import { slugify } from "@/lib/listing/urls";
import { errorAt, FormField, FormFooter, LocalizedInputs, parseNumber, parseOptionalNumber, SwitchRow, useFieldErrors } from "./form";
import { coordText, type CoordText } from "@/lib/admin/content/coords";
import { MapField } from "./map-field";
import { useContentAction } from "./use-content-action";

export type CityFormValues = {
  names: LocalizedForm;
  aliases: string;
  slug: string;
  coords: CoordText;
  timezone: string;
  airportCode: string;
  airport: CoordText;
  isPopular: boolean;
  sortOrder: string;
  active: boolean;
  photoUrl: string;
};

function newCityValues(): CityFormValues {
  return {
    names: emptyLocalized(),
    aliases: "",
    slug: "",
    coords: coordText(null, null),
    timezone: "Asia/Tbilisi",
    airportCode: "",
    airport: coordText(null, null),
    isPopular: false,
    sortOrder: "0",
    active: true,
    photoUrl: "",
  };
}

function toPayload(v: CityFormValues) {
  return {
    names: v.names,
    aliases: v.aliases,
    slug: v.slug,
    lat: parseNumber(v.coords.lat),
    lng: parseNumber(v.coords.lng),
    timezone: v.timezone,
    airportCode: v.airportCode,
    airportLat: parseOptionalNumber(v.airport.lat),
    airportLng: parseOptionalNumber(v.airport.lng),
    isPopular: v.isPopular,
    sortOrder: parseNumber(v.sortOrder),
    active: v.active,
    photoUrl: v.photoUrl,
  };
}

async function compress(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const output = await imageCompression(file, { maxSizeMB: 0.9, maxWidthOrHeight: 2000, useWebWorker: false, preserveExif: false });
    return new File([output], file.name, { type: output.type });
  } catch {
    return file;
  }
}

export function CityForm({ id, initial }: { id: string | null; initial?: CityFormValues }) {
  const t = useTranslations("adminContent.cities");
  const tForm = useTranslations("adminContent.form");
  const router = useRouter();
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<CityFormValues>(() => initial ?? newCityValues());
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof CityFormValues>(key: K, value: CityFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onNames = (names: LocalizedForm) => {
    setValues((prev) => ({ ...prev, names, slug: slugTouched ? prev.slug : slugify(names.en) }));
  };

  const upload = async (file: File) => {
    const slug = slugSchema.safeParse(values.slug);
    if (!slug.success) {
      toast.error(t("photoNeedsSlug"));
      return;
    }
    setUploading(true);
    const data = new FormData();
    data.set("slug", slug.data);
    data.set("file", await compress(file));
    await run(() => uploadCityPhoto(data), {
      success: t("photoUploaded"),
      onSuccess: ({ url }) => set("photoUrl", url),
      refresh: false,
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const payload = validate(citySchema, toPayload(values));
    if (!payload) {
      toast.error(tForm("checkFields"));
      return;
    }
    run(() => saveCity({ id, values: toPayload(values) }), {
      success: id ? t("saved") : t("created"),
      onError: fromServer,
      onSuccess: (data) => {
        if (!id) router.push(`/admin/content/cities/${data.id}`);
      },
    });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
        <LocalizedInputs label={t("names")} value={values.names} onChange={onNames} errors={errors} path="names" maxLength={LIMITS.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("slug")} required hint={t("slugHint")} error={errorAt(errors, "slug")}>
            {(props) => (
              <Input
                {...props}
                dir="ltr"
                value={values.slug}
                maxLength={LIMITS.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value.toLowerCase());
                }}
              />
            )}
          </FormField>
          <FormField label={t("aliases")} hint={t("aliasesHint")} error={errorAt(errors, "aliases")}>
            {(props) => (
              <Textarea {...props} dir="auto" rows={2} value={values.aliases} maxLength={LIMITS.aliases} onChange={(e) => set("aliases", e.target.value)} />
            )}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
        <MapField
          label={t("location")}
          value={values.coords}
          onChange={(coords) => set("coords", coords)}
          zoom={values.coords.lat ? 12 : 7}
          errors={{ lat: errorAt(errors, "lat"), lng: errorAt(errors, "lng") }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("timezone")} error={errorAt(errors, "timezone")}>
            {(props) => (
              <Select value={values.timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger {...props} className="w-full" dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CITY_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz} dir="ltr">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={t("sortOrder")} hint={t("sortOrderHint")} error={errorAt(errors, "sortOrder")}>
            {(props) => <Input {...props} type="number" min={0} max={9999} dir="ltr" value={values.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Plane aria-hidden className="size-4 text-muted-foreground" />
          {t("airport")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("airportHint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t("airportCode")} error={errorAt(errors, "airportCode")}>
            {(props) => (
              <Input {...props} dir="ltr" maxLength={3} placeholder="TBS" value={values.airportCode} onChange={(e) => set("airportCode", e.target.value.toUpperCase())} />
            )}
          </FormField>
          <FormField label={t("airportLat")} error={errorAt(errors, "airportLat")}>
            {(props) => (
              <Input {...props} dir="ltr" inputMode="decimal" value={values.airport.lat} onChange={(e) => set("airport", { ...values.airport, lat: e.target.value })} />
            )}
          </FormField>
          <FormField label={t("airportLng")} error={errorAt(errors, "airportLng")}>
            {(props) => (
              <Input {...props} dir="ltr" inputMode="decimal" value={values.airport.lng} onChange={(e) => set("airport", { ...values.airport, lng: e.target.value })} />
            )}
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">{t("photo")}</h2>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg border bg-muted sm:w-56">
            {values.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of a local or uploaded URL
              <img src={values.photoUrl} alt={t("photoAlt")} className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                <ImageOff aria-hidden className="size-6" />
                {t("noPhoto")}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id="city-photo-file"
              // The button below opens it; keep it out of the tab order but give it a name.
              tabIndex={-1}
              aria-label={t("uploadPhoto")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" className="w-fit" disabled={uploading || pending} onClick={() => fileRef.current?.click()}>
              <ImageUp aria-hidden />
              {uploading ? t("uploading") : t("uploadPhoto")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
            <FormField label={t("photoUrl")} error={errorAt(errors, "photoUrl")}>
              {(props) => (
                <Input {...props} dir="ltr" value={values.photoUrl} maxLength={LIMITS.url} placeholder="/photos/cities/tbilisi.webp" onChange={(e) => set("photoUrl", e.target.value)} />
              )}
            </FormField>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <SwitchRow label={t("popular")} description={t("popularHint")} checked={values.isPopular} onCheckedChange={(v) => set("isPopular", v)} />
        <SwitchRow label={t("active")} description={t("activeHint")} checked={values.active} onCheckedChange={(v) => set("active", v)} />
      </section>

      <FormFooter>
        <Button type="submit" disabled={pending || uploading}>
          <Save aria-hidden />
          {id ? t("save") : t("create")}
        </Button>
      </FormFooter>
    </form>
  );
}
