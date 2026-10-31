"use client";

import { useLocale } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";

type Track = { label: string; steps: { title: string; text: string }[] };

/** Guests / owners tabs of the home "How it works" section. */
export function HowItWorksTabs({ guests, owners, label }: { guests: Track; owners: Track; label: string }) {
  const locale = useLocale();
  const tracks = { guests, owners } as const;
  return (
    <Tabs defaultValue="guests" dir={dirFor(locale)} className="gap-6">
      <TabsList aria-label={label} className="h-11 w-full rounded-full p-1 sm:w-fit">
        {(Object.keys(tracks) as (keyof typeof tracks)[]).map((key) => (
          <TabsTrigger key={key} value={key} className="rounded-full px-5 text-sm font-semibold">
            {tracks[key].label}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(tracks) as (keyof typeof tracks)[]).map((key) => (
        <TabsContent key={key} value={key}>
          <ol className="grid gap-4 md:grid-cols-3">
            {tracks[key].steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 rounded-2xl border bg-card p-5 shadow-xs md:flex-col">
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground"
                >
                  {formatNumber(index + 1, locale)}
                </span>
                <div className="grid gap-1.5">
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}
