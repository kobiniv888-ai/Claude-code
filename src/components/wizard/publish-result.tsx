"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CircleCheckBigIcon,
  EyeIcon,
  CopyIcon,
  HourglassIcon,
  ListIcon,
  PencilIcon,
  Share2Icon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/common/ltr";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WizardValues } from "@/lib/wizard/schemas";
import { priceStepFor, type WizardStepKey } from "@/lib/wizard/steps";
import type { PublishOutcome } from "@/lib/wizard/types";

/** Which step fixes an automatic-check reason (null = nothing to change in the listing). */
const REASON_STEPS: Record<string, WizardStepKey | null> = {
  duplicate_photos_other_account: "photos",
  duplicate_photos_same_account: "photos",
  price_far_below_area: "price",
  scam_phrase: "text",
  blocked_phrase: "text",
  contact_info_in_text: "text",
  new_account_velocity: null,
  shared_device: null,
  voip_phone: null,
  first_listing: null,
  phone_not_verified: null,
  payment_details: "text",
  exclusionary_text: "text",
  copied_description: "text",
  price_below_guide: "price",
};

/** "Your listing is live" / "We're checking your listing" / "Needs changes" / "Changes saved". */
/** The result icon pops in once (transform/opacity; off with reduced motion). */
const RESULT_MOTION_CSS = `
.bw-result-pop {
  animation: bw-result-pop 0.6s var(--ease-pop) both;
}
@keyframes bw-result-pop {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bw-result-pop {
    animation: none;
  }
}
`;

export function PublishResult({
  outcome,
  edited = false,
  values,
  onFix,
  onContinue,
  onOpenCalendar,
}: {
  outcome: PublishOutcome | null;
  edited?: boolean;
  values: WizardValues;
  onFix: (step: WizardStepKey) => void;
  onContinue?: () => void;
  /** "Connect your calendar" (short stays, bug 2.7): opens the place calendar over this screen. */
  onOpenCalendar?: () => void;
}) {
  const t = useTranslations("wizard.result");
  const tSteps = useTranslations("wizard.steps");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const status = outcome?.status ?? "SAVED";
  // Built on the server from SITE_URL (the browser never reads it).
  const absoluteUrl = outcome?.publicUrl ?? null;
  const fixable = (outcome?.reasons ?? []).filter((code) => code !== "first_listing");

  const share = async () => {
    if (!absoluteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: values.title, url: absoluteUrl });
        return;
      }
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error(t("shareFailed"));
    }
  };

  const tone = {
    LIVE: { icon: CircleCheckBigIcon, ring: "bg-primary-tint text-success dark:bg-success/15" },
    IN_REVIEW: { icon: HourglassIcon, ring: "bg-primary-tint text-primary-text" },
    BLOCKED: { icon: ShieldAlertIcon, ring: "bg-surface-muted text-foreground dark:bg-surface-muted/15" },
    SAVED: { icon: CircleCheckBigIcon, ring: "bg-primary-tint text-success dark:bg-success/15" },
  }[status];
  const Icon = tone.icon;
  const titleKey = status === "SAVED" ? "savedTitle" : status === "LIVE" ? (edited ? "liveEditedTitle" : "liveTitle") : status === "IN_REVIEW" ? "reviewTitle" : "blockedTitle";
  const bodyKey = status === "SAVED" ? "savedBody" : status === "LIVE" ? "liveBody" : status === "IN_REVIEW" ? "reviewBody" : "blockedBody";

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10 sm:py-16">
      <div className="grid justify-items-center gap-4 text-center">
        <style href="bayit-wizard-result" precedence="medium">
          {RESULT_MOTION_CSS}
        </style>
        <span className={cn("bw-result-pop flex size-24 items-center justify-center rounded-full shadow-card ring-8 ring-card", tone.ring)}>
          <Icon className="size-11" aria-hidden />
        </span>
        <h1 className="text-h1 text-balance outline-none" tabIndex={-1} ref={heading}>
          {t(titleKey)}
        </h1>
        <p className="max-w-prose text-body text-pretty text-muted-foreground">{t(bodyKey)}</p>
        {outcome && (
          <p className="text-sm text-muted-foreground">
            {t("listingId")} <Ltr className="font-semibold text-foreground">{outcome.publicId}</Ltr>
          </p>
        )}
      </div>

      {status === "BLOCKED" && fixable.length > 0 && (
        <ul className="grid gap-3">
          {fixable.map((code) => {
            const reasonStep = REASON_STEPS[code] ?? null;
            // Short stays and hotels set their price in the "הזמנות ומחיר" step.
            const step = reasonStep === "price" ? priceStepFor(values) : reasonStep;
            return (
              <li key={code} className="grid gap-2 rounded-card border border-border-strong/40 bg-card p-4 shadow-card">
                <p className="font-semibold">{t.has(`reasons.${code}.title`) ? t(`reasons.${code}.title`) : t("reasons.other.title")}</p>
                <p className="text-sm text-pretty text-muted-foreground">
                  {t.has(`reasons.${code}.fix`) ? t(`reasons.${code}.fix`) : t("reasons.other.fix")}
                </p>
                {step && (
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onFix(step)}>
                    <PencilIcon aria-hidden />
                    {t("fixIn", { step: tSteps(step) })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {status === "IN_REVIEW" && (
        <ol className="grid gap-3 rounded-card bg-card p-5 text-small shadow-card ring-1 ring-foreground/5">
          {(["step1", "step2", "step3"] as const).map((key, index) => (
            <li key={key} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-primary-foreground">
                {formatNumber(index + 1, locale)}
              </span>
              <span className="text-pretty">{t(`next.${key}`)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {status === "LIVE" && outcome?.publicPath && (
          <>
            <Button asChild className="h-12 rounded-full px-6 text-base">
              <Link href={outcome.publicPath}>
                {t("view")}
                <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
            <Button type="button" variant="outline" className="h-12 rounded-full px-6 text-base" onClick={() => void share()}>
              {copied ? <CopyIcon aria-hidden /> : <Share2Icon aria-hidden />}
              {copied ? t("copied") : t("share")}
            </Button>
          </>
        )}
        {status === "IN_REVIEW" && outcome?.publicPath && (
          // Not public yet: the owner sees a preview with a "being checked" banner. Sharing waits.
          <Button asChild variant="outline" className="h-12 rounded-full px-6 text-base">
            <Link href={outcome.publicPath}>
              <EyeIcon aria-hidden />
              {t("viewPreview")}
            </Link>
          </Button>
        )}
      </div>

      {onOpenCalendar && (status === "LIVE" || status === "IN_REVIEW") && (
        <section aria-labelledby="result-calendar-title" className="flex flex-col gap-4 rounded-card bg-card p-5 shadow-card ring-1 ring-foreground/5 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
            <CalendarDaysIcon className="size-6" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id="result-calendar-title" className="text-body font-bold">
              {t("calendarTitle")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground">{t("calendarBody")}</p>
          </div>
          <Button type="button" variant="outline" className="h-12 shrink-0 rounded-full px-5 text-base" onClick={onOpenCalendar} aria-haspopup="dialog">
            {t("calendarAction")}
          </Button>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button asChild variant={status === "LIVE" || status === "IN_REVIEW" ? "ghost" : "default"} className="h-12 rounded-full px-6 text-base">
          <Link href="/account/listings">
            <ListIcon aria-hidden />
            {t("myListings")}
          </Link>
        </Button>
        {onContinue && (
          <Button type="button" variant="outline" className="h-12 rounded-full px-6 text-base" onClick={onContinue}>
            <PencilIcon aria-hidden />
            {t("keepEditing")}
          </Button>
        )}
      </div>
    </div>
  );
}
