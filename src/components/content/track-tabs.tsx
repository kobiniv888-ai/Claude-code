"use client";

import { useLocale } from "next-intl";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useSyncExternalStore, type ReactNode } from "react";
import { dirFor } from "@/i18n/locale";

export type Track = { value: string; label: string; icon?: ReactNode; content: ReactNode };

// The selected track lives in the URL hash (#guests / #owners) so it can be linked to.
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("hashchange", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("hashchange", callback);
  };
}
const readHash = () => window.location.hash.slice(1);
const readServerHash = () => "";

/**
 * Two (or more) tracks as tabs. Every panel is rendered on the server (forceMount) and inactive
 * panels are hidden, so search engines and no-JS visitors still get all the content.
 */
export function TrackTabs({ label, tracks }: { label: string; tracks: Track[] }) {
  const locale = useLocale();
  const hash = useSyncExternalStore(subscribe, readHash, readServerHash);
  const value = tracks.some((track) => track.value === hash) ? hash : tracks[0]?.value;

  function select(next: string) {
    window.history.replaceState(null, "", `#${next}`);
    listeners.forEach((listener) => listener());
  }

  return (
    <TabsPrimitive.Root value={value} onValueChange={select} dir={dirFor(locale)} activationMode="manual">
      <TabsPrimitive.List
        aria-label={label}
        className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 rounded-2xl bg-muted p-1.5"
      >
        {tracks.map((track) => (
          <TabsPrimitive.Trigger
            key={track.value}
            value={track.value}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card sm:text-base [&_svg]:size-4.5 [&_svg]:shrink-0"
          >
            {track.icon}
            {track.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tracks.map((track) => (
        <TabsPrimitive.Content
          key={track.value}
          value={track.value}
          forceMount
          className="mt-8 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=inactive]:hidden sm:mt-10"
        >
          {track.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
