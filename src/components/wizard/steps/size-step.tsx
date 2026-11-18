"use client";

import { useTranslations } from "next-intl";
import { BathIcon, BedDoubleIcon, BedSingleIcon, DoorOpenIcon, SofaIcon, UsersIcon } from "lucide-react";
import { SHARED_ROOM_FOR } from "@/lib/listing/fields";
import { applies, usesBookingStep } from "@/lib/wizard/steps";
import { ChoiceCards, Field, FieldGroup, NumberInput, Section, Stepper } from "../fields";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/**
 * "גודל וחדרים" (brief 5.7): rooms, beds, size and, for a room in a shared flat, who shares it.
 * Required only where it matters: rooms for rentals and sales, the size of a home for sale.
 * Short stays and hotels set their maximum guests in "הזמנות ומחיר".
 */
export function SizeStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.details");
  const label = useOptionLabel();
  const show = (field: Parameters<typeof applies>[0]) => applies(field, kind);
  const askGuests = show("maxGuests") && !usesBookingStep(kind);

  return (
    <div className="grid gap-6">
      <Section>
        {(show("rooms") || show("bedrooms") || show("bathrooms") || askGuests) && (
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
            {askGuests && (
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
        )}

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
              <NumberInput {...props} decimals value={values.sizeSqm} onChange={(sizeSqm) => set({ sizeSqm })} suffix={t("sqm")} />
            )}
          </Field>
        )}
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
    </div>
  );
}
