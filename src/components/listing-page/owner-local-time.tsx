"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { formatTime } from "@/lib/format";

/** The owner's local time right now, ticking every 30 seconds. */
export function OwnerLocalTime({ timeZone, initial }: { timeZone: string; initial: string }) {
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time dateTime={now.toISOString()} suppressHydrationWarning className="tabular-nums">
      {formatTime(now, locale, timeZone)}
    </time>
  );
}
