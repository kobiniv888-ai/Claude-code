import { useTranslations } from "next-intl";
import type { TicketPriority, TicketStatus, TicketCategory } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { ticketCategoryIcons, ticketStatusIcons } from "./ticket-icons";
import { Siren } from "lucide-react";

/**
 * Status pill for a support ticket: Open → In progress → Waiting for you → Resolved → Closed.
 * Works in Server and Client Components (admin panel included: pass perspective="staff" so
 * WAITING_FOR_USER reads "Waiting for the user").
 */

const statusStyles: Record<TicketStatus, { pill: string; icon: string }> = {
  OPEN: { pill: "bg-secondary text-secondary-foreground ring-primary/15", icon: "text-primary" },
  IN_PROGRESS: { pill: "bg-accent text-accent-foreground ring-primary/20", icon: "text-primary-text" },
  WAITING_FOR_USER: { pill: "bg-surface-muted text-foreground ring-border-strong/40", icon: "text-foreground" },
  RESOLVED: { pill: "bg-primary-tint text-foreground ring-success/30", icon: "text-success" },
  CLOSED: { pill: "bg-muted text-muted-foreground ring-border", icon: "text-muted-foreground" },
};

const sizes = {
  sm: "h-6 gap-1 px-2 text-xs [&_svg]:size-3.5",
  md: "h-7 gap-1.5 px-2.5 text-sm [&_svg]:size-4",
} as const;

export function TicketStatusBadge({
  status,
  perspective = "user",
  size = "sm",
  className,
}: {
  status: TicketStatus;
  perspective?: "user" | "staff";
  size?: keyof typeof sizes;
  className?: string;
}) {
  const t = useTranslations("tickets");
  const Icon = ticketStatusIcons[status];
  const style = statusStyles[status];
  const label = perspective === "staff" ? t(`statusStaff.${status}`) : t(`status.${status}`);
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:shrink-0",
        sizes[size],
        style.pill,
        className,
      )}
    >
      <Icon aria-hidden="true" className={style.icon} />
      {label}
    </span>
  );
}

/** Category with its icon, e.g. "Report a scam". */
export function TicketCategoryLabel({
  category,
  className,
}: {
  category: TicketCategory;
  className?: string;
}) {
  const t = useTranslations("tickets");
  const Icon = ticketCategoryIcons[category];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", category === "SCAM_REPORT" && "text-primary-text")} />
      <span className="truncate">{t(`category.${category}.label`)}</span>
    </span>
  );
}

/** "Urgent" marker for scam reports (shown only for URGENT priority). */
export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  const t = useTranslations("tickets");
  if (priority !== "URGENT") return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground",
        className,
      )}
    >
      <Siren aria-hidden="true" className="size-3.5" />
      {t("priority.URGENT")}
    </span>
  );
}
