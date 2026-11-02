"use client";

import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, ImagesIcon, ShieldCheckIcon, StampIcon, SunIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { siteConfig } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deletePhoto, reorderPhotos, setCoverPhoto, updatePhotoAlt } from "@/lib/wizard/actions";
import type { WizardPhoto } from "@/lib/wizard/types";
import { Section } from "../fields";
import { PhotoGrid } from "../photo-grid";
import { PhotoDropZone, UploadQueue, usePhotoUploads } from "../photo-uploader";
import type { StepProps } from "../step-props";

/** Shared photo actions (main photos or one room type's photos). */
export function usePhotoActions({
  listingId,
  photos,
  setPhotos,
  roomTypeId = null,
  track,
}: {
  listingId: string;
  photos: WizardPhoto[];
  setPhotos: (update: (photos: WizardPhoto[]) => WizardPhoto[]) => void;
  roomTypeId?: string | null;
  track: StepProps["track"];
}) {
  const t = useTranslations("wizard");
  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.server_error"));
  // The latest list, updated synchronously (uploads finish in bursts, before React re-renders).
  const photosRef = useRef(photos);
  const apply = (update: (list: WizardPhoto[]) => WizardPhoto[]) => {
    const next = update(photosRef.current);
    photosRef.current = next;
    setPhotos(() => next);
    return next;
  };

  const withCover = (list: WizardPhoto[]) =>
    roomTypeId ? list.map((p) => ({ ...p, isCover: false })) : list.map((p, i) => ({ ...p, isCover: i === 0 }));

  const onReorder = async (ids: string[]) => {
    const before = photosRef.current;
    const byId = new Map(before.map((p) => [p.id, p]));
    apply(() => withCover(ids.map((id) => byId.get(id)).filter((p): p is WizardPhoto => !!p)));
    const result = await track(reorderPhotos(listingId, ids, roomTypeId)).catch(() => null);
    if (!result?.ok) {
      apply(() => before);
      toast.error(errorText(result?.error ?? "network"));
    }
  };

  const onSetCover = async (id: string) => {
    const before = photosRef.current;
    const photo = before.find((p) => p.id === id);
    if (!photo) return;
    apply(() => withCover([photo, ...before.filter((p) => p.id !== id)]));
    const result = await track(setCoverPhoto(listingId, id)).catch(() => null);
    if (!result?.ok) {
      apply(() => before);
      toast.error(errorText(result?.error ?? "network"));
    }
  };

  const onDelete = async (id: string) => {
    const before = photosRef.current;
    apply(() => withCover(before.filter((p) => p.id !== id)));
    const result = await track(deletePhoto(listingId, id)).catch(() => null);
    if (!result?.ok) {
      apply(() => before);
      toast.error(errorText(result?.error ?? "network"));
    }
  };

  const onAlt = async (id: string, alt: string) => {
    const result = await track(updatePhotoAlt(listingId, id, alt)).catch(() => null);
    if (!result?.ok) {
      toast.error(errorText(result?.error ?? "network"));
      return false;
    }
    apply((list) => list.map((p) => (p.id === id ? { ...p, alt } : p)));
    return true;
  };

  const addUploaded = (photo: WizardPhoto) =>
    apply((list) => (list.some((p) => p.id === photo.id) ? list : [...list, photo]));

  /** After a batch of uploads: store the order (existing photos, then new ones in the order picked). */
  const onBatchDone = (uploaded: { id: string; order: number }[]) => {
    if (uploaded.length === 0) return;
    const newIds = new Set(uploaded.map((u) => u.id));
    const ordered = [...uploaded].sort((a, b) => a.order - b.order).map((u) => u.id);
    const current = photosRef.current;
    const ids = [...current.filter((p) => !newIds.has(p.id)).map((p) => p.id), ...ordered];
    void onReorder(ids);
  };

  return { onReorder, onSetCover: roomTypeId ? undefined : onSetCover, onDelete, onAlt, onBatchDone, addUploaded };
}

/** Step 7 — at least 5 photos (up to 30): upload, reorder, cover, delete, alt text. */
export function PhotosStep({ listing, photos, setPhotos, roomTypes, track }: StepProps) {
  const t = useTranslations("wizard.photos");
  const locale = useLocale();
  const { minPhotos, maxPhotos } = siteConfig.listings;
  const roomPhotoCount = roomTypes.reduce((n, r) => n + r.photos.length, 0);
  const remaining = Math.max(0, maxPhotos - photos.length - roomPhotoCount);
  const actions = usePhotoActions({ listingId: listing.id, photos, setPhotos, track });

  const uploads = usePhotoUploads({
    listingId: listing.id,
    remaining,
    onUploaded: actions.addUploaded,
    onBatchDone: actions.onBatchDone,
  });

  const count = photos.length;
  const enough = count >= minPhotos;

  return (
    <div className="grid gap-6">
      <div className="flex items-start gap-3 rounded-xl bg-primary-tint p-3.5 text-sm dark:bg-success/15">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <p className="text-pretty">{t("privacyNote")}</p>
      </div>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold" aria-live="polite">
            <ImagesIcon className="size-5 text-muted-foreground" aria-hidden />
            {t("count", { count, formatted: formatNumber(count, locale), max: formatNumber(maxPhotos, locale) })}
          </p>
          <p className={cn("text-sm font-medium", enough ? "text-success" : "text-foreground")}>
            {enough
              ? t("enough")
              : t("needMore", { count: minPhotos - count, formatted: formatNumber(minPhotos - count, locale) })}
          </p>
        </div>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: minPhotos }, (_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < count ? "bg-success" : "bg-muted")} />
          ))}
        </div>

        <PhotoDropZone onFiles={uploads.add} disabled={remaining === 0} remaining={remaining} compact={count > 0} />
        {uploads.rejected && (
          <p className="text-sm font-medium text-foreground" role="alert">
            {t(`rejected.${uploads.rejected}`, { count: remaining })}
          </p>
        )}
        <UploadQueue items={uploads.items} onRetry={uploads.retry} onDismiss={uploads.dismiss} />

        {count > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">{t("gridHelp")}</p>
            <PhotoGrid photos={photos} actions={actions} disabled={uploads.busy} />
          </>
        ) : (
          uploads.items.length === 0 && (
            <div className="grid justify-items-center gap-2 py-6 text-center">
              <CameraIcon className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{t("emptyDescription", { count: minPhotos })}</p>
            </div>
          )
        )}
      </Section>

      <Section title={t("tipsTitle")} icon={SunIcon}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(["light", "horizontal", "rooms", "real"] as const).map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{t(`tips.${tip}`)}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <StampIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("watermarkNote")}
        </p>
      </Section>
    </div>
  );
}
