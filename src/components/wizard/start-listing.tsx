"use client";

import { useRef, useState, useTransition } from "react";
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
import { Button as DsButton } from "@/components/ds/button";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/common/ltr";
import { Link, useRouter } from "@/i18n/navigation";
import { createDraft, deleteDraft } from "@/lib/wizard/actions";
import type { DraftSummary } from "@/lib/wizard/types";
import { cn } from "@/lib/utils";
import { useOptionLabel } from "./labels";

/**
 * "Start a new listing": creates a DRAFT and opens step 1. With an unfinished draft (`draft`), it
 * first asks whether the person meant to continue it (bug 2.7: drafts got forgotten).
 */
export function StartListingButton({ draft }: { draft?: Pick<DraftSummary, "id" | "title" | "wizardStep"> | null }) {
  const t = useTranslations("wizard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState(false);
  const continueRef = useRef<HTMLAnchorElement>(null);

  const start = async () => {
    setAsking(false);
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
    <>
      <DsButton
        type="button"
        variant={draft ? "secondary" : "accent"}
        size="lg"
        onClick={() => (draft ? setAsking(true) : void start())}
        disabled={busy}
        className="w-full sm:w-auto"
      >
        {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <PlusIcon aria-hidden />}
        {busy ? t("start.creating") : t("start.newButton")}
      </DsButton>
      {draft && (
        <AlertDialog open={asking} onOpenChange={setAsking}>
          <AlertDialogContent
            onOpenAutoFocus={(event) => {
              // The safe choice first: continuing the draft creates nothing.
              event.preventDefault();
              continueRef.current?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t("start.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {draft.title.trim()
                  ? t.rich("start.confirmBody", { title: () => <bdi className="font-semibold text-foreground">{draft.title}</bdi> })
                  : t("start.confirmBodyUntitled")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => void start()}>{t("start.confirmNew")}</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link ref={continueRef} href={`/post/${draft.id}?step=${draft.wizardStep}`}>
                  {t("start.continueButton")}
                  <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
                </Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

/** "המשך מהטיוטה" (bug 2.7): the newest draft, first on /post, with its photo, title and step. */
export function ContinueDraftCard({ draft }: { draft: DraftCardData }) {
  const t = useTranslations("wizard.start");
  const tw = useTranslations("wizard");
  const label = useOptionLabel();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const percent = Math.round((Math.min(draft.wizardStep, draft.stepCount) / draft.stepCount) * 100);

  const remove = async () => {
    setRemoving(true);
    const result = await deleteDraft(draft.id).catch(() => null);
    if (!result?.ok) {
      setRemoving(false);
      toast.error(tw("errors.server_error"));
      return;
    }
    toast.success(t("deleted"));
    router.refresh();
  };

  return (
    <article
      aria-labelledby="continue-draft-title"
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-card bg-card shadow-card ring-2 ring-primary/25 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
    >
      <div
        className={cn(
          "relative flex items-center justify-center bg-muted sm:min-h-48",
          // Without a photo yet, a short band instead of a big empty box.
          draft.coverUrl ? "aspect-[16/9] sm:aspect-auto" : "h-20 sm:h-auto",
        )}
      >
        {draft.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small WebP thumbnail
          <img src={draft.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="grid content-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1.5">
          <h3 id="continue-draft-title" className="text-h3 text-pretty break-words" dir="auto">
            {draft.title || t("draftUntitled")}
          </h3>
          <p className="text-small text-muted-foreground">
            {label("propertyType", draft.propertyType)} · {label("dealType", draft.dealType)}
            {draft.cityName ? ` · ${draft.cityName}` : ""}
          </p>
          <div className="grid gap-1.5 pt-1">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-small">
              <span className="font-semibold">{t("draftStep", { step: draft.wizardStep, total: draft.stepCount })}</span>
              <span className="text-xs text-muted-foreground">{draft.updatedLabel}</span>
            </p>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ inlineSize: `${percent}%` }} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("draftPhotos", { count: draft.photoCount })} · {t("draftId")} <Ltr>{draft.publicId}</Ltr>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DsButton asChild size="lg" className="min-w-0 flex-1 px-5 sm:flex-none">
            <Link href={`/post/${draft.id}?step=${draft.wizardStep}`}>
              <span className="truncate">{t("continueButton")}</span>
              <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
            </Link>
          </DsButton>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="icon" variant="ghost" aria-label={t("deleteDraft")} className="text-destructive" disabled={removing}>
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
                <AlertDialogAction variant="destructive" onClick={() => void remove()}>
                  {t("deleteDraftConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </article>
  );
}

export type DraftCardData = DraftSummary & { updatedLabel: string };

/** The other drafts (the newest one is the ContinueDraftCard above them). */
export function DraftCards({ drafts, title }: { drafts: DraftCardData[]; title?: string }) {
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
      <h2 id="drafts-title" className="text-h3">
        {title ?? t("draftsTitle")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((draft) => (
          <li key={draft.id} className="flex gap-3 rounded-card bg-card p-3 shadow-card ring-1 ring-foreground/5">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-input bg-muted sm:size-24">
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
