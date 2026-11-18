"use client";

import { useTranslations } from "next-intl";
import { ArrowUpDownIcon, EyeOffIcon, FileLockIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/wizard/schemas";
import { applies } from "@/lib/wizard/steps";
import { ChoiceCards, Field, NumberInput, Section, YesNo } from "../fields";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/**
 * "הבניין" (brief 5.7): floor, floors in the building, year built, new or old, elevator, and the
 * private cadastral code (only used to check ownership, never shown). All optional.
 */
export function BuildingStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.details");
  const tStep = useTranslations("wizard.building");
  const label = useOptionLabel();
  const currentYear = new Date().getFullYear();

  return (
    <div className="grid gap-6">
      <Section>
        <div className="grid gap-4 sm:grid-cols-3">
          {applies("floor", kind) && (
            <Field label={t("floor")} error={errors.floor} optional description={t("floorHelp")}>
              {(props) => <NumberInput {...props} value={values.floor} onChange={(floor) => set({ floor })} />}
            </Field>
          )}
          <Field label={t("totalFloors")} error={errors.totalFloors} optional>
            {(props) => <NumberInput {...props} value={values.totalFloors} onChange={(totalFloors) => set({ totalFloors })} />}
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
        {applies("elevator", kind) && (
          <YesNo legend={t("elevator")} icon={ArrowUpDownIcon} value={values.elevator} onChange={(elevator) => set({ elevator })} />
        )}
        <ChoiceCards
          legend={t("buildingAge")}
          name="buildingAge"
          value={values.buildingAge}
          onChange={(buildingAge) => set({ buildingAge })}
          size="md"
          columns="grid-cols-1 min-[420px]:grid-cols-2"
          options={(["NEW", "OLD"] as const).map((age) => ({
            value: age,
            title: label("buildingAge", age),
            description: t(`buildingAgeHelp.${age}`),
          }))}
        />
      </Section>

      {/* The cadastral code stays private: it only helps us check that the place is yours. */}
      <Section title={tStep("privateTitle")} description={t("cadastralHelp")} icon={FileLockIcon}>
        <Field
          label={t("cadastral")}
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
    </div>
  );
}
