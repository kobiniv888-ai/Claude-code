"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  EyeIcon,
  LanguagesIcon,
  LoaderCircleIcon,
  MoonStarIcon,
  PencilIcon,
  RocketIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatArea, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { acceptRulesAndPublish, generateTranslations, saveTranslations } from "@/lib/wizard/actions";
import { missingRequirements, type MissingRequirement } from "@/lib/wizard/requirements";
import { LIMITS } from "@/lib/wizard/schemas";
import { isBusinessListing, stepsFor } from "@/lib/wizard/steps";
import type { WizardTranslation } from "@/lib/wizard/types";
import { CharCount, Section } from "../fields";
import { CHANNEL_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import { displayPrice, PreviewCard } from "../preview-card";
import type { StepProps } from "../step-props";
import { scrollBehavior } from "@/lib/motion";

function MissingList({
  missing,
  goTo,
  stepNumber,
  verifyHref,
}: {
  missing: MissingRequirement[];
  goTo: StepProps["goTo"];
  stepNumber: (step: NonNullable<MissingRequirement["step"]>) => number;
  verifyHref: string;
}) {
  const t = useTranslations("wizard.publish");
  const tSteps = useTranslations("wizard.steps");
  return (
    <section className="grid gap-3 rounded-2xl border border-border-strong/40 bg-surface-muted p-4 sm:p-5 dark:bg-surface-muted/10" aria-labelledby="missing-title">
      <h3 id="missing-title" tabIndex={-1} className="flex items-center gap-2 font-semibold outline-none">
        <CircleAlertIcon className="size-5 text-foreground" aria-hidden />
        {t("missingTitle")}
      </h3>
      <ul className="grid gap-2">
        {missing.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 text-sm shadow-sm">
            <span>{t(`missing.${item.key}`, { count: siteConfig.listings.minPhotos })}</span>
            {item.step ? (
              <Button type="button" size="sm" variant="outline" onClick={() => goTo(item.step!)} className="h-auto min-h-8 max-w-full py-1 whitespace-normal">
                {t("goToStep", { step: stepNumber(item.step), name: tSteps(item.step) })}
                <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={verifyHref}>
                  {t("verifyPhone")}
                  <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Summary of what the listing page will show. */
function PageSummary({ values, context, goTo }: Pick<StepProps, "values" | "context" | "goTo">) {
  const t = useTranslations("wizard.publish");
  const locale = useLocale();
  const label = useOptionLabel();
  const facts: { key: string; value: string }[] = [];
  if (values.rooms !== null) facts.push({ key: t("facts.rooms"), value: formatNumber(values.rooms, locale) });
  if (values.bedrooms !== null) facts.push({ key: t("facts.bedrooms"), value: formatNumber(values.bedrooms, locale) });
  if (values.bathrooms !== null) facts.push({ key: t("facts.bathrooms"), value: formatNumber(values.bathrooms, locale) });
  if (values.maxGuests !== null) facts.push({ key: t("facts.guests"), value: formatNumber(values.maxGuests, locale) });
  if (values.sizeSqm !== null) facts.push({ key: t("facts.size"), value: formatArea(values.sizeSqm, locale) });
  if (values.floor !== null)
    facts.push({
      key: t("facts.floor"),
      value: values.totalFloors !== null ? t("facts.floorOf", { floor: values.floor, total: values.totalFloors }) : formatNumber(values.floor, locale),
    });
  if (values.condition) facts.push({ key: t("facts.condition"), value: label("condition", values.condition) });
  if (values.kitchenKosher) facts.push({ key: t("facts.kitchen"), value: label("kitchen", values.kitchenKosher) });
  if (values.deposit !== null) facts.push({ key: t("facts.deposit"), value: formatMoney(values.deposit, values.currency, locale) });
  if (values.cleaningFee !== null)
    facts.push({ key: t("facts.cleaningFee"), value: formatMoney(values.cleaningFee, values.currency, locale) });
  if (values.minStayNights !== null) facts.push({ key: t("facts.minStay"), value: t("facts.nights", { count: values.minStayNights }) });

  const chips = [
    ...values.amenities.map((a) => label("amenity", a)),
    ...values.shabbatFeatures.map((f) => label("shabbat", f)),
    ...values.jewishFeatures.map((f) => label("jewish", f)),
    ...values.hotelJewishFeatures.map((f) => label("hotelJewish", f)),
  ];
  const city = context.cities.find((c) => c.id === values.cityId);

  return (
    <div className="grid content-start gap-5">
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.key} className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{fact.key}</dt>
              <dd className="text-sm font-medium">
                <bdi>{fact.value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {chip}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        <h4 className="text-sm font-semibold">{t("contactTitle")}</h4>
        {values.contactMethods.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {values.contactMethods.map((m) => {
              const Icon = CHANNEL_ICONS[m.channel];
              return (
                <li key={m.channel} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {label("channel", m.channel)}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noContact")}</p>
        )}
        <p className="text-xs text-muted-foreground">{t("contactHidden")}</p>
        {values.noReplyOnShabbat && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MoonStarIcon className="size-3.5" aria-hidden />
            {t("repliesAfterShabbat")}
          </p>
        )}
      </div>
      {city && (
        <p className="text-sm text-muted-foreground">
          {t("approxArea", { city: city.name, meters: siteConfig.listings.approximateLocationMeters })}{" "}
          <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={() => goTo("location")}>
            {t("edit")}
          </Button>
        </p>
      )}
    </div>
  );
}

function TranslationEditor({
  locale: target,
  listingId,
  translation,
  onSaved,
  track,
}: {
  locale: AppLocale;
  listingId: string;
  translation: WizardTranslation | undefined;
  onSaved: (translation: WizardTranslation) => void;
  track: StepProps["track"];
}) {
  const t = useTranslations("wizard.publish");
  const tw = useTranslations("wizard");
  const [title, setTitle] = useState(translation?.title ?? "");
  const [description, setDescription] = useState(translation?.description ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = title !== (translation?.title ?? "") || description !== (translation?.description ?? "");
  const id = `tr-${target}`;

  const save = async () => {
    setSaving(true);
    const result = await track(saveTranslations(listingId, target, { title, description })).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      onSaved(result.data.translation);
      toast.success(t("translationSaved"));
    } else {
      const code = result?.error ?? "network";
      toast.error(tw.has(`errors.${code}`) ? tw(`errors.${code}`) : tw("errors.server_error"));
    }
  };

  return (
    <div className="grid gap-4" lang={target}>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-title`} className="text-sm font-medium">
            {t("trTitle")}
          </label>
          <CharCount value={title} max={LIMITS.titleMax} />
        </div>
        <Input
          id={`${id}-title`}
          dir="auto"
          value={title}
          maxLength={LIMITS.titleMax}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 text-base"
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-description`} className="text-sm font-medium">
            {t("trDescription")}
          </label>
          <CharCount value={description} max={LIMITS.descriptionMax} />
        </div>
        <Textarea
          id={`${id}-description`}
          dir="auto"
          value={description}
          maxLength={LIMITS.descriptionMax}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-36 text-base leading-relaxed"
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving || !dirty || !title.trim() || !description.trim()}>
          {saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}
          {t("trSave")}
        </Button>
      </div>
    </div>
  );
}

function TranslationsPanel({ listing, context, values, translations, setTranslations, track, goTo }: StepProps) {
  const t = useTranslations("wizard.publish");
  const tw = useTranslations("wizard");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<AppLocale>(values.originalLocale);
  const byLocale = new Map(translations.map((tr) => [tr.locale, tr]));
  const others = locales.filter((l) => l !== values.originalLocale);
  const missingCount = others.filter((l) => !byLocale.get(l)).length;
  const hasText = values.title.trim().length > 0 && values.description.trim().length > 0;

  const generate = async (force = false) => {
    setBusy(true);
    const result = await track(generateTranslations(listing.id, { force })).catch(() => null);
    setBusy(false);
    if (result?.ok) {
      setTranslations(() => result.data.translations);
      toast.success(t("translated"));
    } else {
      const code = result?.error ?? "network";
      toast.error(tw.has(`errors.${code}`) ? tw(`errors.${code}`) : tw("errors.server_error"));
    }
  };

  return (
    <Section title={t("languagesTitle")} description={context.translationEnabled ? t("languagesAuto") : t("languagesManual")} icon={LanguagesIcon}>
      {context.translationEnabled && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void generate(false)} disabled={busy || !hasText}>
            {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <SparklesIcon aria-hidden />}
            {missingCount > 0 ? t("translateAll") : t("translateAgain")}
          </Button>
          {!hasText && <p className="text-sm text-muted-foreground">{t("translateNeedsText")}</p>}
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AppLocale)} className="min-w-0 gap-4">
        {/* Five languages never fit on a phone: one row that scrolls sideways. */}
        <TabsList className="h-12 w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1 scrollbar-none">
          {locales.map((l) => {
            const tr = byLocale.get(l);
            const isOriginal = l === values.originalLocale;
            return (
              <TabsTrigger key={l} value={l} lang={l} className="h-10 flex-none gap-1.5 rounded-full px-4">
                {siteConfig.i18n.nativeNames[l]}
                {isOriginal ? (
                  <span className="text-[0.65rem] text-muted-foreground">{t("originalShort")}</span>
                ) : !tr ? (
                  <span className="size-1.5 rounded-full bg-surface-muted" role="img" aria-label={t("notTranslated")} />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {locales.map((l) => {
          const tr = byLocale.get(l);
          const isOriginal = l === values.originalLocale;
          return (
            <TabsContent key={l} value={l} className="grid gap-4">
              {isOriginal ? (
                <div className="grid gap-3 rounded-xl border border-border p-4" lang={l}>
                  <p className="text-xs font-medium text-muted-foreground">{t("originalNote")}</p>
                  <h4 className="text-lg font-semibold" dir="auto">
                    {values.title || t("untitled")}
                  </h4>
                  <p className="text-sm whitespace-pre-line text-pretty" dir="auto">
                    {values.description || t("noDescription")}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => goTo("text")}>
                    <PencilIcon aria-hidden />
                    {t("editOriginal")}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {tr
                      ? tr.editedByOwner
                        ? t("statusOwner")
                        : t("statusAuto")
                      : context.translationEnabled
                        ? t("statusMissingAuto")
                        : t("statusMissingManual", { language: siteConfig.i18n.nativeNames[values.originalLocale] })}
                  </p>
                  <TranslationEditor
                    key={`${l}-${tr?.updatedAt ?? "new"}`}
                    locale={l}
                    listingId={listing.id}
                    translation={tr}
                    track={track}
                    onSaved={(saved) => setTranslations((list) => [...list.filter((x) => x.locale !== saved.locale), saved])}
                  />
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </Section>
  );
}

/** Step 10 — preview, languages, listing rules and Publish (or "Save changes" when editing). */
export function PublishStep(props: StepProps) {
  const { listing, context, values, kind, photos, roomTypes, goTo, flush, onPublished, track, pledge } = props;
  const t = useTranslations("wizard.publish");
  const tw = useTranslations("wizard");
  const locale = useLocale();
  const [accepted, setAccepted] = useState(listing.rulesAccepted);
  const [publishing, setPublishing] = useState(false);
  const [rulesError, setRulesError] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const isEdit = context.mode === "edit";
  const steps = stepsFor(kind);
  const stepNumber = (s: NonNullable<MissingRequirement["step"]>) => steps.indexOf(s) + 1;
  const missing = missingRequirements({
    values,
    photoCount: photos.length,
    roomPhotoCount: roomTypes.reduce((n, r) => n + r.photos.length, 0),
    pricedRoomTypes: roomTypes.filter((r) => r.price > 0).length,
    phoneVerified: context.user.phoneVerified,
    pledgeAccepted: pledge.isCurrent,
  });
  const price = displayPrice(values, roomTypes);
  const verifyHref = `/verify-phone?next=${encodeURIComponent(`/post/${listing.id}?step=${steps.length}`)}`;

  const publish = async () => {
    if (!accepted) {
      setRulesError(true);
      document.getElementById("rules-checkbox")?.focus();
      return;
    }
    setPublishing(true);
    const saved = await flush();
    if (!saved) {
      setPublishing(false);
      toast.error(tw("chrome.fixErrors"));
      return;
    }
    const result = await track(acceptRulesAndPublish(listing.id, { rulesAccepted: true, turnstileToken: captchaToken })).catch(() => null);
    setPublishing(false);
    if (result?.ok) {
      onPublished(result.data);
      return;
    }
    // Turnstile tokens are single-use.
    captcha.current?.reset();
    if (!result) return;
    const code = result.error;
    toast.error(tw.has(`errors.${code}`) ? tw(`errors.${code}`) : tw("errors.server_error"));
  };

  return (
    <div className="grid gap-6">
      {missing.length > 0 && <MissingList missing={missing} goTo={goTo} stepNumber={stepNumber} verifyHref={verifyHref} />}

      <Section title={t("previewTitle")} description={t("previewDescription")} icon={EyeIcon}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
          <PreviewCard
            listingId={listing.id}
            publicId={listing.publicId}
            pledgeAccepted={pledge.isCurrent}
            values={values}
            title={values.title}
            photos={photos}
            roomTypes={roomTypes}
            cities={context.cities}
            isBusiness={isBusinessListing(kind) || context.user.accountType === "BUSINESS"}
          />
          <PageSummary values={values} context={context} goTo={goTo} />
        </div>
        {price && values.dealType === "SALE" && values.sizeSqm ? (
          <p className="text-sm text-muted-foreground">
            {t("perSqm")}{" "}
            <Ltr className="font-medium text-foreground">
              {formatMoney(price.amount / values.sizeSqm, price.currency, locale, { maximumFractionDigits: 0 })}
            </Ltr>
          </p>
        ) : null}
      </Section>

      <TranslationsPanel {...props} />

      <Section>
        <div className="flex items-start gap-3 rounded-xl bg-secondary/70 p-3.5 text-sm">
          <CalendarClockIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>{t("expiry", { days: context.listingExpiryDays })}</p>
        </div>
        {!isEdit && (
          <>
            <div className="grid gap-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  rulesError && !accepted ? "border-destructive" : "border-border",
                )}
              >
                <input
                  id="rules-checkbox"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    if (e.target.checked) setRulesError(false);
                  }}
                  aria-invalid={rulesError && !accepted ? true : undefined}
                  aria-describedby={rulesError && !accepted ? "rules-error" : undefined}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span className="text-sm">
                  {t.rich("rules", {
                    link: (chunks) => (
                      <Link href="/legal/listing-rules" target="_blank" className="font-medium text-primary underline underline-offset-4">
                        {chunks}
                      </Link>
                    ),
                  })}
                </span>
              </label>
              {rulesError && !accepted && (
                <p id="rules-error" className="text-sm font-medium text-destructive" role="alert">
                  {t("rulesRequired")}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t("reviewNote")}</p>
            <Turnstile ref={captcha} action="publish" onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
            {missing.length === 0 ? (
              <Button
                type="button"
                className="h-12 w-full text-base sm:w-auto sm:justify-self-end sm:px-8"
                onClick={() => void publish()}
                disabled={publishing}
              >
                {publishing ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <RocketIcon aria-hidden />}
                {publishing ? t("publishing") : t("publish")}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-strong/40 bg-surface-muted p-3.5 dark:bg-surface-muted/10">
                <p className="text-sm font-medium">{t("publishBlocked", { count: missing.length })}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const list = document.getElementById("missing-title");
                    list?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
                    list?.focus();
                  }}
                >
                  {t("showMissing")}
                </Button>
              </div>
            )}
          </>
        )}
        {isEdit && <p className="text-sm text-muted-foreground">{t("editNote")}</p>}
      </Section>
    </div>
  );
}
