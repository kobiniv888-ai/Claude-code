"use client";

import { useId, useState, type ReactNode } from "react";
import { Cookie, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { ALL_CONSENT, makeConsent, NECESSARY_ONLY, writeConsent, type Consent } from "@/lib/consent-cookie";
import { siteName } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Fired on window after the visitor saves a choice (analytics loaders can listen for it). */
export const CONSENT_EVENT = "bayit:consent";

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
      className={cn(
        // Phones: a sheet floating just above the bottom bar (clear of its raised Post button).
        "fixed inset-x-2 bottom-[calc(var(--bottom-nav-height)+1.75rem)] z-40 animate-sheet-up",
        "sm:inset-x-auto sm:start-4 sm:w-[25rem] lg:start-6 lg:bottom-6 lg:w-[24rem]",
      )}
    >
      <div className="max-h-[calc(100dvh-var(--bottom-nav-height)-6rem)] overflow-y-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-float sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground"
          >
            <Cookie className="size-5" strokeWidth={1.9} />
          </span>
          <div className="grid min-w-0 gap-1">
            <h2 id={titleId} className="text-base font-semibold">
              {t("title", { name: siteName(locale) })}
            </h2>
            <p id={descriptionId} className="text-[13px] leading-relaxed text-pretty text-muted-foreground sm:text-sm">
              {t("description")}{" "}
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          {customizing ? (
            <Button
              type="button"
              className="col-span-2 h-11 rounded-xl lg:h-10"
              onClick={() => save(makeConsent({ preferences, analytics }), true)}
            >
              {t("save")}
            </Button>
          ) : (
            <>
              <Button type="button" className="col-span-2 h-11 rounded-xl lg:h-10" onClick={() => save(ALL_CONSENT)}>
                {t("acceptAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 rounded-xl bg-card py-2 leading-tight whitespace-normal lg:min-h-10"
                onClick={() => save(NECESSARY_ONLY)}
              >
                {t("necessaryOnly")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-11 rounded-xl py-2 leading-tight whitespace-normal lg:min-h-10"
                onClick={() => setCustomizing(true)}
              >
                {t("customize")}
              </Button>
            </>
          )}
        </div>
      </div>
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
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-describedby={descriptionId}
          className="mt-0.5 shrink-0"
        />
      ) : (
        control
      )}
    </div>
  );
}
