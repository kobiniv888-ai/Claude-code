import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small status pill (works in server and client components). */

const PILL =
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0";

export type PillTone = "success" | "warning" | "danger" | "muted" | "primary" | "demo";

const TONES: Record<PillTone, string> = {
  success: "bg-verified-soft text-foreground ring-verified/30",
  warning: "bg-warning-soft text-foreground ring-warning/40",
  danger: "bg-destructive/10 text-destructive ring-destructive/30",
  muted: "bg-muted text-muted-foreground ring-border",
  primary: "bg-primary/10 text-primary ring-primary/20",
  demo: "bg-terracotta/10 text-foreground ring-terracotta/40",
};

export function Pill({ tone, icon: Icon, children, className }: { tone: PillTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn(PILL, TONES[tone], className)}>
      {Icon ? <Icon aria-hidden /> : null}
      {children}
    </span>
  );
}
