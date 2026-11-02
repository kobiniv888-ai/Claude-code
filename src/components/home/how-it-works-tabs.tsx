"use client";

import { useLocale } from "next-intl";
import { HousePlus, MessageCircle, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dirFor } from "@/i18n/locale";
import { cn } from "@/lib/utils";

export type StepIcon = "search" | "check" | "chat" | "post" | "pledge";
type Track = { label: string; steps: { number: string; stepLabel: string; icon: StepIcon; title: string; text: string }[] };

const ICONS: Record<StepIcon, LucideIcon | IconComponent> = {
  search: Search,
  check: ShieldCheck,
  chat: MessageCircle,
  post: HousePlus,
  pledge: WelcomeHomeIcon,
};

/** Soft card colors, one per step (livo-style numbered cards). */
const TONES = [
  "bg-primary-tint text-primary-text",
  "bg-primary-tint text-primary-text",
  "bg-primary-tint text-success",
] as const;

/** Guests / owners tabs of the home "How it works" section: three numbered step cards. */
export function HowItWorksTabs({ guests, owners, label }: { guests: Track; owners: Track; label: string }) {
  const locale = useLocale();
  const tracks = { guests, owners } as const;
  const keys = Object.keys(tracks) as (keyof typeof tracks)[];
  return (
    <Tabs defaultValue="guests" dir={dirFor(locale)} className="gap-5">
      <TabsList aria-label={label} className="h-12 w-full rounded-full bg-muted p-1 sm:w-fit">
        {keys.map((key) => (
          <TabsTrigger
            key={key}
            value={key}
            className="h-10 flex-1 rounded-full px-5 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-none"
          >
            {tracks[key].label}
          </TabsTrigger>
        ))}
      </TabsList>
      {keys.map((key) => (
        <TabsContent key={key} value={key}>
          <ol className="grid gap-3 sm:gap-4 md:grid-cols-3">
            {tracks[key].steps.map((step, index) => {
              const Icon = ICONS[step.icon];
              return (
                <li key={step.title} className={cn("relative flex items-start gap-4 rounded-card p-4 sm:p-5 md:flex-col", TONES[index % TONES.length])}>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-14 items-center justify-center rounded-input bg-card text-h2 font-extrabold tabular-nums shadow-xs"
                    >
                      {step.number}
                    </span>
                    <Icon className="absolute end-4 top-4 size-6 opacity-70 md:static md:size-7 md:opacity-100" aria-hidden="true" />
                  </span>
                  <div className="grid gap-1 pe-8 md:pe-0">
                    <h3 className="text-h3 text-foreground">
                      <span className="sr-only">{step.stepLabel}: </span>
                      {step.title}
                    </h3>
                    <p className="text-small text-pretty text-foreground/80">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}
