import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Ltr } from "@/components/common/ltr";
import { siteConfig } from "@/config/site";
import { getOutboxEmail } from "@/lib/admin/content/server/queries";
import { resendBlock } from "@/lib/admin/outbox";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/format";
import { ResendButton } from "./_components/resend-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/outbox/[id]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adminContent.outbox" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

const STATUS_TONE: Record<string, PillTone> = { QUEUED: "primary", SENT: "success", FAILED: "danger", LOGGED: "muted" };

export default async function OutboxEmailPage({ params }: PageProps<"/[locale]/admin/outbox/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("settings");
  const [t, email] = await Promise.all([getTranslations("adminContent.outbox"), getOutboxEmail(id)]);
  if (!email) notFound();
  const when = (d: Date) => `${formatDate(d, locale)} ${formatTime(d, locale)}`;
  // "Send again" (round 3): only once Resend is set up, only for emails that can really go out.
  const resendConfigured = isEmailDeliveryConfigured();
  const block = resendBlock(email, resendConfigured);

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/outbox", label: t("back") }}
        title={<span dir="auto">{email.subject}</span>}
        meta={<Pill tone={STATUS_TONE[email.status] ?? "muted"}>{t(`statuses.${email.status}`)}</Pill>}
        actions={block === null ? <ResendButton id={email.id} to={email.to} when={when(email.createdAt)} /> : null}
      />
      {email.status === "LOGGED" && block !== null ? (
        <p className="mb-5 rounded-xl border bg-card p-3 text-sm text-muted-foreground">{t(`resend.blocked.${block}`)}</p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <AdminSection title={t("details")} className="h-fit">
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: t("to"), value: <Ltr className="break-all">{email.to}</Ltr> },
              { label: t("template"), value: <code className="font-mono text-xs" dir="ltr">{email.template}</code> },
              { label: t("language"), value: siteConfig.i18n.nativeNames[email.locale] },
              { label: t("created"), value: when(email.createdAt) },
              { label: t("sent"), value: email.sentAt ? when(email.sentAt) : t("notSent") },
              { label: t("provider"), value: email.provider ? <Ltr>{email.provider}</Ltr> : "—" },
              ...(email.error ? [{ label: t("error"), value: <span className="text-destructive" dir="ltr">{email.error}</span> }] : []),
            ]}
          />
        </AdminSection>
        <div className="flex min-w-0 flex-col gap-5">
          <AdminSection title={t("preview")} description={t("previewNote")} bodyClassName="p-0">
            <iframe
              title={t("previewFrame", { subject: email.subject })}
              srcDoc={email.html}
              sandbox=""
              referrerPolicy="no-referrer"
              className="block h-[70vh] min-h-96 w-full rounded-b-xl bg-white"
            />
          </AdminSection>
          {email.text ? (
            <AdminSection title={t("textVersion")}>
              <pre className="max-h-96 overflow-auto text-sm break-words whitespace-pre-wrap" dir="auto">
                {email.text}
              </pre>
            </AdminSection>
          ) : null}
        </div>
      </div>
    </>
  );
}
