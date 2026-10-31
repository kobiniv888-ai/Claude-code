"use client";

import { useTranslations } from "next-intl";
import {
  BathIcon,
  BedDoubleIcon,
  BedSingleIcon,
  BuildingIcon,
  DoorOpenIcon,
  EyeOffIcon,
  FileTextIcon,
  HammerIcon,
  ArrowUpDownIcon,
  SofaIcon,
  UsersIcon,
  VideoIcon,
  LayoutGridIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { CONDITIONS, HEATING_TYPES, SHARED_ROOM_FOR, VIEW_TYPES } from "@/lib/listing/fields";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/wizard/schemas";
import { applies } from "@/lib/wizard/steps";
import { CharCount, CheckCards, ChoiceCards, Field, FieldGroup, NumberInput, Section, Stepper, YesNo } from "../fields";
import { HEATING_ICONS, VIEW_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Step 4 — basics, Georgian market details, title and description, video and 3D tour. */
export function DetailsStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.details");
  const label = useOptionLabel();
  const show = (field: Parameters<typeof applies>[0]) => applies(field, kind);
  const currentYear = new Date().getFullYear();

  return (
    <div className="grid gap-6">
      {/* Size and rooms */}
      {(show("rooms") || show("beds") || show("maxGuests") || show("sizeSqm")) && (
        <Section title={t("sizeTitle")} icon={LayoutGridIcon}>
          <div className="grid gap-3 sm:grid-cols-2">
            {show("rooms") && (
              <Stepper
                label={t("rooms")}
                icon={DoorOpenIcon}
                value={values.rooms}
                onChange={(rooms) => set({ rooms })}
                step={0.5}
                min={0}
                max={50}
                error={errors.rooms}
                description={t("roomsHelp")}
                optional={kind.dealType === "SHORT_STAY"}
              />
            )}
            {show("bedrooms") && (
              <Stepper
                label={t("bedrooms")}
                icon={BedDoubleIcon}
                value={values.bedrooms}
                onChange={(bedrooms) => set({ bedrooms })}
                max={50}
                error={errors.bedrooms}
                optional
              />
            )}
            {show("bathrooms") && (
              <Stepper
                label={t("bathrooms")}
                icon={BathIcon}
                value={values.bathrooms}
                onChange={(bathrooms) => set({ bathrooms })}
                step={0.5}
                max={30}
                error={errors.bathrooms}
                optional
              />
            )}
            {show("maxGuests") && (
              <Stepper
                label={kind.dealType === "MONTHLY_RENT" ? t("maxTenants") : t("maxGuests")}
                icon={UsersIcon}
                value={values.maxGuests}
                onChange={(maxGuests) => set({ maxGuests })}
                min={1}
                max={100}
                error={errors.maxGuests}
                optional={kind.dealType !== "SHORT_STAY"}
              />
            )}
          </div>

          {show("beds") && (
            <FieldGroup legend={t("bedsTitle")} optional>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stepper
                  label={t("bedsSingle")}
                  icon={BedSingleIcon}
                  value={values.bedsSingle}
                  onChange={(bedsSingle) => set({ bedsSingle })}
                  error={errors.bedsSingle}
                />
                <Stepper
                  label={t("bedsDouble")}
                  icon={BedDoubleIcon}
                  value={values.bedsDouble}
                  onChange={(bedsDouble) => set({ bedsDouble })}
                  error={errors.bedsDouble}
                />
                <Stepper
                  label={t("bedsSofa")}
                  icon={SofaIcon}
                  value={values.bedsSofa}
                  onChange={(bedsSofa) => set({ bedsSofa })}
                  error={errors.bedsSofa}
                />
              </div>
            </FieldGroup>
          )}

          {show("sizeSqm") && (
            <Field label={t("size")} error={errors.sizeSqm} optional={kind.dealType !== "SALE"} className="sm:max-w-xs">
              {(props) => (
                <NumberInput
                  {...props}
                  decimals
                  value={values.sizeSqm}
                  onChange={(sizeSqm) => set({ sizeSqm })}
                  suffix={t("sqm")}
                />
              )}
            </Field>
          )}
        </Section>
      )}

      {/* Building */}
      <Section title={t("buildingTitle")} icon={BuildingIcon}>
        <div className="grid gap-4 sm:grid-cols-3">
          {show("floor") && (
            <Field label={t("floor")} error={errors.floor} optional description={t("floorHelp")}>
              {(props) => <NumberInput {...props} value={values.floor} onChange={(floor) => set({ floor })} />}
            </Field>
          )}
          <Field label={t("totalFloors")} error={errors.totalFloors} optional>
            {(props) => (
              <NumberInput {...props} value={values.totalFloors} onChange={(totalFloors) => set({ totalFloors })} />
            )}
          </Field>
          <Field label={t("yearBuilt")} error={errors.yearBuilt} optional>
            {(props) => (
              <NumberInput
                {...props}
                value={values.yearBuilt}
                onChange={(yearBuilt) => set({ yearBuilt })}
                placeholder={String(currentYear - 5)}
                maxLength={4}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {show("elevator") && (
            <YesNo
              legend={t("elevator")}
              icon={ArrowUpDownIcon}
              value={values.elevator}
              onChange={(elevator) => set({ elevator })}
            />
          )}
          {show("furnished") && (
            <YesNo
              legend={t("furnished")}
              icon={SofaIcon}
              value={values.furnished}
              onChange={(furnished) => set({ furnished })}
            />
          )}
        </div>
        <ChoiceCards
          legend={t("buildingAge")}
          name="buildingAge"
          value={values.buildingAge}
          onChange={(buildingAge) => set({ buildingAge })}
          size="md"
          columns="grid-cols-2"
          options={(["NEW", "OLD"] as const).map((age) => ({
            value: age,
            title: label("buildingAge", age),
            description: t(`buildingAgeHelp.${age}`),
          }))}
        />
      </Section>

      {/* Georgian market details */}
      <Section title={t("marketTitle")} description={t("marketDescription")} icon={HammerIcon}>
        {show("condition") && (
          <ChoiceCards
            legend={t("condition")}
            name="condition"
            value={values.condition}
            onChange={(condition) => set({ condition })}
            size="md"
            columns="grid-cols-1 sm:grid-cols-2"
            error={errors.condition}
            options={CONDITIONS.map((condition) => ({
              value: condition,
              title: label("condition", condition),
              description: t(`conditionHelp.${condition}`),
            }))}
          />
        )}
        <CheckCards
          legend={t("heating")}
          optional
          values={values.heating}
          onChange={(heating) => set({ heating })}
          columns="grid-cols-1 sm:grid-cols-2"
          options={HEATING_TYPES.map((h) => ({ value: h, label: label("heating", h), icon: HEATING_ICONS[h] }))}
        />
        <CheckCards
          legend={t("views")}
          optional
          values={values.views}
          onChange={(views) => set({ views })}
          columns="grid-cols-1 sm:grid-cols-3"
          options={VIEW_TYPES.map((v) => ({ value: v, label: label("view", v), icon: VIEW_ICONS[v] }))}
        />
        <Field
          label={t("cadastral")}
          description={t("cadastralHelp")}
          error={errors.cadastralCode}
          optional
          labelAddon={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3.5" aria-hidden />
              {t("private")}
            </span>
          }
        >
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              inputMode="numeric"
              value={values.cadastralCode}
              maxLength={LIMITS.cadastralMax}
              placeholder="01.10.13.023.045"
              onChange={(e) => set({ cadastralCode: e.target.value })}
              className="h-11 text-base tabular-nums sm:max-w-sm"
            />
          )}
        </Field>
      </Section>

      {show("sharedRoomFor") && (
        <Section title={t("sharedTitle")} description={t("sharedDescription")} icon={UsersIcon}>
          <ChoiceCards
            legend={t("sharedLegend")}
            legendHidden
            name="sharedRoomFor"
            value={values.sharedRoomFor}
            onChange={(sharedRoomFor) => set({ sharedRoomFor })}
            size="md"
            columns="grid-cols-1 sm:grid-cols-3"
            error={errors.sharedRoomFor}
            options={SHARED_ROOM_FOR.map((s) => ({ value: s, title: label("sharedRoomFor", s) }))}
          />
        </Section>
      )}

      {/* Title and description */}
      <Section title={t("textTitle")} description={t("textDescription")} icon={FileTextIcon}>
        <Field label={t("writingIn")} description={t("writingInHelp")} className="sm:max-w-xs">
          {(props) => (
            <Select value={values.originalLocale} onValueChange={(v) => set({ originalLocale: v as AppLocale })}>
              <SelectTrigger {...props} className="h-11 w-full bg-card text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {locales.map((l) => (
                  <SelectItem key={l} value={l} lang={l}>
                    {siteConfig.i18n.nativeNames[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field
          label={t("titleLabel")}
          error={errors.title}
          description={t("titleHelp")}
          labelAddon={<CharCount value={values.title} max={LIMITS.titleMax} />}
        >
          {(props) => (
            <Input
              {...props}
              dir="auto"
              lang={values.originalLocale}
              value={values.title}
              maxLength={LIMITS.titleMax}
              placeholder={t("titlePlaceholder")}
              onChange={(e) => set({ title: e.target.value })}
              className="h-11 text-base"
            />
          )}
        </Field>
        <Field
          label={t("descriptionLabel")}
          error={errors.description}
          description={t("descriptionHelp")}
          labelAddon={<CharCount value={values.description} max={LIMITS.descriptionMax} />}
        >
          {(props) => (
            <Textarea
              {...props}
              dir="auto"
              lang={values.originalLocale}
              value={values.description}
              maxLength={LIMITS.descriptionMax}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => set({ description: e.target.value })}
              className={cn("min-h-44 text-base leading-relaxed")}
            />
          )}
        </Field>
      </Section>

      {/* Video and 3D tour */}
      <Section title={t("mediaTitle")} icon={VideoIcon}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("videoUrl")} description={t("videoUrlHelp")} error={errors.videoUrl} optional>
            {(props) => (
              <Input
                {...props}
                type="url"
                dir="ltr"
                inputMode="url"
                value={values.videoUrl}
                maxLength={LIMITS.urlMax}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => set({ videoUrl: e.target.value })}
                className="h-11 text-base"
              />
            )}
          </Field>
          <Field label={t("tourUrl")} description={t("tourUrlHelp")} error={errors.tour360Url} optional>
            {(props) => (
              <Input
                {...props}
                type="url"
                dir="ltr"
                inputMode="url"
                value={values.tour360Url}
                maxLength={LIMITS.urlMax}
                placeholder="https://"
                onChange={(e) => set({ tour360Url: e.target.value })}
                className="h-11 text-base"
              />
            )}
          </Field>
        </div>
      </Section>
    </div>
  );
}
