import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconCircle } from "./icon-circle";
import type { Tone } from "./tones";

/** One numbered step (render inside an <ol>). */
export function StepCard({
  icon,
  tone = "primary",
  step,
  title,
  children,
  extra,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  /** "Step 1" */
  step: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex flex-col rounded-2xl border bg-card p-5 text-card-foreground shadow-card sm:p-6", className)}>
      <div className="flex items-center gap-3">
        <IconCircle icon={icon} tone={tone} />
        <span className="text-sm font-semibold text-accent-foreground">{step}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-balance">{title}</h3>
      {children ? <p className="mt-1.5 leading-relaxed text-pretty text-muted-foreground">{children}</p> : null}
      {extra ? <div className="mt-4">{extra}</div> : null}
    </li>
  );
}

/** Small rounded chips (e.g. the Jewish-friendly filters). */
export function ChipList({ items }: { items: { icon: LucideIcon; label: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(({ icon: Icon, label }, index) => (
        <li
          key={index}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-medium"
        >
          <Icon aria-hidden="true" className="size-4 text-primary-text" strokeWidth={1.9} />
          {label}
        </li>
      ))}
    </ul>
  );
}
