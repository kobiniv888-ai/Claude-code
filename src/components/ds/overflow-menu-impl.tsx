"use client";

import { Button } from "@/components/ds/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OverflowMenuIcon, type OverflowMenuProps } from "./overflow-menu";

/**
 * The Radix dropdown behind `OverflowMenu` (ds/overflow-menu.tsx). Only imported from there,
 * through a lazy import: a static import anywhere puts the menu code back into the page's first load.
 */
export function OverflowMenuImpl({
  label,
  items,
  contentClassName,
  variant = "outline",
  icon,
  side = "top",
  open,
  onOpenChange,
}: OverflowMenuProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="icon" aria-label={label}>
          <OverflowMenuIcon icon={icon} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} sideOffset={side === "top" ? 10 : 4} className={cn("rounded-xl p-1.5", contentClassName)}>
        {items.map((item, index) =>
          item === "separator" ? (
            <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.key}
              className={cn("min-h-11 gap-3 rounded-lg", item.tone === "destructive" && "text-destructive focus:text-destructive")}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.hint ? (
                <span className="grid">
                  {item.label}
                  <span className="text-caption text-muted-foreground">{item.hint}</span>
                </span>
              ) : (
                item.label
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
