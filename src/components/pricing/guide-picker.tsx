"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DealType, PropertyType } from "@/generated/prisma/enums";
import { useRouter } from "@/i18n/navigation";
import { DEAL_TYPES, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import { GUIDE_GUEST_OPTIONS, GUIDE_SIZE_OPTIONS, guidePageHref, type GuidePageQuery } from "@/lib/pricing/page-params";

/**
 * The "מדריך מחירים" page's question: one of the host's listings (opens at once), or a city, deal
 * type, property type and size ("הצגת המחירים"). It only changes the page's address; the page
 * checks the session and asks the guide on the server.
 */

export type PickerListing = { id: string; label: string };
export type PickerCity = { slug: string; name: string };

const triggerClass = "h-11 w-full bg-card text-base";

function Pending({ pending, label }: { pending: boolean; label: string }) {
  return pending ? (
    <p className="text-sm text-muted-foreground" role="status">
      {label}
    </p>
  ) : null;
}

export function GuideListingPicker({ listings, selected }: { listings: PickerListing[]; selected: string | null }) {
  const t = useTranslations("pricing.page");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Label htmlFor="guide-listing" className="text-sm font-medium">
        {t("listing")}
      </Label>
      <Select
        value={selected ?? undefined}
        onValueChange={(id) => start(() => router.push(guidePageHref({ mode: "listing", listingId: id })))}
      >
        <SelectTrigger id="guide-listing" className={triggerClass}>
          <SelectValue placeholder={t("listingPlaceholder")} />
        </SelectTrigger>
        <SelectContent position="popper">
          {listings.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <span className="truncate">
                {l.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Pending pending={pending} label={t("loading")} />
    </div>
  );
}

export function GuideCustomPicker({ cities, initial }: { cities: PickerCity[]; initial: Extract<GuidePageQuery, { mode: "custom" }> }) {
  const t = useTranslations("pricing.page");
  const tf = useTranslations("listingFields");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [citySlug, setCity] = useState(initial.citySlug ?? "");
  const [dealType, setDeal] = useState<DealType>(initial.dealType);
  const [propertyType, setType] = useState<PropertyType>(initial.propertyType);
  const [size, setSize] = useState<string>(initial.size === null ? "any" : String(initial.size));
  const hotel = dealType === "HOTEL_ROOM";
  const sizes: readonly string[] = hotel ? GUIDE_GUEST_OPTIONS : GUIDE_SIZE_OPTIONS;
  const sizeLabel = (value: string) => (value === "any" ? t("any") : value === "5" ? t("plus") : value === "0" ? t("studio") : value);

  const changeDeal = (next: DealType) => {
    setDeal(next);
    const allowed = PROPERTY_TYPES_BY_DEAL[next];
    if (!allowed.includes(propertyType)) setType(allowed[0]);
    const nextSizes: readonly string[] = next === "HOTEL_ROOM" ? GUIDE_GUEST_OPTIONS : GUIDE_SIZE_OPTIONS;
    if (!nextSizes.includes(size)) setSize("any");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!citySlug) return;
    start(() =>
      router.push(
        guidePageHref({ mode: "custom", citySlug, dealType, propertyType, size: size === "any" ? null : Number(size) }),
      ),
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="guide-city" className="text-sm font-medium">
            {t("city")}
          </Label>
          <Select value={citySlug || undefined} onValueChange={setCity}>
            <SelectTrigger id="guide-city" className={triggerClass} aria-required>
              <SelectValue placeholder={t("cityPlaceholder")} />
            </SelectTrigger>
            <SelectContent position="popper">
              {cities.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="guide-deal" className="text-sm font-medium">
            {t("deal")}
          </Label>
          <Select value={dealType} onValueChange={(v) => changeDeal(v as DealType)}>
            <SelectTrigger id="guide-deal" className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {DEAL_TYPES.map((d) => (
                <SelectItem key={d} value={d}>
                  {tf(`dealType.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="guide-type" className="text-sm font-medium">
            {t("property")}
          </Label>
          <Select value={propertyType} onValueChange={(v) => setType(v as PropertyType)}>
            <SelectTrigger id="guide-type" className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {PROPERTY_TYPES_BY_DEAL[dealType].map((p) => (
                <SelectItem key={p} value={p}>
                  {tf(`propertyType.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="guide-size" className="text-sm font-medium">
            {hotel ? t("guests") : t("bedrooms")}
          </Label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger id="guide-size" className={triggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {sizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {sizeLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-5" disabled={!citySlug || pending}>
          <SearchIcon aria-hidden />
          {pending ? t("loading") : t("show")}
        </Button>
        {!citySlug ? <p className="text-sm text-muted-foreground">{t("pickCity")}</p> : null}
      </div>
    </form>
  );
}
