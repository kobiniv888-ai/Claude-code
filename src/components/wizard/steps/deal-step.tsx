"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import type { DealType } from "@/generated/prisma/enums";
import { DEAL_TYPES } from "@/lib/listing/fields";
import { cn } from "@/lib/utils";
import { FieldError } from "../fields";
import { DEAL_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** Soft illustration colors per deal type (brand tokens only). */
const TONES: Record<DealType, string> = {
  SHORT_STAY: "from-primary/15 via-primary/5 to-transparent text-primary",
  MONTHLY_RENT: "from-verified/15 via-verified/5 to-transparent text-verified",
  SALE: "from-terracotta/20 via-terracotta/5 to-transparent text-terracotta",
  HOTEL_ROOM: "from-wine/15 via-wine/5 to-transparent text-wine dark:text-accent-foreground",
};

/** Step 1 — short stay, monthly rent, sale, or hotel/guesthouse room: big illustrated cards. */
export function DealStep({ values, set, errors, chosen, setChosen, context }: StepProps) {
  const t = useTranslations("wizard.deal");
  const label = useOptionLabel();
  const selected = chosen.deal ? values.dealType : null;
  const error = errors.dealType;

  return (
    <fieldset className="grid gap-4" aria-describedby={error ? "deal-error" : undefined}>
      <legend className="sr-only">{t("legend")}</legend>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {DEAL_TYPES.map((deal) => {
          const Icon = DEAL_ICONS[deal];
          const checked = selected === deal;
          return (
            <label
              key={deal}
              className={cn(
                "group relative isolate flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card text-start transition-all",
                "hover:-translate-y-0.5 hover:shadow-card-hover has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary shadow-card ring-2 ring-primary" : "border-border shadow-card",
              )}
            >
              <input
                type="radio"
                name="dealType"
                value={deal}
                checked={checked}
                onChange={() => {
                  setChosen({ deal: true });
                  set({ dealType: deal });
                }}
                className="sr-only"
              />
              <div
                aria-hidden
                className={cn("relative flex h-24 items-center bg-gradient-to-br px-5 sm:h-32", TONES[deal])}
              >
                <span className="absolute -end-6 -bottom-8 size-28 rounded-full bg-current opacity-[0.07] sm:size-36" />
                <span className="absolute end-14 -top-6 size-16 rounded-full bg-current opacity-[0.05]" />
                <span className="flex size-14 items-center justify-center rounded-2xl bg-card shadow-card sm:size-16">
                  <Icon className="size-7 sm:size-8" />
                </span>
              </div>
              <div className="grid gap-1 p-4 sm:p-5">
                <span className="text-lg font-semibold">{label("dealType", deal)}</span>
                <span className="text-sm text-pretty text-muted-foreground">{t(`descriptions.${deal}`)}</span>
              </div>
              <span
                aria-hidden
                className={cn(
                  "absolute end-3 top-3 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-card bg-card/80",
                )}
              >
                {checked && <CheckIcon className="size-4" />}
              </span>
            </label>
          );
        })}
      </div>
      {error && <FieldError id="deal-error">{error}</FieldError>}
      {context.mode === "edit" && <p className="text-sm text-muted-foreground">{t("editNote")}</p>}
    </fieldset>
  );
}
