import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeInfo = {
  icon: LucideIcon;
  label: ReactNode;
  body: ReactNode;
  tag?: ReactNode;
  comingSoon?: boolean;
};

/** The verification badges explained, each with a preview of how the badge looks. */
export function VerificationBadgeGrid({ items, className }: { items: BadgeInfo[]; className?: string }) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {items.map(({ icon: Icon, label, body, tag, comingSoon }, index) => (
        <li key={index} className="flex flex-col rounded-2xl border bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                comingSoon ? "bg-muted text-foreground" : "bg-primary-tint text-foreground",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn("size-4", comingSoon ? "text-muted-foreground" : "text-success")}
                strokeWidth={2}
              />
              {label}
            </span>
            {tag ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  comingSoon ? "bg-accent text-accent-foreground" : "border text-muted-foreground",
                )}
              >
                {tag}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[0.9375rem]">{body}</p>
        </li>
      ))}
    </ul>
  );
}
