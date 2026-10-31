import { LifeBuoy, MessageSquareText, Siren } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { TicketCategoryLabel, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam } from "@/lib/admin/params";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/server/shared";
import {
  listStaffTickets,
  TICKET_ASSIGNED_FILTERS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUS_FILTERS,
  type TicketQueueRow,
} from "@/lib/admin/server/tickets";
import { requireStaff } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/tickets">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.tickets" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function TicketsPage({ params, searchParams }: PageProps<"/[locale]/admin/tickets">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("tickets");
  const query = await searchParams;
  const filters = {
    status: enumParam(query, "status", TICKET_STATUS_FILTERS, "active"),
    category: enumParam(query, "category", TICKET_CATEGORIES),
    priority: enumParam(query, "priority", TICKET_PRIORITIES),
    assigned: enumParam(query, "assigned", TICKET_ASSIGNED_FILTERS),
  };
  const page = pageParam(query);
  const [t, tAdmin, tTickets, tReplies, result] = await Promise.all([
    getTranslations("admin.tickets"),
    getTranslations("admin"),
    getTranslations("tickets"),
    getTranslations("adminContent.savedReplies"),
    listStaffTickets(filters, staff.id, page),
  ]);

  return (
    <>
      <AdminPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/admin/tickets/saved-replies">
              <MessageSquareText aria-hidden />
              {tReplies("title")}
            </Link>
          </Button>
        }
      />
      <AdminFilterBar
        fields={[
          {
            type: "select",
            name: "status",
            label: t("filters.status"),
            defaultValue: "active",
            options: TICKET_STATUS_FILTERS.map((s) => ({
              value: s,
              label: s === "active" ? t("filters.active") : s === "all" ? tAdmin("filters.all") : tTickets(`statusStaff.${s}`),
            })),
          },
          {
            type: "select",
            name: "category",
            label: t("filters.category"),
            allLabel: tAdmin("filters.all"),
            options: TICKET_CATEGORIES.map((c) => ({ value: c, label: tTickets(`category.${c}.label`) })),
          },
          {
            type: "select",
            name: "priority",
            label: t("filters.priority"),
            allLabel: tAdmin("filters.all"),
            options: TICKET_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })),
          },
          {
            type: "select",
            name: "assigned",
            label: t("filters.assigned"),
            allLabel: tAdmin("filters.all"),
            options: TICKET_ASSIGNED_FILTERS.map((a) => ({ value: a, label: t(`assigned.${a}`) })),
          },
        ]}
      />

      {result.pinned.length > 0 && result.page === 1 ? (
        <section aria-labelledby="urgent-title" className="mb-4">
          <h2 id="urgent-title" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <Siren aria-hidden className="size-4" />
            {t("urgentTitle", { count: result.pinned.length })}
          </h2>
          <TicketRows rows={result.pinned} urgent />
        </section>
      ) : null}

      {result.rows.length === 0 && result.pinned.length === 0 ? (
        <EmptyState bordered icon={LifeBuoy} title={t("empty")} description={t("emptyDescription")} />
      ) : result.rows.length > 0 ? (
        <TicketRows rows={result.rows} />
      ) : null}
      <AdminPagination pathname="/admin/tickets" searchParams={query} page={result.page} pageSize={ADMIN_PAGE_SIZE} total={result.total} />
    </>
  );
}

async function TicketRows({ rows, urgent = false }: { rows: TicketQueueRow[]; urgent?: boolean }) {
  const t = await getTranslations("admin.tickets");
  return (
    <ul className={cn("divide-y overflow-hidden rounded-xl border bg-card shadow-xs", urgent && "border-destructive/40")}>
      {rows.map((row) => {
        const last = row.messages[0];
        const waitingForUs = last && !last.fromStaff && row.status !== "RESOLVED" && row.status !== "CLOSED";
        return (
          <li key={row.id} className="relative flex flex-col gap-1 p-3 transition-colors hover:bg-muted/40 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Ltr className="font-mono text-xs text-muted-foreground">#{row.number}</Ltr>
                <Link
                  href={`/admin/tickets/${row.id}`}
                  className="min-w-0 font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                >
                  <span dir="auto" className="line-clamp-1">
                    {row.subject}
                  </span>
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <TicketPriorityBadge priority={row.priority} />
                <TicketStatusBadge status={row.status} perspective="staff" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <TicketCategoryLabel category={row.category} className="text-xs" />
              <span dir="auto">{row.user?.name ?? row.guestName ?? t("guest")}</span>
              {row.listing ? <PublicId id={row.listing.publicId} /> : null}
              <span>{row.assignedTo ? t("assignedTo", { name: row.assignedTo.name }) : t("unassigned")}</span>
              <span>{t("messages", { count: row._count.messages })}</span>
              <WhenText date={row.lastMessageAt} />
              {waitingForUs ? <span className="font-medium text-primary">{t("waitingForUs")}</span> : null}
            </div>
            {last ? (
              <p className="line-clamp-1 text-sm text-muted-foreground" dir="auto">
                {last.body}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
