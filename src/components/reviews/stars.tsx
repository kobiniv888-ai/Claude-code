import { SpriteIcon } from "@/components/ds/sprite-icons";
import { cn } from "@/lib/utils";

/**
 * Five stars for a 1–5 rating (filled up to `value`), drawn from the icon sprite: no JavaScript,
 * fine in server and client components. `label` is what a screen reader hears ("4 מתוך 5
 * כוכבים"); the stars themselves are hidden from it. Filled stars take the text colour (the
 * design has one accent, purple, kept for actions), empty ones the strong border colour.
 */
export function Stars({ value, label, size = "sm", className }: { value: number; label: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const icon = size === "xs" ? "size-3.5" : size === "md" ? "size-6" : "size-4.5";
  return (
    <span role="img" aria-label={label} className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <SpriteIcon
          key={n}
          name="star"
          className={cn(icon, n <= Math.round(value) ? "fill-current text-foreground" : "text-muted-foreground")}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

/** One filled star and the average: "★ 4.7". The text is the caller's (already formatted). */
export function StarValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", className)}>
      <SpriteIcon name="star" className="size-4 fill-current text-foreground" strokeWidth={1.75} />
      {children}
    </span>
  );
}
