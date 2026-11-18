import type { ReactNode } from "react";
import { CloudOff, Inbox, MapPinOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Designed empty, error and not-found states: an icon, a friendly title, one or two sentences
 * and a clear next step. Server- and client-safe.
 *
 *   <EmptyState
 *     icon={Heart}
 *     title={t("favorites.emptyTitle")}
 *     description={t("favorites.emptyText")}
 *     action={{ label: t("favorites.browse"), href: "/search" }}
 *   />
 *
 * `action` / `secondaryAction` take { label, href } (a link) or { label, onClick } (client only),
 * or any element. Use `bordered` inside a page section, leave it off for a full-page state.
 */

export type StateAction =
  | { label: string; href: string; icon?: LucideIcon }
  | { label: string; onClick: () => void; icon?: LucideIcon };

type Tone = "primary" | "muted" | "danger" | "warning";

const toneStyles: Record<Tone, string> = {
  primary: "bg-secondary text-primary ring-primary/10",
  muted: "bg-muted text-muted-foreground ring-foreground/5",
  danger: "bg-destructive/10 text-destructive ring-destructive/15",
  warning: "bg-surface-muted text-foreground ring-border-strong/20",
};

export type StateProps = {
  icon?: LucideIcon;
  /** Small text above the title ("Error 404"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: StateAction | ReactNode;
  secondaryAction?: StateAction | ReactNode;
  /** Extra content under the actions (links, a reference code…). */
  children?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  /** Dashed card around the state (for a section inside a page). */
  bordered?: boolean;
  /** The heading level of the title (default h2; full-page states use h1). */
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
};

function isStateAction(value: unknown): value is StateAction {
  return typeof value === "object" && value !== null && "label" in value && ("href" in value || "onClick" in value);
}

function ActionButton({ action, variant }: { action: StateAction; variant: "default" | "outline" }) {
  const Icon = action.icon;
  const className = cn("h-11 rounded-xl px-5 text-sm", variant === "outline" && "bg-card");
  const content = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      {action.label}
    </>
  );
  if ("href" in action) {
    return (
      <Button asChild variant={variant} className={className}>
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} className={className} onClick={action.onClick}>
      {content}
    </Button>
  );
}

function renderAction(action: StateProps["action"], variant: "default" | "outline") {
  if (!action) return null;
  return isStateAction(action) ? <ActionButton action={action} variant={variant} /> : action;
}

export function StateView({
  icon: Icon = Inbox,
  eyebrow,
  title,
  description,
  action,
  secondaryAction,
  children,
  tone = "primary",
  size = "md",
  bordered = false,
  headingLevel: Heading = "h2",
  className,
}: StateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col items-center text-center",
        size === "sm" && "max-w-sm gap-3 py-8",
        size === "md" && "max-w-md gap-4 py-12",
        size === "lg" && "max-w-xl gap-5 py-16 sm:py-24",
        bordered && "max-w-none rounded-2xl border border-dashed bg-card px-6",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex items-center justify-center rounded-2xl ring-8",
          size === "sm" ? "size-11 [&_svg]:size-5" : "size-14 [&_svg]:size-6.5",
          size === "lg" && "size-16 [&_svg]:size-7.5",
          toneStyles[tone],
        )}
      >
        <Icon strokeWidth={1.75} />
      </span>
      <div className="grid gap-2">
        {eyebrow ? <p className="text-sm font-semibold text-accent-foreground">{eyebrow}</p> : null}
        <Heading
          className={cn(
            "font-bold tracking-tight text-balance text-foreground",
            size === "sm" ? "text-lg" : size === "md" ? "text-xl" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className={cn("text-pretty text-muted-foreground", size === "lg" ? "text-base sm:text-lg" : "text-sm sm:text-base")}>
            {description}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex w-full flex-col items-stretch justify-center gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          {renderAction(action, "default")}
          {renderAction(secondaryAction, "outline")}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Nothing to show yet (no results, no favorites…). */
export function EmptyState(props: StateProps) {
  return <StateView icon={Inbox} tone="primary" {...props} />;
}

/** Something failed to load — offer a retry and another way forward. */
export function ErrorState(props: StateProps) {
  return <StateView icon={CloudOff} tone="danger" {...props} />;
}

/** The listing, profile or page does not exist (any more). */
export function NotFoundState(props: StateProps) {
  return <StateView icon={MapPinOff} tone="primary" {...props} />;
}
