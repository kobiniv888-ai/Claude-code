import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** A headline number on the overview. With `href` the whole tile is a link to the list. */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "attention" | "urgent";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            tone === "urgent" ? "text-destructive" : tone === "attention" ? "text-foreground" : "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const className = cn(
    "block rounded-xl border bg-card p-4 shadow-xs",
    tone === "urgent" && "border-destructive/40",
    tone === "attention" && "border-border-strong/50",
  );
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(className, "outline-none transition-shadow hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {body}
    </Link>
  );
}
