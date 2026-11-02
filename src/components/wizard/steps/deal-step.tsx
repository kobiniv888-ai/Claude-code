"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { PhotoSlotKey } from "@/config/photos";
import type { DealType } from "@/generated/prisma/enums";
import { DEAL_TYPES } from "@/lib/listing/fields";
import { cn } from "@/lib/utils";
import { FieldError } from "../fields";
import { DEAL_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

/** A real photo per deal type (the home page's category photos, @/config/photos). */
const PHOTOS: Record<DealType, PhotoSlotKey> = {
  SHORT_STAY: "category.apartments",
  MONTHLY_RENT: "category.rooms",
  SALE: "category.sale",
  HOTEL_ROOM: "category.hotels",
};

/** Step 1 — short stay, monthly rent, sale, or hotel/guesthouse room: four big photo tiles. */
export function DealStep({ values, set, errors, chosen, setChosen, context }: StepProps) {
  const t = useTranslations("wizard.deal");
  const label = useOptionLabel();
  const selected = chosen.deal ? values.dealType : null;
  const error = errors.dealType;

  return (
    <fieldset className="grid gap-4" aria-describedby={error ? "deal-error" : undefined}>
      <legend className="sr-only">{t("legend")}</legend>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {DEAL_TYPES.map((deal) => {
          const Icon = DEAL_ICONS[deal];
          const checked = selected === deal;
          return (
            <label
              key={deal}
              className={cn(
                "group relative isolate flex cursor-pointer flex-col overflow-hidden rounded-card border-2 bg-card text-start shadow-card",
                "transition-[border-color,transform] duration-(--motion-fast) ease-standard active:scale-[0.98] motion-reduce:active:scale-100",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "border-primary" : "border-transparent hover:border-primary/30",
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
              <div className="relative aspect-[4/3] overflow-hidden bg-muted sm:aspect-[16/9]">
                <PhotoSlot
                  slot={PHOTOS[deal]}
                  alt=""
                  sizes="(min-width: 768px) 360px, 46vw"
                  className="size-full transition-transform duration-500 ease-soft group-hover:scale-105 motion-reduce:transition-none"
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute start-2.5 bottom-2.5 flex size-10 items-center justify-center rounded-full shadow-sm transition-colors sm:size-11",
                    checked ? "bg-primary text-primary-foreground" : "bg-card/95 text-primary-text",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "absolute end-2.5 top-2.5 flex size-7 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
                    checked ? "border-white bg-primary text-primary-foreground" : "border-white/90 bg-black/20",
                  )}
                >
                  {checked && <CheckIcon className="size-4" strokeWidth={3} />}
                </span>
              </div>
              <div className={cn("grid gap-0.5 p-3 transition-colors sm:p-4", checked && "bg-primary-tint/50")}>
                <span className="text-body leading-snug font-bold">{label("dealType", deal)}</span>
                <span className="text-caption text-pretty text-muted-foreground sm:text-small">{t(`descriptions.${deal}`)}</span>
              </div>
            </label>
          );
        })}
      </div>
      {error && <FieldError id="deal-error">{error}</FieldError>}
      {context.mode === "edit" && <p className="text-small text-muted-foreground">{t("editNote")}</p>}
    </fieldset>
  );
}
