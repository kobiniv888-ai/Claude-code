"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderIcon, PencilIcon, PlusIcon, Share2Icon, Trash2Icon, UsersIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Chip } from "@/components/ds/chip";
import { OverflowMenu } from "@/components/ds/overflow-menu";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { createListAction, deleteListAction, renameListAction } from "@/lib/lists/actions";
import { toast } from "@/lib/toast";
import { ListNameSheet } from "./list-name-sheet";
import { isListErrorCode, listNameArg, SAVED_LIST_HEADING_ID } from "./list-text";
import { ShareListSheet } from "./share-list-sheet";

function useListErrorText() {
  const t = useTranslations("lists.saving.errors");
  const te = useTranslations("errors");
  return (code: string) => (isListErrorCode(code) ? t(code) : te(errorMessageKey(code)));
}

/** "+ New list" at the end of the list tabs: names the list, then opens it. */
export function NewListChip() {
  const t = useTranslations("lists.page");
  const router = useRouter();
  const errorText = useListErrorText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Chip icon={PlusIcon} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {t("newList")}
      </Chip>
      <ListNameSheet
        open={open}
        onOpenChange={setOpen}
        title={t("createTitle")}
        action={t("createAction")}
        onSubmit={async (name) => {
          const result = await createListAction({ name }).catch(() => ({ ok: false as const, error: "server_error" }));
          if (!result.ok) return errorText(result.error);
          setOpen(false);
          toast.success(t("created", { name: listNameArg(result.data.list.name) }));
          router.push({ pathname: "/account/favorites", query: { list: result.data.list.id } });
          return null;
        }}
      />
    </>
  );
}

/**
 * The selected list's title row on the saved page: its name, how many places, "Shared" when its
 * link is live, and Share; named lists also get Rename and Delete (their places then move to the
 * default list). The page renders it with key={list.id}: switching tabs is a soft navigation that
 * keeps the page's client state, and a header carried over from the last list would share, stop
 * sharing or rename THAT list (ui-1). The "…" menu loads its code at the first tap (speed-1).
 */
export function AccountListHeader({
  list,
  displayName,
  defaultName,
  shareUrl,
}: {
  list: { id: string; name: string; isDefault: boolean; count: number; shared: boolean };
  displayName: string;
  defaultName: string;
  /** The live share link, built on the server (null = not shared). */
  shareUrl: string | null;
}) {
  const t = useTranslations("lists.page");
  const tl = useTranslations("lists.saving");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useListErrorText();
  const [sheet, setSheet] = useState<"share" | "rename" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const countText = formatNumber(list.count, locale);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteListAction({ listId: list.id });
      if (!result.ok) return setDeleteError(errorText(result.error));
      setSheet(null);
      toast.success(t("deleted"));
      router.push("/account/favorites");
    } catch {
      setDeleteError(tl("errors.failed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-border bg-card px-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <h2 id={SAVED_LIST_HEADING_ID} tabIndex={-1} className="truncate text-h3 font-semibold outline-none">
          <span dir="auto">{displayName}</span>
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 text-small text-muted-foreground">
          <span>{tl("count", { count: list.count, countText })}</span>
          {list.shared ? (
            <span title={t("sharedHint")} className="inline-flex items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-text">
              <UsersIcon className="size-3.5" aria-hidden />
              {t("shared")}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="h-11" onClick={() => setSheet("share")} aria-haspopup="dialog">
          <Share2Icon aria-hidden />
          {t("share")}
        </Button>
        {list.isDefault ? null : (
          <OverflowMenu
            label={t("more", { name: listNameArg(displayName) })}
            variant="ghost"
            icon="vertical"
            side="bottom"
            contentClassName="min-w-48"
            items={[
              { key: "rename", icon: <PencilIcon className="size-4" aria-hidden />, label: t("rename"), onSelect: () => setSheet("rename") },
              { key: "delete", icon: <Trash2Icon className="size-4" aria-hidden />, label: t("delete"), onSelect: () => setSheet("delete"), tone: "destructive" },
            ]}
          />
        )}
      </div>

      <ShareListSheet open={sheet === "share"} onOpenChange={(open) => setSheet(open ? "share" : null)} listId={list.id} name={displayName} url={shareUrl} />
      {list.isDefault ? null : (
        <>
          <ListNameSheet
            open={sheet === "rename"}
            onOpenChange={(open) => setSheet(open ? "rename" : null)}
            title={t("renameTitle")}
            action={t("renameAction")}
            initial={list.name}
            onSubmit={async (name) => {
              const result = await renameListAction({ listId: list.id, name }).catch(() => ({ ok: false as const, error: "server_error" }));
              if (!result.ok) return errorText(result.error);
              setSheet(null);
              toast.success(t("renamed"));
              router.refresh();
              return null;
            }}
          />
          <BottomSheet
            open={sheet === "delete"}
            onOpenChange={(open) => !deleting && setSheet(open ? "delete" : null)}
            title={t("deleteTitle", { name: listNameArg(displayName) })}
            footer={
              <div className="flex gap-2">
                <Button variant="outline" className="min-w-0 flex-1" onClick={() => setSheet(null)} disabled={deleting}>
                  <span className="truncate">{tl("sheet.cancel")}</span>
                </Button>
                <Button className="min-w-0 flex-1 bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove()} disabled={deleting} aria-busy={deleting || undefined}>
                  {deleting ? <LoaderIcon className="animate-spin" aria-hidden /> : <Trash2Icon aria-hidden />}
                  <span className="truncate">{t("deleteConfirm")}</span>
                </Button>
              </div>
            }
          >
            <p className="text-body text-pretty">{t("deleteBody", { count: list.count, countText, defaultName })}</p>
            {deleteError ? (
              <p role="alert" className="mt-3 text-small text-destructive">
                {deleteError}
              </p>
            ) : null}
          </BottomSheet>
        </>
      )}
    </div>
  );
}
