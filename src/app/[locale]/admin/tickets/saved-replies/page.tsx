import { getTranslations, setRequestLocale } from "next-intl/server";
import { SavedRepliesManager } from "@/components/admin/content/saved-replies-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { listSavedReplies } from "@/lib/admin/content/server/queries";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/tickets/saved-replies">) {
  return adminContentMetadata(params, "savedReplies");
}

/** Saved replies for support tickets: ready answers in 5 languages, picked in the ticket reply box. */
export default async function SavedRepliesPage({ params }: PageProps<"/[locale]/admin/tickets/saved-replies">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("tickets");
  const [t, items] = await Promise.all([
    getTranslations("adminContent.savedReplies"),
    listSavedReplies(),
  ]);
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/tickets", label: t("backToTickets") }} title={t("title")} description={t("description")} />
      <div className="max-w-4xl">
        <SavedRepliesManager items={items} />
      </div>
    </>
  );
}
