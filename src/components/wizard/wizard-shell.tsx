"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheckIcon, LogOutIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale } from "@/config/site";
import { Link, useRouter } from "@/i18n/navigation";
import { DEFAULT_PRICE_PERIOD, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import { saveChanges, saveWizardStep } from "@/lib/wizard/actions";
import { missingRequirements } from "@/lib/wizard/requirements";
import { PRICE_PERIODS_BY_DEAL, REQUIRED_CODES, stepIssues, type StepIssues, type WizardValues } from "@/lib/wizard/schemas";
import {
  isSavableStep,
  parseStepParam,
  stepsFor,
  type ListingKind,
  type WizardStepKey,
} from "@/lib/wizard/steps";
import type { PublishOutcome, WizardContext, WizardListing } from "@/lib/wizard/types";
import { siteConfig } from "@/config/site";
import { useIssueText } from "./fields";
import { PublishResult } from "./publish-result";
import type { StepProps } from "./step-props";
import { AmenitiesStep } from "./steps/amenities-step";
import { ContactStep } from "./steps/contact-step";
import { DealStep } from "./steps/deal-step";
import { DetailsStep } from "./steps/details-step";
import { JewishStep } from "./steps/jewish-step";
import { LocationStep } from "./steps/location-step";
import { PhotosStep } from "./steps/photos-step";
import { PriceStep } from "./steps/price-step";
import { PropertyStep } from "./steps/property-step";
import { PublishStep } from "./steps/publish-step";
import { RoomsStep } from "./steps/rooms-step";
import { useAutosave } from "./use-autosave";
import { WizardNav, WizardProgress } from "./wizard-chrome";
import { scrollBehavior } from "@/lib/motion";

const STEP_COMPONENTS: Record<WizardStepKey, ComponentType<StepProps>> = {
  deal: DealStep,
  property: PropertyStep,
  location: LocationStep,
  details: DetailsStep,
  amenities: AmenitiesStep,
  jewish: JewishStep,
  photos: PhotosStep,
  rooms: RoomsStep,
  price: PriceStep,
  contact: ContactStep,
  publish: PublishStep,
};

/** The deal type decides which property types and price periods are possible. */
function applyDealChange(values: WizardValues, patch: Partial<WizardValues>): Partial<WizardValues> {
  if (!patch.dealType || patch.dealType === values.dealType) return patch;
  const allowed = PROPERTY_TYPES_BY_DEAL[patch.dealType];
  const periods = PRICE_PERIODS_BY_DEAL[patch.dealType];
  return {
    ...patch,
    propertyType: allowed.includes(values.propertyType) ? values.propertyType : allowed[0],
    pricePeriod: periods.includes(values.pricePeriod) ? values.pricePeriod : DEFAULT_PRICE_PERIOD[patch.dealType],
  };
}

export function WizardShell({
  listing,
  context,
  initialStep,
}: {
  listing: WizardListing;
  context: WizardContext;
  initialStep: WizardStepKey;
}) {
  const t = useTranslations("wizard");
  const issueText = useIssueText();
  const locale = useLocale() as AppLocale;
  const router = useRouter();

  const [values, setValues] = useState<WizardValues>(listing.values);
  const [photos, setPhotosState] = useState(listing.photos);
  const [roomTypes, setRoomTypesState] = useState(listing.roomTypes);
  const [blocked, setBlocked] = useState(listing.blocked);
  const [translations, setTranslationsState] = useState(listing.translations);
  const [step, setStep] = useState<WizardStepKey>(initialStep);
  const [attempted, setAttempted] = useState<ReadonlySet<WizardStepKey>>(new Set());
  const [chosen, setChosenState] = useState({ deal: !listing.fresh, property: !listing.fresh });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishOutcome | null>(null);
  const [editResult, setEditResult] = useState<{ resubmitted: boolean; outcome: PublishOutcome | null } | null>(null);

  const autosave = useAutosave(listing.id, listing.values);
  const kind: ListingKind = useMemo(
    () => ({ dealType: values.dealType, propertyType: values.propertyType }),
    [values.dealType, values.propertyType],
  );
  const steps = useMemo(() => stepsFor(kind), [kind]);
  const position = Math.max(1, steps.indexOf(step) + 1);
  const isEdit = context.mode === "edit";

  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // ── Values and auto-save ──
  const { schedule } = autosave;
  const set = useCallback(
    (patch: Partial<WizardValues>) => {
      const current = valuesRef.current;
      const nextValues = { ...current, ...applyDealChange(current, patch) };
      valuesRef.current = nextValues;
      setValues(nextValues);
      const active = stepRef.current;
      if (isSavableStep(active)) schedule(active, nextValues);
    },
    [schedule],
  );

  const flush = useCallback(async () => {
    const active = stepRef.current;
    return autosave.flush(isSavableStep(active) ? active : undefined, isSavableStep(active) ? valuesRef.current : undefined);
  }, [autosave]);

  // ── Issues ──
  const rawIssues = useCallback(
    (s: WizardStepKey, v: WizardValues = values): StepIssues => {
      const issues: StepIssues = isSavableStep(s) ? stepIssues(s, v, { dealType: v.dealType, propertyType: v.propertyType }) : {};
      if (s === "deal" && !chosen.deal) issues.dealType = "pickOne";
      if (s === "property" && !chosen.property) issues.propertyType = "pickOne";
      const server = isSavableStep(s) ? autosave.serverIssues[s] : undefined;
      return { ...server, ...issues };
    },
    [values, chosen, autosave.serverIssues],
  );

  const currentIssues = rawIssues(step);
  const visibleErrors = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [field, code] of Object.entries(currentIssues)) {
      if (attempted.has(step) || !REQUIRED_CODES.has(code)) out[field] = issueText(code);
    }
    return out;
  }, [currentIssues, attempted, step, issueText]);

  const photoCount = photos.length;
  const complete = useCallback(
    (s: WizardStepKey) => {
      if (s === "photos") return photoCount >= siteConfig.listings.minPhotos;
      if (s === "rooms") return roomTypes.length > 0;
      if (s === "publish") return listing.status !== "DRAFT";
      return Object.keys(rawIssues(s)).length === 0;
    },
    [photoCount, roomTypes.length, rawIssues, listing.status],
  );

  const canJump = useCallback(
    (s: WizardStepKey) => {
      if (isEdit) return true;
      if (s === "deal") return true;
      if (s === "property") return chosen.deal;
      return chosen.deal && chosen.property;
    },
    [chosen, isEdit],
  );

  // ── Navigation ──
  const showStep = useCallback(
    (target: WizardStepKey, push = true) => {
      navigated.current = true;
      setStep(target);
      const n = stepsFor({ dealType: valuesRef.current.dealType, propertyType: valuesRef.current.propertyType }).indexOf(target) + 1;
      if (push) {
        const url = new URL(window.location.href);
        url.searchParams.set("step", String(n));
        window.history.pushState(null, "", url.toString());
      }
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    },
    [],
  );

  const goTo = useCallback(
    async (target: WizardStepKey) => {
      if (target === stepRef.current) return;
      setBusy(true);
      const targetIndex = stepsFor({ dealType: valuesRef.current.dealType, propertyType: valuesRef.current.propertyType }).indexOf(target) + 1;
      const active = stepRef.current;
      await autosave.flush(
        isSavableStep(active) ? active : undefined,
        isSavableStep(active) ? valuesRef.current : undefined,
        listing.status === "DRAFT" && isSavableStep(active) ? targetIndex : undefined,
      );
      if (listing.status === "DRAFT" && !isSavableStep(active)) {
        void saveWizardStep(listing.id, targetIndex).catch(() => undefined);
      }
      setBusy(false);
      showStep(target);
    },
    [autosave, listing.id, listing.status, showStep],
  );

  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        "[data-wizard-step] [aria-invalid='true'], [data-wizard-step] [data-invalid] input, [data-wizard-step] [data-invalid] textarea",
      );
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      }
    });
  };

  const next = async () => {
    const issues = rawIssues(step);
    if (Object.keys(issues).length > 0) {
      setAttempted((current) => new Set(current).add(step));
      toast.error(t("chrome.fixErrors"));
      focusFirstError();
      return;
    }
    const target = steps[Math.min(steps.length - 1, position)];
    if (isSavableStep(step)) {
      setBusy(true);
      const okay = await autosave.flush(step, values, listing.status === "DRAFT" ? position + 1 : undefined);
      setBusy(false);
      if (!okay) {
        // Stay here: the indicator shows the problem (and "Retry"), server errors show inline.
        setAttempted((current) => new Set(current).add(step));
        focusFirstError();
        return;
      }
      showStep(target);
      return;
    }
    void goTo(target);
  };

  const back = () => {
    if (position <= 1) return;
    void goTo(steps[position - 2]);
  };

  // Browser back/forward between steps.
  useEffect(() => {
    const onPop = () => {
      const param = new URL(window.location.href).searchParams.get("step");
      const v = valuesRef.current;
      const target = parseStepParam(param ?? "1", { dealType: v.dealType, propertyType: v.propertyType }, 1);
      void flush();
      navigated.current = true;
      setStep(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [flush]);

  // Focus the step heading after a step change (not on first load).
  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // ── Edit mode: "Save changes" ──
  const onSaveChanges = async () => {
    setBusy(true);
    const okay = await flush();
    if (!okay) {
      setBusy(false);
      toast.error(t("chrome.fixErrors"));
      return;
    }
    const res = await autosave.track(saveChanges(listing.id, context.editToken)).catch(() => null);
    setBusy(false);
    if (!res) return;
    if (!res.ok) {
      if (res.error === "missing_requirements") {
        showStep("publish");
        toast.error(t("publish.missingTitle"));
      } else {
        toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.server_error"));
      }
      return;
    }
    setEditResult(res.data);
    window.scrollTo({ top: 0 });
  };

  const stepProps: StepProps = {
    listing,
    context,
    locale,
    values,
    kind,
    set,
    errors: visibleErrors,
    issues: currentIssues,
    photos,
    setPhotos: (update) => setPhotosState(update),
    roomTypes,
    setRoomTypes: (update) => setRoomTypesState(update),
    blocked,
    setBlocked,
    translations,
    setTranslations: (update) => setTranslationsState(update),
    goTo: (s) => void goTo(s),
    flush,
    onPublished: (outcome) => {
      setResult(outcome);
      window.scrollTo({ top: 0 });
    },
    chosen,
    setChosen: (patch) => setChosenState((current) => ({ ...current, ...patch })),
    track: autosave.track,
  };

  if (result) {
    return <PublishResult outcome={result} values={values} onFix={(s) => { setResult(null); showStep(s); }} />;
  }
  if (editResult) {
    return (
      <PublishResult
        outcome={editResult.outcome}
        edited
        values={values}
        onFix={(s) => {
          setEditResult(null);
          showStep(s);
        }}
        onContinue={() => setEditResult(null)}
      />
    );
  }

  const StepComponent = STEP_COMPONENTS[step];
  const isLast = step === "publish";
  const exitHref = isEdit ? "/account/listings" : "/post";
  const missing = missingRequirements({ values, photoCount, phoneVerified: context.user.phoneVerified });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-6 sm:pt-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {isEdit ? t("chrome.editing") : t("chrome.newListing")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("chrome.listingId")} <Ltr className="font-medium text-foreground">{listing.publicId}</Ltr>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <Button type="button" variant="secondary" onClick={onSaveChanges} disabled={busy}>
              <CheckCheckIcon aria-hidden />
              {t("chrome.saveChanges")}
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link
              href={exitHref}
              onClick={(event) => {
                event.preventDefault();
                void flush().then(() => router.push(exitHref));
              }}
            >
              <LogOutIcon className="rtl:-scale-x-100" aria-hidden />
              {t("chrome.saveAndExit")}
            </Link>
          </Button>
        </div>
      </header>

      <WizardProgress
        steps={steps}
        current={step}
        complete={complete}
        canJump={canJump}
        onJump={(s) => void goTo(s)}
        saveState={autosave.state}
        onRetry={() => void flush()}
      />

      <div className="mt-6 grid gap-6" data-wizard-step={step}>
        <div className="grid gap-1.5">
          {/* The step title is the page's main heading (the wizard has no other <h1>). */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight text-balance outline-none sm:text-3xl"
          >
            {t(`${step}.title`)}
          </h1>
          <p className="text-pretty text-muted-foreground">{t(`${step}.subtitle`)}</p>
        </div>
        {attempted.has(step) && Object.keys(currentIssues).length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
            {t("chrome.fixErrors")}
          </div>
        )}
        <StepComponent key={step} {...stepProps} />
      </div>

      <WizardNav
        onBack={back}
        onNext={() => void next()}
        backDisabled={position <= 1}
        nextLabel={steps[position] === "publish" ? t("chrome.toPreview") : t("chrome.next")}
        busy={busy}
        hideNext={isLast}
        extra={
          isLast && isEdit ? (
            <Button type="button" className="h-11 px-5 text-base" onClick={onSaveChanges} disabled={busy || missing.length > 0}>
              {t("chrome.saveChanges")}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
