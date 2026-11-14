"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { stripTitleEmoji } from "@/lib/text/emoji";
import { LIMITS } from "@/lib/wizard/schemas";
import { CharCount, Field, Section } from "../fields";
import type { StepProps } from "../step-props";

/** "כותרת ותיאור" (brief 5.7): the language the owner writes in, the title and the description (required). */
export function TextStep({ values, set, errors }: StepProps) {
  const t = useTranslations("wizard.details");
  // Brief 2.4: titles are saved without emoji (the server strips them too); say so when it happens.
  const [emojiRemoved, setEmojiRemoved] = useState(false);
  const stripEmoji = () => {
    const clean = stripTitleEmoji(values.title);
    if (clean === values.title) return;
    set({ title: clean });
    setEmojiRemoved(true);
  };

  return (
    <Section>
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
          <>
            <Input
              {...props}
              dir="auto"
              lang={values.originalLocale}
              value={values.title}
              maxLength={LIMITS.titleMax}
              placeholder={t("titlePlaceholder")}
              onChange={(e) => set({ title: e.target.value })}
              onBlur={stripEmoji}
              className="h-11 text-base"
            />
            <p role="status" className="text-sm text-pretty text-muted-foreground empty:hidden">
              {emojiRemoved ? t("titleEmojiRemoved") : null}
            </p>
          </>
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
            className="min-h-44 text-base leading-relaxed"
          />
        )}
      </Field>
    </Section>
  );
}
