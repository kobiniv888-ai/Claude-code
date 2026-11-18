"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheckIcon, ChevronRightIcon, CircleAlertIcon, LoaderCircleIcon, LogOutIcon, RefreshCwIcon, RocketIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ds/button";
import { Tag } from "@/components/ds/tag";
import { Ltr } from "@/components/common/ltr";
import { useFreshProof } from "@/components/auth/use-fresh-proof";
import type { AppLocale } from "@/config/site";
import { Link, useRouter } from "@/i18n/navigation";
import { DEFAULT_PRICE_PERIOD, PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import { loadWizardSnapshot, saveChanges } from "@/lib/wizard/actions";
import { isFieldKey, mergeAnswers, sameAnswer, unsentIsNewer, type FieldKey } from "@/lib/wizard/patch";
import { missingRequirements } from "@/lib/wizard/requirements";
import { PRICE_PERIODS_BY_DEAL, REQUIRED_CODES, stepIssues, type StepIssues, type WizardValues } from "@/lib/wizard/schemas";
import {
  isOptionalStep,
  isSavableStep,
  parseStepParam,
  stepAfter,
  stepsFor,
  type ListingKind,
  type WizardStepKey,
} from "@/lib/wizard/steps";
import type { PublishOutcome, WizardContext, WizardListing, WizardSnapshot } from "@/lib/wizard/types";
import { siteConfig } from "@/config/site";
import { ReacceptBanner } from "@/components/pledge/reaccept-banner";
import { MISTAKE_CHECK_REFRESH, MISTAKE_CHECK_TITLE_ID, MistakeCheckSummary } from "@/components/listing/mistake-check-panel";
import { WizardBusyContext } from "./busy-context";
import { useIssueText } from "./fields";
import { focusFirstInvalid } from "./focus-error";
import { PublishResult } from "./publish-result";
import type { StepProps } from "./step-props";
import { AmenitiesStep } from "./steps/amenities-step";
import { BookingStep } from "./steps/booking-step";
import { BuildingStep } from "./steps/building-step";
import { ContactStep } from "./steps/contact-step";
import { DealStep } from "./steps/deal-step";
import { FeaturesStep } from "./steps/features-step";
import { JewishStep } from "./steps/jewish-step";
import { LocationStep } from "./steps/location-step";
import { PhotosStep } from "./steps/photos-step";
import { PledgeStep } from "./steps/pledge-step";
import { PriceStep } from "./steps/price-step";
import { PropertyStep } from "./steps/property-step";
import { PublishStep } from "./steps/publish-step";
import { RoomsStep } from "./steps/rooms-step";
import { SizeStep } from "./steps/size-step";
import { TextStep } from "./steps/text-step";
import { readUnsent, takeScroll, writeScroll, writeUnsent } from "./unsent";
import { useAutosave } from "./use-autosave";
import { revealAndFocus, usePublish } from "./use-publish";
import { WizardNav, WizardProgress } from "./wizard-chrome";

/** The place calendar (bug 2.10): its code and data load at the first opening. */
const PlaceCalendarSheet = dynamic(() => import("./calendar-sheet").then((m) => m.PlaceCalendarSheet), { ssr: false });

const STEP_COMPONENTS: Record<WizardStepKey, ComponentType<StepProps>> = {
  deal: DealStep,
  property: PropertyStep,
  location: LocationStep,
  size: SizeStep,
  building: BuildingStep,
  features: FeaturesStep,
  text: TextStep,
  amenities: AmenitiesStep,
  jewish: JewishStep,
  photos: PhotosStep,
  rooms: RoomsStep,
  price: PriceStep,
  booking: BookingStep,
  contact: ContactStep,
  pledge: PledgeStep,
  publish: PublishStep,
};

/** A tab that was hidden at least this long checks the saved answers again when it comes back. */
const RECHECK_AFTER_HIDDEN_MS = 10_000;
/** "Loading your answers…" shows only when the check takes longer than this. */
const SLOW_LOAD_MS = 400;

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

const kindOf = (values: WizardValues): ListingKind => ({ dealType: values.dealType, propertyType: values.propertyType });

/** What may change about the listing while the form is open (from each snapshot). */
type ListingMeta = Pick<WizardListing, "status" | "wizardStep" | "rulesAccepted" | "publicPath" | "updatedAt" | "icalBlocked">;
const metaOf = (from: ListingMeta): ListingMeta => ({
  status: from.status,
  wizardStep: from.wizardStep,
  rulesAccepted: from.rulesAccepted,
  publicPath: from.publicPath,
  updatedAt: from.updatedAt,
  icalBlocked: from.icalBlocked,
});

/** Sets ?step=N in the address without a new history entry (keeps the router's state). */
function replaceStepInUrl(step: WizardStepKey, kind: ListingKind, extra: Record<string, string> = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set("step", String(stepsFor(kind).indexOf(step) + 1));
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
}

export function WizardShell({
  listing,
  context,
  initialStep,
  initialResult = null,
}: {
  listing: WizardListing;
  context: WizardContext;
  initialStep: WizardStepKey;
  /** A reload of the success screen (?published=1, bug 2.7). */
  initialResult?: PublishOutcome | null;
}) {
  const t = useTranslations("wizard");
  const issueText = useIssueText();
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const isEdit = context.mode === "edit";

  // The page's props are only the first guess: the browser may restore this page from its cache
  // with the answers of the first visit. Every mount loads the saved answers again (bug 2.2).
  const [values, setValues] = useState<WizardValues>(listing.values);
  const [meta, setMeta] = useState<ListingMeta>(() => metaOf(listing));
  const [photos, setPhotosState] = useState(listing.photos);
  const [roomTypes, setRoomTypesState] = useState(listing.roomTypes);
  const [blocked, setBlocked] = useState(listing.blocked);
  const [translations, setTranslationsState] = useState(listing.translations);
  const [step, setStep] = useState<WizardStepKey>(initialStep);
  const [attempted, setAttempted] = useState<ReadonlySet<WizardStepKey>>(new Set());
  const [chosen, setChosenState] = useState(listing.chosen);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishOutcome | null>(initialResult);
  const [editResult, setEditResult] = useState<{ resubmitted: boolean; outcome: PublishOutcome | null } | null>(null);
  const [pledge, setPledge] = useState(context.user.pledge);
  const [phoneVerified, setPhoneVerified] = useState(context.user.phoneVerified);
  const [ready, setReady] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "slow" | "failed" | "done">("loading");
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [focusRequest, setFocusRequest] = useState(0);
  const [calendar, setCalendar] = useState<{ used: boolean; open: boolean }>({ used: false, open: false });

  const valuesRef = useRef(values);
  const stepRef = useRef(step);
  const statusRef = useRef(meta.status);
  const chosenRef = useRef(chosen);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const busyKeysRef = useRef(busyKeys);
  const serverUpdatedAt = useRef(listing.updatedAt);
  const navigated = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepBodyRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    busyKeysRef.current = busyKeys;
  }, [busyKeys]);

  const kind: ListingKind = useMemo(() => kindOf(values), [values]);
  const steps = useMemo(() => stepsFor(kind), [kind]);
  const position = Math.max(1, steps.indexOf(step) + 1);

  // ── Auto-save (only changed answers; unsent ones kept in sessionStorage) ──
  const persistUnsent = useCallback(
    (changed: ReadonlySet<FieldKey>) => {
      const fields: Partial<Record<FieldKey, unknown>> = {};
      for (const key of changed) fields[key] = valuesRef.current[key];
      writeUnsent(
        listing.id,
        changed.size === 0 ? null : { v: 1, base: serverUpdatedAt.current, changedAt: Date.now(), fields: fields as Partial<WizardValues> },
      );
    },
    [listing.id],
  );
  // A published listing's contact details change only after a fresh code (SECURITY_REPORT 3.6.a).
  const proof = useFreshProof();
  const autosave = useAutosave({
    askProof: proof.ask,
    listingId: listing.id,
    getValues: () => valuesRef.current,
    getKind: () => kindOf(valuesRef.current),
    isDraft: () => statusRef.current === "DRAFT",
    onSaved: (updatedAt) => {
      serverUpdatedAt.current = updatedAt;
    },
    onPendingChange: persistUnsent,
  });
  const { schedule, markChanged, changedFields, isSaving, flush: flushSaves, track } = autosave;

  const set = useCallback(
    (patch: Partial<WizardValues>) => {
      // The step is read-only until the saved answers are in (bug 2.2).
      if (!readyRef.current) return;
      const current = valuesRef.current;
      const nextValues = { ...current, ...applyDealChange(current, patch) };
      valuesRef.current = nextValues;
      setValues(nextValues);
      // Only what the person changed is saved (the deal type's knock-on changes are made by the server too).
      markChanged((Object.keys(patch) as string[]).filter(isFieldKey));
      const active = stepRef.current;
      if (isSavableStep(active)) schedule(active);
    },
    [markChanged, schedule],
  );

  const flush = useCallback(async () => {
    const active = stepRef.current;
    return flushSaves(isSavableStep(active) ? active : undefined);
  }, [flushSaves]);

  const reportBusy = useCallback((id: string, isBusy: boolean) => {
    setBusyKeys((current) => {
      if (current.has(id) === isBusy) return current;
      const next = new Set(current);
      if (isBusy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // ── Issues ──
  const rawIssues = useCallback(
    (s: WizardStepKey, v: WizardValues = values): StepIssues => {
      const issues: StepIssues = isSavableStep(s) ? stepIssues(s, v, kindOf(v)) : {};
      if (s === "deal" && !chosen.deal) issues.dealType = "pickOne";
      if (s === "property" && !chosen.property) issues.propertyType = "pickOne";
      if (s === "pledge" && !pledge.isCurrent) issues.pledge = "required";
      const server = isSavableStep(s) ? autosave.serverIssues[s] : undefined;
      return { ...server, ...issues };
    },
    [values, chosen, autosave.serverIssues, pledge.isCurrent],
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
      if (s === "publish") return meta.status !== "DRAFT";
      if (s === "pledge") return pledge.isCurrent;
      return Object.keys(rawIssues(s)).length === 0;
    },
    [photoCount, roomTypes.length, rawIssues, meta.status, pledge.isCurrent],
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
  const showStep = useCallback((target: WizardStepKey, push = true) => {
    navigated.current = true;
    stepRef.current = target;
    setStep(target);
    if (push) {
      const n = stepsFor(kindOf(valuesRef.current)).indexOf(target) + 1;
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(n));
      window.history.pushState(null, "", url.toString());
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  /** Runs a navigation once at a time (a double tap on Next never skips a step). */
  const exclusive = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const goTo = useCallback(
    async (target: WizardStepKey) => {
      if (target === stepRef.current || !readyRef.current) return;
      const done = await exclusive(async () => {
        const targetIndex = stepsFor(kindOf(valuesRef.current)).indexOf(target) + 1;
        const active = stepRef.current;
        await flushSaves(isSavableStep(active) ? active : undefined, targetIndex);
        return true;
      });
      if (done) showStep(target);
    },
    [exclusive, flushSaves, showStep],
  );

  const next = async () => {
    if (!readyRef.current || busyRef.current) return;
    const issues = rawIssues(step);
    if (Object.keys(issues).length > 0) {
      setAttempted((current) => new Set(current).add(step));
      toast.error(t("chrome.fixErrors"));
      setFocusRequest((n) => n + 1);
      return;
    }
    const target = steps[Math.min(steps.length - 1, position)];
    const okay = await exclusive(() => flushSaves(isSavableStep(step) ? step : undefined, position + 1));
    if (okay === undefined) return;
    if (!okay && isSavableStep(step)) {
      // Stay here: the indicator shows the problem (and "Retry"), server errors show inline.
      setAttempted((current) => new Set(current).add(step));
      setFocusRequest((n) => n + 1);
      return;
    }
    showStep(target);
  };

  const back = () => {
    if (position <= 1) return;
    void goTo(steps[position - 2]);
  };

  // "דילוג" on an optional step (step 9, round 3): no check, nothing cleared. goTo saves what was
  // already ticked and remembers the next step, exactly like a jump from the steps list.
  const skipTarget = isOptionalStep(step) ? stepAfter(step, kind) : null;
  const skip = () => {
    if (skipTarget) void goTo(skipTarget);
  };

  // "Some details need your attention": the first highlighted field comes into view, focused.
  useEffect(() => {
    if (focusRequest === 0) return;
    const frame = requestAnimationFrame(() => focusFirstInvalid(stepBodyRef.current, alertRef.current));
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  // ── Publish (create mode: the big "פרסום" in the bottom bar, bug 2.7) ──
  const missing = missingRequirements({ values, photoCount, phoneVerified, pledgeAccepted: pledge.isCurrent });
  const onPublished = useCallback(
    (outcome: PublishOutcome) => {
      writeUnsent(listing.id, null);
      setResult(outcome);
      // A reload (or Back from the listing page) shows this screen again.
      replaceStepInUrl("publish", kindOf(valuesRef.current), { published: "1" });
      window.scrollTo({ top: 0 });
    },
    [listing.id],
  );
  const publishControl = usePublish({
    listingId: listing.id,
    initiallyAccepted: listing.rulesAccepted,
    missingCount: missing.length,
    flush,
    track,
    onPublished,
  });
  const { setAccepted } = publishControl;

  // ── The saved answers: on every mount, after the browser restores the page, and when the tab is back ──
  const applySnapshot = useCallback(
    (snap: WizardSnapshot, how: { restoreUnsent: boolean; receivedAt: number; first: boolean }) => {
      // An answer this tab saved after the request left (a slow reply), or a save on its way:
      // keep what is on screen; the next check picks it up.
      if (readyRef.current && (Date.parse(snap.updatedAt) < Date.parse(serverUpdatedAt.current) || isSaving())) return;

      // Published meanwhile (another tab, or Back from the listing page after publishing).
      if (!isEdit && snap.status !== "DRAFT") {
        const published = new URL(window.location.href).searchParams.get("published") === "1";
        if (published && (snap.status === "LIVE" || snap.status === "IN_REVIEW")) {
          setResult({ status: snap.status, reasons: [], publicId: listing.publicId, publicPath: snap.publicPath });
        } else {
          router.replace(`/account/listings/${listing.id}/edit`);
        }
        return;
      }

      serverUpdatedAt.current = snap.updatedAt;
      let merged = mergeAnswers(snap.values, valuesRef.current, changedFields());
      const restored: FieldKey[] = [];
      if (how.restoreUnsent) {
        const entry = readUnsent(listing.id);
        if (entry && unsentIsNewer(entry, snap, how.receivedAt)) {
          merged = { ...merged, ...entry.fields };
          for (const key of Object.keys(entry.fields) as FieldKey[]) {
            if (!sameAnswer(entry.fields[key], snap.values[key])) restored.push(key);
          }
        } else if (entry) {
          writeUnsent(listing.id, null);
        }
      }
      valuesRef.current = merged;
      setValues(merged);
      if (restored.length > 0) markChanged(restored);
      if (busyKeysRef.current.size === 0) {
        setPhotosState(snap.photos);
        setRoomTypesState(snap.roomTypes);
      }
      setBlocked(snap.blocked);
      setTranslationsState(snap.translations);
      statusRef.current = snap.status;
      setMeta(metaOf(snap));
      if (snap.rulesAccepted) setAccepted(true);
      const nextChosen = { deal: chosenRef.current.deal || snap.chosen.deal, property: chosenRef.current.property || snap.chosen.property };
      chosenRef.current = nextChosen;
      setChosenState(nextChosen);
      setPledge(snap.user.pledge);
      setPhoneVerified(snap.user.phoneVerified);

      if (how.first) {
        // Read the step from the address again, now with the real deal and place type.
        const kindNow = kindOf(merged);
        const param = new URL(window.location.href).searchParams.get("step");
        let target = parseStepParam(param ?? undefined, kindNow, snap.wizardStep);
        if (!isEdit && !nextChosen.deal) target = "deal";
        else if (!isEdit && !nextChosen.property && target !== "deal") target = "property";
        if (target !== stepRef.current) {
          stepRef.current = target;
          setStep(target);
        }
        replaceStepInUrl(target, kindNow);
        // Coming back from a page reached from the form: the same place on the step (bug 2.10).
        const y = takeScroll(listing.id, target);
        if (y !== null) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y })));
      }
      readyRef.current = true;
      setReady(true);
      setLoadState("done");
      if (restored.length > 0) void flushSaves();
    },
    [changedFields, flushSaves, isEdit, isSaving, listing.id, listing.publicId, markChanged, router, setAccepted],
  );

  const reloadSeq = useRef(0);
  const reload = useCallback(
    async (reason: "mount" | "restore" | "visible") => {
      const seq = ++reloadSeq.current;
      const first = !readyRef.current;
      const slow = first ? setTimeout(() => setLoadState((s) => (s === "loading" ? "slow" : s)), SLOW_LOAD_MS) : null;
      const res = await loadWizardSnapshot(listing.id).catch(() => null);
      if (slow) clearTimeout(slow);
      if (seq !== reloadSeq.current) return;
      if (!res || !res.ok) {
        if (!readyRef.current) setLoadState("failed");
        return;
      }
      applySnapshot(res.data, { restoreUnsent: reason !== "visible", receivedAt: Date.now(), first: first || reason === "restore" });
    },
    [applySnapshot, listing.id],
  );
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (initialResult) return;
    void reloadRef.current("mount");
    const listingId = listing.id;
    const remember = () => writeScroll(listingId, stepRef.current, lastScrollY.current);
    let hiddenAt = 0;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        lastScrollY.current = window.scrollY;
      });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Restored from the browser's back/forward cache: the answers may be old.
      if (event.persisted) void reloadRef.current("restore");
    };
    const onPageHide = () => {
      void flushRef.current();
      remember();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        void flushRef.current();
        remember();
      } else if (hiddenAt && Date.now() - hiddenAt > RECHECK_AFTER_HIDDEN_MS) {
        void reloadRef.current("visible");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // Leaving for another page of the site (a link in the form, "Save and exit").
      remember();
      void flushRef.current();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialResult, listing.id]);

  // Browser back/forward between steps.
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("published") === "1") return;
      const v = valuesRef.current;
      let target = parseStepParam(url.searchParams.get("step") ?? "1", kindOf(v), 1);
      if (!isEdit && !chosenRef.current.deal) target = "deal";
      else if (!isEdit && !chosenRef.current.property && target !== "deal") target = "property";
      void flushRef.current();
      navigated.current = true;
      stepRef.current = target;
      setStep(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isEdit]);

  // Focus the step heading after a step change (not on first load).
  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // ── Edit mode: "Save changes" ──
  const onSaveChanges = async () => {
    await exclusive(async () => {
      const okay = await flush();
      if (!okay) {
        toast.error(t("chrome.fixErrors"));
        return;
      }
      const res = await track(saveChanges(listing.id, context.editToken)).catch(() => null);
      if (!res) return;
      if (!res.ok) {
        if (res.error === "missing_requirements") {
          showStep("publish");
          toast.error(t("publish.missingTitle"));
        } else if (res.error === "listing_mistakes") {
          // "בדיקה לפני פרסום" found errors (round 3, brief 6.1): the preview step lists them (no
          // toast: it would cover the bottom bar, and the panel says what to fix).
          if (stepRef.current === "publish") {
            window.dispatchEvent(new Event(MISTAKE_CHECK_REFRESH));
            revealAndFocus(MISTAKE_CHECK_TITLE_ID);
          } else {
            showStep("publish");
          }
        } else {
          toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.server_error"));
        }
        return;
      }
      setEditResult(res.data);
      window.scrollTo({ top: 0 });
    });
  };

  // ── The place calendar in a full-screen sheet (bug 2.10) ──
  const formPath = `${isEdit ? `/account/listings/${listing.id}/edit` : `/post/${listing.id}`}?step=${position}`;
  const openCalendar = useCallback(() => {
    void flush();
    setCalendar({ used: true, open: true });
  }, [flush]);
  const calendarSheet = calendar.used ? (
    <PlaceCalendarSheet
      listingId={listing.id}
      open={calendar.open}
      onOpenChange={(open) => setCalendar((c) => ({ ...c, open }))}
      returnTo={formPath}
    />
  ) : null;

  const liveListing = useMemo(() => ({ ...listing, ...meta }), [listing, meta]);
  const liveContext = useMemo(
    () => ({ ...context, user: { ...context.user, pledge, phoneVerified } }),
    [context, pledge, phoneVerified],
  );

  const stepProps: StepProps = {
    listing: liveListing,
    context: liveContext,
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
    onPublished,
    chosen,
    setChosen: (patch) => {
      const nextChosen = { ...chosenRef.current, ...patch };
      chosenRef.current = nextChosen;
      setChosenState(nextChosen);
    },
    track,
    pledge,
    setPledge,
    ready,
    openCalendar,
    publish: isEdit ? null : publishControl,
  };

  // Short stays connect Airbnb / Booking.com calendars (hotels are contact-only this round).
  const calendarOffer = values.dealType === "SHORT_STAY" ? openCalendar : undefined;

  if (result) {
    return (
      <>
        <PublishResult
          outcome={result}
          values={values}
          onOpenCalendar={calendarOffer}
          onFix={(s) => {
            setResult(null);
            showStep(s);
          }}
        />
        {calendarSheet}
      </>
    );
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
  const uploading = busyKeys.size > 0;
  const saving = autosave.state.status === "saving";
  const waiting = !ready || busy || saving || uploading;

  return (
    <WizardBusyContext.Provider value={reportBusy}>
      <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-6 sm:pt-8">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="grid min-w-0 gap-0.5">
            <p className="text-caption font-semibold tracking-wide text-pretty text-muted-foreground uppercase">
              {isEdit ? t("chrome.editing") : t("chrome.newListing")}
            </p>
            <p className="text-caption text-muted-foreground">
              {t("chrome.listingId")} <Ltr className="font-semibold text-foreground">{listing.publicId}</Ltr>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isEdit && (
              <Button type="button" variant="soft" size="sm" onClick={onSaveChanges} disabled={waiting}>
                <CheckCheckIcon aria-hidden />
                <span className="max-sm:sr-only">{t("chrome.saveChanges")}</span>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="px-3">
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

        {pledge.mustReaccept && step !== "pledge" && (
          <ReacceptBanner status={pledge} onReview={() => void goTo("pledge")} className="mb-5" />
        )}

        {/* Editing a published listing: what "בדיקה לפני פרסום" found, on every step but the preview. */}
        {isEdit && ready && step !== "publish" && (
          <MistakeCheckSummary listingId={listing.id} refreshKey={step} onShow={() => void goTo("publish")} className="mb-5" />
        )}

        <WizardProgress
          steps={steps}
          current={step}
          complete={complete}
          canJump={(s) => ready && canJump(s)}
          onJump={(s) => void goTo(s)}
          saveState={autosave.state}
          onRetry={() => void flush()}
        />

        {/* key: each step fades up a little as it comes in (transform/opacity; off with reduced motion). */}
        <div key={step} className="mt-6 grid animate-fade-up gap-6 [&>*]:min-w-0" data-wizard-step={step}>
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* The step title is the page's main heading (the wizard has no other <h1>). */}
              <h1 ref={headingRef} tabIndex={-1} className="min-w-0 text-h1 text-balance text-foreground outline-none">
                {t(`${step}.title`)}
              </h1>
              {isOptionalStep(step) && <Tag className="h-7 px-3 text-small">{t("chrome.optionalStep")}</Tag>}
              {/* "דילוג" at the top end of the step, where phones expect Skip (the bottom bar keeps
                  Back and Next only: three buttons do not fit at 360px in Georgian or Russian). */}
              {skipTarget && (
                <Button type="button" variant="secondary" size="sm" className="ms-auto" onClick={skip} disabled={waiting}>
                  {t("chrome.skip")}
                  <ChevronRightIcon className="rtl:-scale-x-100" aria-hidden />
                </Button>
              )}
            </div>
            <p className="text-body text-pretty text-muted-foreground">{t(`${step}.subtitle`)}</p>
          </div>
          {loadState === "slow" && (
            <p role="status" className="flex items-center gap-2 text-small text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              {t("chrome.loadingAnswers")}
            </p>
          )}
          {loadState === "failed" && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-card border border-destructive/30 bg-destructive/5 px-4 py-3 text-small font-semibold text-destructive"
            >
              <CircleAlertIcon className="size-4.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{t("chrome.loadFailed")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoadState("loading");
                  void reload("mount");
                }}
              >
                <RefreshCwIcon aria-hidden />
                {t("chrome.retry")}
              </Button>
            </div>
          )}
          {attempted.has(step) && Object.keys(currentIssues).length > 0 && (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="flex items-start gap-2.5 rounded-card border border-destructive/30 bg-destructive/5 px-4 py-3 text-small font-semibold text-destructive outline-none"
            >
              <CircleAlertIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
              {t("chrome.fixErrors")}
            </div>
          )}
          {/* Read-only until the saved answers are in (bug 2.2). */}
          <div ref={stepBodyRef} className="grid min-w-0 gap-6" inert={!ready} aria-busy={!ready || undefined}>
            <StepComponent key={step} {...stepProps} />
          </div>
        </div>

        <WizardNav
          onBack={back}
          onNext={() => void next()}
          backDisabled={position <= 1 || !ready}
          nextLabel={steps[position] === "publish" ? t("chrome.toPreview") : t("chrome.next")}
          busy={busy}
          nextDisabled={waiting}
          hideNext={isLast}
          extra={
            isLast && isEdit ? (
              <Button type="button" className="h-12 flex-1 px-5 sm:h-11 sm:max-w-60" onClick={onSaveChanges} disabled={waiting || missing.length > 0}>
                {t("chrome.saveChanges")}
              </Button>
            ) : isLast ? (
              <Button
                type="button"
                className="h-12 min-w-0 flex-1 px-5 text-base sm:h-11 sm:max-w-72"
                onClick={() => void publishControl.publish()}
                disabled={!ready || publishControl.publishing || uploading}
                aria-describedby={missing.length > 0 ? "missing-title" : undefined}
              >
                {publishControl.publishing ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <RocketIcon aria-hidden />}
                {publishControl.publishing ? t("publish.publishing") : t("chrome.publish")}
              </Button>
            ) : null
          }
        />
      </div>
      {calendarSheet}
      {proof.dialog}
    </WizardBusyContext.Provider>
  );
}
