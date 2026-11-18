"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSetTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

// The three-way switch (side menu) lives apart from the dropdown in ./theme-toggle.tsx, so the side
// menu, which loads once the page is idle, does not bring the dropdown menu code with it.

export const THEMES = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

const subscribe = () => () => {};
/** False during server rendering and hydration, true afterwards (the saved theme is only known then). */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** Three-way switch for menus and settings pages. */
export function ThemeSegmented({ className }: { className?: string }) {
  const t = useTranslations("nav.theme");
  const { theme } = useTheme();
  const setTheme = useSetTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : null;
  return (
    <div role="group" aria-label={t("label")} className={cn("grid grid-cols-3 gap-1 rounded-xl bg-muted p-1", className)}>
      {THEMES.map(({ value, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "bg-card text-foreground shadow-xs",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {t(value)}
          </button>
        );
      })}
    </div>
  );
}
