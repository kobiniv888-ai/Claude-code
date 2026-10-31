"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, ImageIcon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/common/ltr";
import { Link, useRouter } from "@/i18n/navigation";
import { createDraft, deleteDraft } from "@/lib/wizard/actions";
import type { DraftSummary } from "@/lib/wizard/types";
import { useOptionLabel } from "./labels";

/** "Start a new listing": creates a DRAFT and opens step 1. */
export function StartListingButton() {
  const t = useTranslations("wizard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  const start = async () => {
    setCreating(true);
    const result = await createDraft().catch(() => null);
    if (!result?.ok) {
      setCreating(false);
      const code = result?.error ?? "network";
      toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.server_error"));
      return;
    }
    startTransition(() => router.push(`/post/${result.data.id}?step=1`));
  };

  const busy = creating || pending;
  return (
    <Button type="button" onClick={() => void start()} disabled={busy} className="h-12 w-full px-6 text-base sm:w-auto">
      {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <PlusIcon aria-hidden />}
      {busy ? t("start.creating") : t("start.newButton")}
    </Button>
  );
}

export type DraftCardData = DraftSummary & { updatedLabel: string };

/** "Continue your draft" cards. */
export function DraftCards({ drafts }: { drafts: DraftCardData[] }) {
  const t = useTranslations("wizard.start");
  const tw = useTranslations("wizard");
  const label = useOptionLabel();
  const [items, setItems] = useState(drafts);

  const remove = async (id: string) => {
    const before = items;
    setItems((list) => list.filter((d) => d.id !== id));
    const result = await deleteDraft(id).catch(() => null);
    if (!result?.ok) {
      setItems(before);
      toast.error(tw("errors.server_error"));
    } else {
      toast.success(t("deleted"));
    }
  };

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="drafts-title" className="grid gap-4">
      <h2 id="drafts-title" className="text-xl font-semibold">
        {t("draftsTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((draft) => (
          <li key={draft.id} className="flex gap-3 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/5">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted sm:size-24">
              {draft.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small WebP thumbnail
                <img src={draft.coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="grid min-w-0 flex-1 content-between gap-2">
              <div className="grid gap-0.5">
                <p className="truncate font-semibold" dir="auto">
                  {draft.title || t("draftUntitled")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {label("propertyType", draft.propertyType)} · {label("dealType", draft.dealType)}
                  {draft.cityName ? ` · ${draft.cityName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("draftStep", { step: draft.wizardStep, total: draft.stepCount })} · {draft.updatedLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("draftPhotos", { count: draft.photoCount })} · {t("draftId")} <Ltr>{draft.publicId}</Ltr>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/post/${draft.id}?step=${draft.wizardStep}`}>
                    {t("continue")}
                    <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("deleteDraft")} className="text-destructive">
                      <Trash2Icon aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteDraftTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("deleteDraftDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void remove(draft.id)}>
                        {t("deleteDraftConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
