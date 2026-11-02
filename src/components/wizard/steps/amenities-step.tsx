"use client";

import { useTranslations } from "next-intl";
import { ClockIcon, ListChecksIcon, PartyPopperIcon, PawPrintIcon, CigaretteIcon, MoonIcon } from "lucide-react";
import { AMENITIES } from "@/lib/listing/fields";
import { applies } from "@/lib/wizard/steps";
import { CheckCards, Field, Section, TimeInput, YesNo } from "../fields";
import { AMENITY_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Step 5 — amenities checklist and house rules. */
export function AmenitiesStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.amenities");
  const label = useOptionLabel();

  return (
    <div className="grid gap-6">
      <Section>
        <CheckCards
          legend={t("legend")}
          description={t("legendHelp")}
          values={values.amenities}
          onChange={(amenities) => set({ amenities })}
          layout="tiles"
          options={AMENITIES.map((a) => ({ value: a, label: label("amenity", a), icon: AMENITY_ICONS[a] }))}
        />
      </Section>

      {applies("houseRules", kind) && (
        <Section title={t("rulesTitle")} description={t("rulesDescription")} icon={ListChecksIcon}>
          <div className="grid gap-3 sm:grid-cols-2">
            <YesNo
              legend={t("pets")}
              icon={PawPrintIcon}
              value={values.petsAllowed}
              onChange={(petsAllowed) => set({ petsAllowed })}
            />
            <YesNo
              legend={t("smoking")}
              icon={CigaretteIcon}
              value={values.smokingAllowed}
              onChange={(smokingAllowed) => set({ smokingAllowed })}
            />
            {applies("partiesAllowed", kind) && (
              <YesNo
                legend={t("parties")}
                icon={PartyPopperIcon}
                value={values.partiesAllowed}
                onChange={(partiesAllowed) => set({ partiesAllowed })}
              />
            )}
          </div>

          {applies("checkInOut", kind) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("checkIn")} error={errors.checkInFrom} optional>
                {(props) => (
                  <TimeInput {...props} value={values.checkInFrom} onChange={(checkInFrom) => set({ checkInFrom })} />
                )}
              </Field>
              <Field label={t("checkOut")} error={errors.checkOutUntil} optional>
                {(props) => (
                  <TimeInput {...props} value={values.checkOutUntil} onChange={(checkOutUntil) => set({ checkOutUntil })} />
                )}
              </Field>
            </div>
          )}

          <fieldset className="grid gap-3">
            <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
              <MoonIcon className="size-4 text-muted-foreground" aria-hidden />
              {t("quietHours")}
              <span className="text-xs font-normal text-muted-foreground">{t("optional")}</span>
            </legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("quietFrom")} error={errors.quietHoursFrom}>
                {(props) => (
                  <TimeInput {...props} value={values.quietHoursFrom} onChange={(quietHoursFrom) => set({ quietHoursFrom })} />
                )}
              </Field>
              <Field label={t("quietTo")} error={errors.quietHoursTo}>
                {(props) => (
                  <TimeInput {...props} value={values.quietHoursTo} onChange={(quietHoursTo) => set({ quietHoursTo })} />
                )}
              </Field>
            </div>
          </fieldset>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ClockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("timesHelp")}
          </p>
        </Section>
      )}
    </div>
  );
}
