import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Calm amber notice: "Draft — to be reviewed by a lawyer before launch". */
export function LawyerReviewNotice({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border-strong/30 bg-surface-muted p-4 sm:gap-4 sm:p-5",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted/15 text-foreground"
      >
        <Scale className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {children ? <p className="mt-1 text-sm leading-relaxed text-foreground/80">{children}</p> : null}
      </div>
    </aside>
  );
}
