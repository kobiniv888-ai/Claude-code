import type { ComponentType, ReactNode } from "react";
import { CheckIcon, XIcon, type LucideIcon, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** A listing page section: a thin divider, a big bold h2 (Zillow style) and its content. */
export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Shown on the end side of the title (e.g. a "Show all" link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-(--header-height) border-t border-border/70 pt-8", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="grid gap-1">
          <h2 id={`${id}-title`} className="text-h2 text-foreground">
            {title}
          </h2>
          {description ? <p className="text-small text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One "label — value" row in a definition list. */
export function InfoRow({ icon: Icon, label, children }: { icon?: LucideIcon; label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon ? <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> : null}
      <dt className="min-w-0 flex-1 text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{children}</dd>
    </div>
  );
}

/** A check or a cross with a label (Shabbat checklist, house rules). `state` is read by screen readers. */
export function CheckItem({
  ok,
  state,
  icon: Icon,
  strike = true,
  children,
}: {
  ok: boolean;
  state: string;
  icon?: ComponentType<LucideProps>;
  /** Strike a missing item through; false when the text already says it is missing ("No space for a sukkah"). */
  strike?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
          ok ? "bg-primary-tint text-primary-text" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {ok ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <XIcon className="size-3.5" strokeWidth={3} />}
      </span>
      {strike || ok ? <span className="sr-only">{state}: </span> : null}
      {Icon ? <Icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <span className={cn(!ok && "text-muted-foreground", !ok && strike && "line-through decoration-muted-foreground/40")}>{children}</span>
    </li>
  );
}
