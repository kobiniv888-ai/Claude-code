"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FlameIcon, HammerIcon, MountainIcon, SofaIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import { CONDITIONS, HEATING_TYPES, VIEW_TYPES } from "@/lib/listing/fields";
import { LIMITS } from "@/lib/wizard/schemas";
import { applies } from "@/lib/wizard/steps";
import { CheckCards, ChoiceCards, Field, Section, YesNo } from "../fields";
import { HEATING_ICONS, VIEW_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

type GroupKey = "condition" | "heating" | "views" | "media";

/** Which fields live in which folded group (a group with an error opens by itself). */
const GROUP_FIELDS: Record<GroupKey, string[]> = {
  condition: ["condition", "furnished"],
  heating: ["heating"],
  views: ["views"],
  media: ["videoUrl", "tour360Url"],
};

function GroupTrigger({ icon: Icon, title, summary }: { icon: LucideIcon; title: string; summary: ReactNode }) {
  return (
    <AccordionTrigger className="min-h-14 py-2.5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-body font-semibold text-pretty">{title}</span>
          <span className="text-small font-normal text-pretty text-muted-foreground">{summary}</span>
        </span>
      </span>
    </AccordionTrigger>
  );
}

/**
 * "מצב ומאפיינים" (brief 5.7): everything here is optional, so each group starts folded and its
 * row says what is chosen. The Georgian condition terms (black, white and green frame) stay, for
 * rentals and sales.
 */
export function FeaturesStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.details");
  const tStep = useTranslations("wizard.features");
  const locale = useLocale();
  const label = useOptionLabel();
  const [open, setOpen] = useState<string[]>([]);

  const groups: GroupKey[] = [
    ...(applies("condition", kind) || applies("furnished", kind) ? (["condition"] as const) : []),
    "heating",
    "views",
    "media",
  ];
  // A group with a problem (e.g. a video link that is not YouTube/Vimeo) stays open.
  const withErrors = groups.filter((g) => GROUP_FIELDS[g].some((field) => errors[field]));
  const value = [...new Set([...open, ...withErrors])];

  const selected = (count: number) =>
    count === 0 ? tStep("notSet") : tStep("selectedCount", { count, countText: formatNumber(count, locale) });
  const conditionSummary = [
    values.condition ? label("condition", values.condition) : null,
    values.furnished === null ? null : values.furnished ? t("furnished") : tStep("unfurnished"),
  ]
    .filter(Boolean)
    .join(" · ");
  const mediaCount = (values.videoUrl.trim() ? 1 : 0) + (values.tour360Url.trim() ? 1 : 0);

  return (
    <Section>
      <Accordion type="multiple" value={value} onValueChange={setOpen}>
        {groups.includes("condition") && (
          <AccordionItem value="condition">
            <GroupTrigger icon={HammerIcon} title={t("condition")} summary={conditionSummary || tStep("notSet")} />
            <AccordionContent className="grid gap-4 pt-2">
              {applies("condition", kind) && (
                <ChoiceCards
                  legend={t("condition")}
                  legendHidden
                  description={t("marketDescription")}
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
              {applies("furnished", kind) && (
                <YesNo legend={t("furnished")} icon={SofaIcon} value={values.furnished} onChange={(furnished) => set({ furnished })} />
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="heating">
          <GroupTrigger icon={FlameIcon} title={t("heating")} summary={selected(values.heating.length)} />
          <AccordionContent className="pt-2">
            <CheckCards
              legend={t("heating")}
              legendHidden
              values={values.heating}
              onChange={(heating) => set({ heating })}
              columns="grid-cols-1 sm:grid-cols-2"
              options={HEATING_TYPES.map((h) => ({ value: h, label: label("heating", h), icon: HEATING_ICONS[h] }))}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="views">
          <GroupTrigger icon={MountainIcon} title={t("views")} summary={selected(values.views.length)} />
          <AccordionContent className="pt-2">
            <CheckCards
              legend={t("views")}
              legendHidden
              values={values.views}
              onChange={(views) => set({ views })}
              columns="grid-cols-1 sm:grid-cols-3"
              options={VIEW_TYPES.map((v) => ({ value: v, label: label("view", v), icon: VIEW_ICONS[v] }))}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="media">
          <GroupTrigger icon={VideoIcon} title={t("mediaTitle")} summary={mediaCount > 0 ? selected(mediaCount) : tStep("notSet")} />
          <AccordionContent className="grid gap-4 pt-2 sm:grid-cols-2">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Section>
  );
}
