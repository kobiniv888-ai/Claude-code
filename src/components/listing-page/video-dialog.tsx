"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { VideoEmbed } from "@/lib/listing-page/media";

/** The listing video in a dialog (loaded by the gallery when the video is first opened). */
export function VideoDialog({
  video,
  open,
  onOpenChange,
  title,
}: {
  video: VideoEmbed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const t = useTranslations("listing.gallery");
  if (!video) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,64rem)] max-w-none gap-3 bg-black p-2 text-white sm:max-w-none sm:p-3">
        <DialogTitle className="sr-only">{t("videoTitle", { title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("videoHint")}</DialogDescription>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg" dir="ltr">
          {open ? (
            <iframe
              src={video.embedUrl}
              title={t("videoTitle", { title })}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
