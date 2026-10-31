"use client";

import { useTranslations } from "next-intl";
import { BriefcaseBusinessIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BUSINESS_PROPERTY_TYPES, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import { LIMITS } from "@/lib/wizard/schemas";
import { ChoiceCards, Field } from "../fields";
import { PROPERTY_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Step 2 — property type (filtered by deal type) and, for hotels, the business name. */
export function PropertyStep({ values, set, errors, chosen, setChosen, context }: StepProps) {
  const t = useTranslations("wizard.property");
  const label = useOptionLabel();
  const options = PROPERTY_TYPES_BY_DEAL[values.dealType].map((type) => ({
    value: type,
    title: label("propertyType", type),
    description: t(`descriptions.${type}`),
    icon: PROPERTY_ICONS[type],
  }));
  const selected = chosen.property ? values.propertyType : null;
  const isBusinessType = selected !== null && BUSINESS_PROPERTY_TYPES.includes(selected);
  const isPrivate = context.user.accountType === "PRIVATE";

  return (
    <div className="grid gap-6">
      <ChoiceCards
        legend={t("legend")}
        legendHidden
        name="propertyType"
        value={selected}
        options={options}
        onChange={(propertyType) => {
          setChosen({ property: true });
          set({ propertyType });
        }}
        error={errors.propertyType}
        columns="grid-cols-1 sm:grid-cols-2"
        size="md"
      />

      {isBusinessType && (
        <section className="grid gap-4 rounded-2xl border border-primary/20 bg-secondary/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BriefcaseBusinessIcon className="size-5" aria-hidden />
            </span>
            <div className="grid gap-1">
              <h3 className="font-semibold">{isPrivate ? t("business.title") : t("business.titleExisting")}</h3>
              <p className="text-sm text-pretty text-muted-foreground">
                {isPrivate ? t("business.description") : t("business.descriptionExisting")}
              </p>
            </div>
          </div>
          <Field
            label={t("business.nameLabel")}
            description={t("business.nameHelp")}
            error={errors.businessName}
            optional
          >
            {(props) => (
              <Input
                {...props}
                dir="auto"
                value={values.businessName}
                maxLength={LIMITS.businessNameMax}
                autoComplete="organization"
                onChange={(e) => set({ businessName: e.target.value })}
                className="h-11 bg-card text-base"
              />
            )}
          </Field>
        </section>
      )}
    </div>
  );
}
