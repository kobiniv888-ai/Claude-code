import { ChevronRight, Inbox } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { listOutbox, OUTBOX_PAGE_SIZE, outboxTemplates } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/outbox">) {
  return adminContentMetadata(params, "outbox");
}

const STATUSES = ["QUEUED", "SENT", "FAILED", "LOGGED"] as const;
const STATUS_TONE: Record<(typeof STATUSES)[number], PillTone> = { QUEUED: "primary", SENT: "success", FAILED: "danger", LOGGED: "muted" };

export default async function OutboxPage({ params, searchParams }: PageProps<"/[locale]/admin/outbox">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("settings");
  const query = await searchParams;
  const templates = await outboxTemplates();
  const template = param(query, "template");
  const filters = {
    status: enumParam(query, "status", STATUSES),
    template: templates.includes(template) ? template : undefined,
    to: param(query, "to").slice(0, 120) || undefined,
  };
  const [t, tCommon, result] = await Promise.all([
    getTranslations("adminContent.outbox"),
    getTranslations("adminContent.common"),
    listOutbox(filters, pageParam(query)),
  ]);
  const filtered = Boolean(filters.status || filters.template || filters.to);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <AdminFilterBar
        fields={[
          { type: "search", name: "to", label: t("to"), placeholder: t("toPlaceholder") },
          { type: "select", name: "status", label: t("status"), allLabel: tCommon("all"), options: STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) })) },
          { type: "select", name: "template", label: t("template"), allLabel: tCommon("all"), options: templates.map((tpl) => ({ value: tpl, label: tpl })) },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={Inbox}
          title={filtered ? t("noMatchTitle") : t("emptyTitle")}
          description={filtered ? t("noMatchDescription") : t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/outbox/${row.id}`}
                className="flex items-center gap-3 p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <span dir="auto">{row.subject}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <Ltr className="break-all">{row.to}</Ltr>
                    <code className="font-mono" dir="ltr">
                      {row.template}
                    </code>
                    <span>{siteConfig.i18n.nativeNames[row.locale]}</span>
                    <span>
                      {formatDate(row.createdAt, locale)} {formatTime(row.createdAt, locale)}
                    </span>
                  </p>
                </div>
                <Pill tone={STATUS_TONE[row.status]}>{t(`statuses.${row.status}`)}</Pill>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination pathname="/admin/outbox" searchParams={query} page={result.page} pageSize={OUTBOX_PAGE_SIZE} total={result.total} />
    </>
  );
}
