"use client";

import { MapPinned, Pencil, Plus, Save, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pickLocalized } from "@/i18n/locale";
import { deleteCity, deleteNeighborhood, saveNeighborhood } from "@/lib/admin/content/actions/cities";
import { emptyLocalized, toLocalizedForm, type LocalizedForm } from "@/lib/admin/content/localized";
import { LIMITS, neighborhoodSchema } from "@/lib/admin/content/schemas";
import { useRouter } from "@/i18n/navigation";
import { slugify } from "@/lib/listing/urls";
import { ConfirmButton } from "./bits";
import { Pill } from "./pill";
import { errorAt, FormField, LocalizedInputs, parseNumber, SwitchRow, useFieldErrors } from "./form";
import { coordText, type CoordText } from "@/lib/admin/content/coords";
import { MapField } from "./map-field";
import { useContentAction } from "./use-content-action";

export type NeighborhoodItem = {
  id: string;
  slug: string;
  names: unknown;
  aliases: string[];
  lat: number;
  lng: number;
  sortOrder: number;
  active: boolean;
  listings: number;
};

type HoodValues = { names: LocalizedForm; aliases: string; slug: string; coords: CoordText; sortOrder: string; active: boolean };

function NeighborhoodForm({
  cityId,
  item,
  center,
  nextOrder,
  onDone,
}: {
  cityId: string;
  item: NeighborhoodItem | null;
  center: { lat: number; lng: number };
  nextOrder: number;
  onDone: () => void;
}) {
  const t = useTranslations("adminContent.cities");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [slugTouched, setSlugTouched] = useState(Boolean(item));
  const [values, setValues] = useState<HoodValues>(() =>
    item
      ? {
          names: toLocalizedForm(item.names),
          aliases: item.aliases.join(", "),
          slug: item.slug,
          coords: coordText(item.lat, item.lng),
          sortOrder: String(item.sortOrder),
          active: item.active,
        }
      : { names: emptyLocalized(), aliases: "", slug: "", coords: coordText(null, null), sortOrder: String(nextOrder), active: true },
  );
  const payload = () => ({
    cityId,
    names: values.names,
    aliases: values.aliases,
    slug: values.slug,
    lat: parseNumber(values.coords.lat),
    lng: parseNumber(values.coords.lng),
    sortOrder: parseNumber(values.sortOrder),
    active: values.active,
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-xl border-2 border-primary/30 bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate(neighborhoodSchema, payload())) {
          toast.error(tForm("checkFields"));
          return;
        }
        run(() => saveNeighborhood({ id: item?.id ?? null, values: payload() }), {
          success: item ? t("neighborhoodSaved") : t("neighborhoodCreated"),
          onError: fromServer,
          onSuccess: onDone,
        });
      }}
    >
      <h3 className="text-sm font-semibold">{item ? t("editNeighborhood") : t("addNeighborhood")}</h3>
      <LocalizedInputs
        label={t("names")}
        value={values.names}
        onChange={(names) => setValues((v) => ({ ...v, names, slug: slugTouched ? v.slug : slugify(names.en) }))}
        errors={errors}
        path="names"
        maxLength={LIMITS.name}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("slug")} required error={errorAt(errors, "slug")}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              value={values.slug}
              maxLength={LIMITS.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setValues((v) => ({ ...v, slug: e.target.value.toLowerCase() }));
              }}
            />
          )}
        </FormField>
        <FormField label={t("aliases")} hint={t("aliasesHint")} error={errorAt(errors, "aliases")} className="sm:col-span-2">
          {(props) => (
            <Textarea {...props} dir="auto" rows={1} value={values.aliases} maxLength={LIMITS.aliases} onChange={(e) => setValues((v) => ({ ...v, aliases: e.target.value }))} />
          )}
        </FormField>
      </div>
      <MapField
        label={t("neighborhoodCenter")}
        value={values.coords}
        onChange={(coords) => setValues((v) => ({ ...v, coords }))}
        center={center}
        zoom={13}
        errors={{ lat: errorAt(errors, "lat"), lng: errorAt(errors, "lng") }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("sortOrder")} error={errorAt(errors, "sortOrder")}>
          {(props) => (
            <Input {...props} type="number" min={0} max={9999} dir="ltr" value={values.sortOrder} onChange={(e) => setValues((v) => ({ ...v, sortOrder: e.target.value }))} />
          )}
        </FormField>
        <SwitchRow label={t("active")} description={t("neighborhoodActiveHint")} checked={values.active} onCheckedChange={(active) => setValues((v) => ({ ...v, active }))} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          <X aria-hidden />
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          <Save aria-hidden />
          {t("saveNeighborhood")}
        </Button>
      </div>
    </form>
  );
}

export function NeighborhoodsManager({
  cityId,
  center,
  items,
}: {
  cityId: string;
  center: { lat: number; lng: number };
  items: NeighborhoodItem[];
}) {
  const t = useTranslations("adminContent.cities");
  const locale = useLocale();
  const { run } = useContentAction();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const nextOrder = items.reduce((max, i) => Math.max(max, i.sortOrder + 1), 0);

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && editing !== "new" ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <MapPinned aria-hidden className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noNeighborhoods")}</p>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((item) =>
          editing === item.id ? (
            <li key={item.id}>
              <NeighborhoodForm cityId={cityId} item={item} center={center} nextOrder={nextOrder} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{pickLocalized(item.names, locale)}</p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span dir="ltr">{item.slug}</span>
                  <span>{t("listingsCount", { count: item.listings })}</span>
                  {!item.active ? <Pill tone="muted">{t("hidden")}</Pill> : null}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(item.id)} disabled={editing !== null}>
                <Pencil aria-hidden />
                {t("editButton")}
              </Button>
              <ConfirmButton
                label={t("delete")}
                iconOnly
                size="icon-sm"
                variant="ghost"
                disabled={item.listings > 0 || editing !== null}
                title={t("deleteNeighborhoodTitle", { name: pickLocalized(item.names, locale) })}
                description={t("deleteNeighborhoodDescription")}
                onConfirm={() => run(() => deleteNeighborhood({ id: item.id }), { success: t("neighborhoodDeleted") })}
              />
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <NeighborhoodForm cityId={cityId} item={null} center={center} nextOrder={nextOrder} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" variant="outline" className="w-fit" onClick={() => setEditing("new")} disabled={editing !== null}>
          <Plus aria-hidden />
          {t("addNeighborhood")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t("neighborhoodDeleteRule")}</p>
    </div>
  );
}

/** Delete a city (only when no listing uses it). */
export function DeleteCityButton({ id, name, listings }: { id: string; name: string; listings: number }) {
  const t = useTranslations("adminContent.cities");
  const router = useRouter();
  const { run } = useContentAction();
  return (
    <ConfirmButton
      label={t("deleteCity")}
      size="sm"
      variant="outline"
      disabled={listings > 0}
      title={t("deleteCityTitle", { name })}
      description={t("deleteCityDescription")}
      onConfirm={() =>
        run(() => deleteCity({ id }), {
          success: t("cityDeleted"),
          onSuccess: () => router.push("/admin/content/cities"),
          refresh: false,
        })
      }
    />
  );
}
