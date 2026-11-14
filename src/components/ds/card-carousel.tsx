"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { dirFor } from "@/i18n/locale";
import { cn } from "@/lib/utils";

/**
 * A horizontal row of cards with CSS scroll-snap: on phones each card is ~85% wide so the next
 * one peeks in; on desktop 2–4 fit. Round arrow buttons on devices with a mouse.
 * Put it edge to edge (it adds the page gutter itself).
 *
 *   <CardCarousel label="נכסים חדשים">{cards.map((c) => <ListingCard key={c.id} listing={c} />)}</CardCarousel>
 */
export function CardCarousel({
  label,
  children,
  itemClassName = "basis-[85%] sm:basis-[46%] lg:basis-[31.5%] xl:basis-[23.6%]",
  className,
}: {
  /** Accessible name of the list. */
  label: string;
  children: React.ReactNode;
  /** Width of each card (flex-basis classes). */
  itemClassName?: string;
  className?: string;
}) {
  const t = useTranslations("ds.carousel");
  const rtl = dirFor(useLocale()) === "rtl";
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft);
      setEdges({ start: pos < 4, end: pos > max - 4 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const page = useCallback(
    (step: 1 | -1) => {
      const el = scroller.current;
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollBy({ left: step * el.clientWidth * 0.9 * (rtl ? -1 : 1), behavior: reduce ? "auto" : "smooth" });
    },
    [rtl],
  );

  const arrow =
    "absolute top-[30%] z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground outline-none transition-opacity duration-(--motion-fast) hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-fine:inline-flex disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={scroller}
        aria-label={label}
        className="flex snap-x snap-mandatory scroll-px-gutter gap-4 overflow-x-auto overscroll-x-contain px-gutter pb-2 scrollbar-none"
      >
        {Children.map(children, (child) =>
          child ? <li className={cn("min-w-0 shrink-0 snap-start", itemClassName)}>{child}</li> : null,
        )}
      </ul>
      <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label={t("previous")} className={cn(arrow, "start-2")}>
        <ChevronStart className="size-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label={t("next")} className={cn(arrow, "end-2")}>
        <ChevronEnd className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
