import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./tones";

const sizes = {
  sm: "size-10 [&>svg]:size-5",
  md: "size-12 [&>svg]:size-6",
  lg: "size-16 [&>svg]:size-8",
} as const;

/** A Lucide icon in a soft tinted circle. Decorative — hidden from screen readers. */
export function IconCircle({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        toneClasses[tone],
        sizes[size],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
