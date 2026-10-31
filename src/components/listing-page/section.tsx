import type { ComponentType, ReactNode } from "react";
import { CheckIcon, XIcon, type LucideIcon, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** A listing page section: a divider, an h2 and its content. */
export function Section({
  id,
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-(--header-height) border-t pt-8", className)}>
      <div className="mb-5 grid gap-1">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {Icon ? <Icon className="size-5 text-primary" aria-hidden /> : null}
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
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
export function CheckItem({ ok, state, icon: Icon, children }: { ok: boolean; state: string; icon?: ComponentType<LucideProps>; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
          ok ? "bg-verified-soft text-verified" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {ok ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <XIcon className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="sr-only">{state}: </span>
      {Icon ? <Icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <span className={cn(!ok && "text-muted-foreground line-through decoration-muted-foreground/40")}>{children}</span>
    </li>
  );
}
