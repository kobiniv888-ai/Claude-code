"use client";

import { Moon, Sun } from "lucide-react";
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
import { THEMES } from "./theme-segmented";

export { THEMES, ThemeSegmented, useMounted } from "./theme-segmented";

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
