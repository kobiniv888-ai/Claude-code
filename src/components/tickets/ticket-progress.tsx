import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TicketStatus } from "@/generated/prisma/enums";
import { TICKET_STATUSES, statusStepIndex } from "@/lib/tickets/constants";
import { cn } from "@/lib/utils";
import { ticketStatusIcons } from "./ticket-icons";

/**
 * The ticket's place on Open → In progress → Waiting for you → Resolved → Closed.
 * Phones show a segmented bar with the current step; wider screens show every step.
 */
export function TicketProgress({
  status,
  perspective = "user",
  className,
}: {
  status: TicketStatus;
  perspective?: "user" | "staff";
  className?: string;
}) {
  const t = useTranslations("tickets");
  const current = statusStepIndex(status);
  const label = (s: TicketStatus) => (perspective === "staff" ? t(`statusStaff.${s}`) : t(`status.${s}`));
  const CurrentIcon = ticketStatusIcons[status];

  return (
    <section aria-labelledby="ticket-progress-title" className={cn("rounded-2xl border bg-card p-4 shadow-card sm:p-5", className)}>
      <h2 id="ticket-progress-title" className="sr-only">
        {t("progress.title")}
      </h2>

      {/* Phones: one line with the current step and a segmented bar. */}
      <div className="sm:hidden">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CurrentIcon aria-hidden="true" className="size-4 text-primary" />
          {t("progress.step", { current: String(current + 1), total: String(TICKET_STATUSES.length) })}
          <span className="text-muted-foreground">·</span>
          <span>{label(status)}</span>
        </p>
        <div aria-hidden="true" className="mt-3 grid grid-cols-5 gap-1.5">
          {TICKET_STATUSES.map((s, i) => (
            <span key={s} className={cn("h-1.5 rounded-full", i <= current ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      {/* Wider screens: every step. */}
      <ol className="hidden grid-cols-5 sm:grid">
        {TICKET_STATUSES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const Icon = ticketStatusIcons[s];
          return (
            <li
              key={s}
              aria-current={active ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center gap-2 text-center"
            >
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-4 end-1/2 h-0.5 w-full -translate-y-1/2",
                    i <= current ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 flex size-8 items-center justify-center rounded-full border-2 bg-card transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary ring-4 ring-primary/15",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span
                className={cn(
                  "px-1 text-xs leading-tight break-words",
                  active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="sr-only">
                  {done ? t("progress.done") : active ? t("progress.current") : t("progress.upcoming")}:{" "}
                </span>
                {label(s)}
              </span>
            </li>
          );
        })}
      </ol>

      {perspective === "user" ? (
        <p className="mt-4 border-t pt-3 text-sm text-pretty text-muted-foreground">{t(`statusHint.${status}`)}</p>
      ) : null}
    </section>
  );
}
