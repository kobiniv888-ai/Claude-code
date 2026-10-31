"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSetTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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

/** Header button: light / dark / device setting. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("nav.theme");
  const { theme } = useTheme();
  const setTheme = useSetTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-10 rounded-full", className)} aria-label={t("change")}>
          <Sun aria-hidden className="size-[18px] dark:hidden" />
          <Moon aria-hidden className="hidden size-[18px] dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-48 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 text-xs font-medium text-muted-foreground">{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          {THEMES.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2.5 py-2 ps-2">
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              {t(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
