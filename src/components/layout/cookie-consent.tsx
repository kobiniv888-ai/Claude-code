"use client";

import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { Cookie, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ALL_CONSENT, CONSENT_EVENT, makeConsent, NECESSARY_ONLY, writeConsent, type Consent } from "@/lib/consent-cookie";
import { siteName } from "@/lib/seo";
import { cn } from "@/lib/utils";

// The banner is on every first visit; the switches only show after "Customize". Their code (Radix
// Switch) loads when the visitor points at or taps "Customize", not with the page.
const loadSwitch = () => import("@/components/ui/switch");
const Switch = lazy(() => loadSwitch().then((m) => ({ default: m.Switch })));

/** Fired on window after the visitor saves a choice (analytics loaders can listen for it). */
export { CONSENT_EVENT };

/**
 * Cookie banner: a bottom sheet above the phone navigation bar, a card in the corner on larger
 * screens. Accept all / Necessary only / Customize. It never blocks the page and never takes
 * focus. The server renders it only while there is no saved choice (getConsent()).
 */
export function CookieConsent({ initialOpen }: { initialOpen: boolean }) {
  const t = useTranslations("cookies");
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(initialOpen);
  const [customizing, setCustomizing] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  if (!open) return null;

  function save(consent: Consent, announce = false) {
    writeConsent(consent);
    window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
    setOpen(false);
    if (announce) toast.success(t("saved"));
  }

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-cookie-banner
      className={cn(
        // Phones: a compact sheet floating just above the bottom bar (clear of its raised Post
        // button), short enough that the home search card stays visible above it at 390×844.
        "fixed inset-x-2 bottom-[calc(var(--bottom-nav-height)+1.25rem)] z-40 animate-sheet-up",
        "sm:inset-x-auto sm:start-4 sm:w-[25rem] lg:start-6 lg:bottom-6 lg:w-[24rem]",
      )}
    >
      <div className="max-h-[calc(100dvh-var(--bottom-nav-height)-6rem)] overflow-y-auto rounded-2xl border bg-card p-3 text-card-foreground shadow-float sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground sm:inline-flex"
          >
            <Cookie className="size-5" strokeWidth={1.9} />
          </span>
          <div className="grid min-w-0 gap-1">
            <h2 id={titleId} className="text-base font-semibold">
              {t("title", { name: siteName(locale) })}
            </h2>
            <p id={descriptionId} className="text-[13px] leading-relaxed text-pretty text-muted-foreground sm:text-sm">
              {/* Phones: one short sentence, so the card stays clear of the home search button (hardening C4). */}
              <span className="sm:hidden">{t("descriptionShort")}</span>
              <span className="hidden sm:inline">{t("description")}</span>{" "}
              <Link
                href="/legal/cookies"
                className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("policyLink")}
              </Link>
            </p>
          </div>
        </div>

        {customizing ? (
          <fieldset className="mt-4 grid gap-1 rounded-xl border bg-background/60 p-1.5">
            <legend className="sr-only">{t("settingsTitle")}</legend>
            <p className="px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">{t("settingsDescription")}</p>
            <CategoryRow
              title={t("categories.necessary.title")}
              description={t("categories.necessary.description")}
              control={
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  <Lock aria-hidden className="size-3" />
                  {t("alwaysOn")}
                </span>
              }
            />
            <CategoryRow
              title={t("categories.preferences.title")}
              description={t("categories.preferences.description")}
              switchId={`${id}-preferences`}
              checked={preferences}
              onCheckedChange={setPreferences}
            />
            <CategoryRow
              title={t("categories.analytics.title")}
              description={t("categories.analytics.description")}
              switchId={`${id}-analytics`}
              checked={analytics}
              onCheckedChange={setAnalytics}
            />
          </fieldset>
        ) : null}

        {/* Phones: the three choices in one row (labels may wrap); larger screens: "accept all" on its own row. */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:grid-cols-2">
          {customizing ? (
            <Button
              type="button"
              className="col-span-3 h-11 rounded-xl sm:col-span-2 lg:h-10"
              onClick={() => save(makeConsent({ preferences, analytics }), true)}
            >
              {t("save")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                className="h-auto min-h-11 rounded-xl px-2 py-2 leading-tight whitespace-normal sm:col-span-2 lg:min-h-10"
                onClick={() => save(ALL_CONSENT)}
              >
                {t("acceptAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 rounded-xl bg-card px-2 py-2 leading-tight whitespace-normal lg:min-h-10"
                onClick={() => save(NECESSARY_ONLY)}
              >
                {t("necessaryOnly")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-11 rounded-xl px-2 py-2 leading-tight whitespace-normal lg:min-h-10"
                onPointerEnter={() => void loadSwitch()}
                onPointerDown={() => void loadSwitch()}
                onFocus={() => void loadSwitch()}
                onClick={() => setCustomizing(true)}
              >
                {t("customize")}
              </Button>
            </>
          )}
        </div>
      </div>
      {/* The banner is the last thing in the page's HTML. Until the browser has read this marker,
          the banner stays hidden (src/app/styles/bayit.css): painted half-read, it grew when the
          rest arrived, which moved it up (a layout shift). */}
      <span data-cookie-banner-end hidden />
    </section>
  );
}

function CategoryRow({
  title,
  description,
  control,
  switchId,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  control?: ReactNode;
  switchId?: string;
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}) {
  const descriptionId = switchId ? `${switchId}-description` : undefined;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg px-2.5 py-2">
      <div className="grid gap-0.5">
        {switchId ? (
          <label htmlFor={switchId} className="text-sm font-medium">
            {title}
          </label>
        ) : (
          <span className="text-sm font-medium">{title}</span>
        )}
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {switchId ? (
        <Suspense fallback={<span aria-hidden className="mt-0.5 inline-block h-[18.4px] w-[32px] shrink-0 rounded-full bg-input" />}>
          <Switch
            id={switchId}
            checked={checked}
            onCheckedChange={onCheckedChange}
            aria-describedby={descriptionId}
            className="mt-0.5 shrink-0"
          />
        </Suspense>
      ) : (
        control
      )}
    </div>
  );
}
