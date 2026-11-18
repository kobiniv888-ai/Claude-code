"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChartColumnIcon, EyeOffIcon, MapPinIcon, BedDoubleIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { loadListingPriceGuide } from "@/lib/pricing/actions";
import type { ListingGuideView } from "@/lib/pricing/guide-server";
import { cn } from "@/lib/utils";
import { GuideView } from "./guide-view";

/**
 * "מדריך מחירים" in the post form's price step ("הזמנות ומחיר" for short stays and hotels, "מחיר
 * וזמינות" for monthly rentals and sales) and on the edit page, which is the same form (round 3,
 * brief 5). Owner only: the server action checks the session and that the listing is theirs, and
 * rate-limits. Compares the listing as saved (the form saves before it changes step); the host's
 * price is the form's live value, so the sentence "המחיר שלכם, ₾55, …" follows what they type.
 * Hotels get one answer per room type, by its saved price.
 */

type State =
  | { status: "loading"; view: ListingGuideView | null }
  | { status: "failed"; code: string; view: ListingGuideView | null }
  | { status: "done"; view: ListingGuideView };

export type PriceGuidePanelProps = {
  listingId: string;
  locale: AppLocale;
  /** The form's currency: the guide is shown in it. */
  currency: CurrencyCode;
  /** The form's live price and its period (not used for hotels: each room type has its own). */
  price: number | null;
  period: PricePeriod;
  className?: string;
};

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2" aria-hidden>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex gap-1.5" aria-hidden>
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function PriceGuidePanel({ listingId, locale, currency, price, period, className }: PriceGuidePanelProps) {
  const t = useTranslations("pricing");
  const [state, setState] = useState<State>({ status: "loading", view: null });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ status: "loading", view: s.view }));
    const response = await loadListingPriceGuide({ listingId, currency, locale }).catch(() => null);
    if (mine !== seq.current) return;
    if (response?.ok) setState({ status: "done", view: response.data });
    else setState((s) => ({ status: "failed", code: response && !response.ok ? response.error : "network", view: s.view }));
  }, [listingId, currency, locale]);

  useEffect(() => {
    // Loads when the step opens and when the currency changes; the load sets the state itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load starts on mount
    void load();
  }, [load]);

  const view = state.view;
  const hotel = view?.dealType === "HOTEL_ROOM";

  return (
    <section
      aria-labelledby="price-guide-title"
      className={cn("grid min-w-0 gap-4 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6 [&>*]:min-w-0", className)}
      data-testid="price-guide-panel"
    >
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
          <ChartColumnIcon className="size-5" aria-hidden />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5 pt-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="price-guide-title" className="text-h3 text-foreground">
              {t("panel.title")}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" title={t("badgeHint")}>
              <EyeOffIcon className="size-3.5" aria-hidden />
              {t("badge")}
              <span className="sr-only">. {t("badgeHint")}</span>
            </span>
          </div>
          <p className="text-small text-pretty text-muted-foreground">{t("panel.lead")}</p>
        </div>
      </header>

      {state.status === "loading" && !view ? <PanelSkeleton label={t("panel.loading")} /> : null}

      {state.status === "failed" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 p-3" role="alert">
          <p className="flex min-w-0 items-start gap-2 text-sm text-pretty">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            {state.code === "rate_limited" ? t("panel.rateLimited") : t("panel.error")}
          </p>
          <Button type="button" variant="outline" size="sm" className="h-11 px-4 sm:h-9" onClick={() => void load()}>
            <RefreshCwIcon aria-hidden />
            {t("panel.retry")}
          </Button>
        </div>
      ) : null}

      {view ? (
        <div className={cn("grid gap-5", state.status === "loading" && "opacity-60 transition-opacity")} aria-busy={state.status === "loading"}>
          {view.needsCity ? (
            <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-pretty text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("panel.needsCity")}
            </p>
          ) : view.needsRooms ? (
            <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-pretty text-muted-foreground">
              <BedDoubleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("panel.needsRooms")}
            </p>
          ) : (
            view.items.map((item, i) => (
              <div key={item.roomTypeId ?? "listing"} className={cn("grid gap-2", i > 0 && "border-t border-border pt-5")}>
                <GuideView
                  guide={item.guide}
                  widened={item.widened}
                  dealType={view.dealType}
                  propertyType={view.propertyType}
                  place={view.place ?? { city: "", neighborhood: null }}
                  locale={locale}
                  title={hotel ? item.roomName : null}
                  mine={hotel ? { price: item.price, currency: item.currency, period: item.period } : { price, currency, period }}
                />
                {hotel ? <p className="text-xs text-muted-foreground">{t("panel.savedPrice")}</p> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
