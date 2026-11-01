"use client";

import { BottomSheet, useIsDesktop } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { HolidayCalendar } from "@/components/search/holiday-calendar";
import type { HolidayMark } from "@/lib/search/holiday-marks";

/**
 * "When?" of the home search card: the Jewish-holiday calendar in a bottom sheet on phones (one
 * month) and a dialog on larger screens (two months). Loaded only when first opened.
 */
export function HomeDatesSheet({
  open,
  onOpenChange,
  checkIn,
  checkOut,
  onChange,
  holidays,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  holidays: HolidayMark[];
  labels: { title: string; done: string; clear: string };
}) {
  const desktop = useIsDesktop();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={labels.title}
      onClear={checkIn ? () => onChange(null, null) : undefined}
      clearLabel={labels.clear}
      className="md:max-w-[44rem]"
      footer={
        <Button block size="lg" onClick={() => onOpenChange(false)}>
          {labels.done}
        </Button>
      }
    >
      <div className="mx-auto w-fit max-w-full py-2">
        <HolidayCalendar
          mode="range"
          holidays={holidays}
          numberOfMonths={desktop ? 2 : 1}
          checkIn={checkIn}
          checkOut={checkOut}
          onChange={(nextIn, nextOut) => {
            onChange(nextIn, nextOut);
            if (nextIn && nextOut) window.setTimeout(() => onOpenChange(false), 250);
          }}
        />
      </div>
    </BottomSheet>
  );
}
