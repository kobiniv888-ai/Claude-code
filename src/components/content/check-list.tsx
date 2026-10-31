import { CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A list with a check (or another) icon in front of each item. */
export function CheckList({
  items,
  icon: Icon = CircleCheck,
  iconClassName = "text-verified",
  className,
}: {
  items: ReactNode[];
  icon?: LucideIcon;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-3 leading-relaxed">
          <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", iconClassName)} strokeWidth={1.9} />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
