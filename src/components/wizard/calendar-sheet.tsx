"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClockIcon, CheckIcon, RefreshCwIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { ErrorState } from "@/components/common/states";
import { HostCalendar } from "@/components/host-calendar/host-calendar";
import { IcalPanel } from "@/components/host-calendar/ical-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { HostCalendarData } from "@/lib/booking/host-calendar";
import { loadListingCalendar } from "@/lib/wizard/actions";

type Loaded = { data: HostCalendarData & { monthCount: number }; at: number };

/**
 * The place calendar inside the post form (bug 2.10): the host calendar (block dates, see
 * bookings) and the calendar sync, in a full-screen sheet over the form. "סיום" closes it and the
 * form is where it was — the same step and scroll position, nothing reloads. Its data loads at
 * each opening (bookings and blocks may have changed); links out of it (a booking, all bookings)
 * carry `returnTo`, so those pages get "חזרה למודעה".
 */
export function PlaceCalendarSheet({
  listingId,
  open,
  onOpenChange,
  returnTo,
}: {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form's address with its step ("/post/<id>?step=11"). */
  returnTo: string;
}) {
  const t = useTranslations("wizard.calendarSheet");
  const th = useTranslations("hostBooking.calendar");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const [attempt, setAttempt] = useState(0);

  // Loads at each opening (and on "Try again"): bookings and blocks may have changed.
  useEffect(() => {
    if (!open) return;
    const seq = ++request.current;
    loadListingCalendar(listingId).then(
      (res) => {
        if (seq !== request.current) return;
        if (res.ok) {
          setLoaded({ data: res.data, at: Date.now() });
          setFailed(false);
        } else {
          setFailed(true);
        }
      },
      () => {
        if (seq === request.current) setFailed(true);
      },
    );
  }, [open, listingId, attempt]);

  const data = loaded?.data;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={th("metaTitle")}
      size="full"
      className="md:max-w-3xl"
      footer={
        <Button type="button" block onClick={() => onOpenChange(false)}>
          <CheckIcon aria-hidden />
          {t("done")}
        </Button>
      }
    >
      <div className="grid gap-6 pb-2">
        <p className="text-small text-pretty text-muted-foreground">{th("lead")}</p>
        {data ? (
          <>
            <HostCalendar
              key={loaded.at}
              listingId={data.listing.id}
              today={data.today}
              monthCount={data.monthCount}
              owner={data.owner}
              booked={data.booked}
              imported={data.imported}
              bookings={data.bookings}
              returnTo={returnTo}
            />
            {data.listing.bookable && (
              <section aria-labelledby="sheet-sync-title" className="grid gap-3 border-t border-border pt-5">
                <div className="grid gap-1">
                  <h3 id="sheet-sync-title" className="flex items-center gap-2 text-h3">
                    <CalendarClockIcon className="size-5 text-primary-text" aria-hidden />
                    {th("syncTitle")}
                  </h3>
                  <p className="text-small text-pretty text-muted-foreground">{th("syncLead")}</p>
                </div>
                <IcalPanel
                  key={loaded.at}
                  listingId={data.listing.id}
                  exportUrl={data.listing.exportUrl}
                  importUrls={data.listing.importUrls}
                  syncedAt={data.listing.syncedAt}
                  importedNights={data.importedNights}
                  returnTo={returnTo}
                />
              </section>
            )}
          </>
        ) : failed ? (
          <ErrorState
            title={t("loadFailed")}
            action={
              <Button type="button" variant="secondary" onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}>
                <RefreshCwIcon aria-hidden />
                {t("retry")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4" aria-busy="true" aria-label={t("loading")}>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="size-11 rounded-full" />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {[0, 1].map((month) => (
                <div key={month} className="grid gap-2">
                  <Skeleton className="h-5 w-32" />
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 35 }, (_, day) => (
                      <Skeleton key={day} className="h-10 rounded-xl" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
