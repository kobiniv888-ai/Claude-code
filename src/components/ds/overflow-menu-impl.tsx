"use client";

import { EllipsisIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { OverflowMenuProps } from "./overflow-menu";

/**
 * The Radix dropdown behind `OverflowMenu` (ds/overflow-menu.tsx). Only imported from there,
 * through a lazy import: a static import anywhere puts the menu code back into the page's first load.
 */
export function OverflowMenuImpl({
  label,
  items,
  contentClassName,
  open,
  onOpenChange,
}: OverflowMenuProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={10} className={cn("rounded-xl p-1.5", contentClassName)}>
        {items.map((item, index) =>
          item === "separator" ? (
            <DropdownMenuSeparator key={`separator-${index}`} />
          ) : (
            <DropdownMenuItem key={item.key} className="min-h-11 gap-3 rounded-lg" disabled={item.disabled} onSelect={item.onSelect}>
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
