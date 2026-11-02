"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PhotoCarousel } from "@/components/ds/photo-carousel";
import type { PagePhoto } from "@/lib/listing-page/types";

const Lightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), { ssr: false });

/** A room type's photos: the ds swipe carousel with a counter; tap for the full-screen viewer. */
export function RoomPhotos({ photos, name }: { photos: PagePhoto[]; name: string }) {
  const t = useTranslations("listing.gallery");
  const [viewer, setViewer] = useState<{ mounted: boolean; open: boolean; index: number }>({ mounted: false, open: false, index: 0 });
  return (
    <>
      <PhotoCarousel
        photos={photos.map((p) => ({ url: p.medium, alt: p.alt, blurDataUrl: p.blurDataUrl ?? undefined }))}
        label={t("label", { title: name })}
        sizes="(min-width: 640px) 360px, 100vw"
        aspect="aspect-[16/10]"
        counter={photos.length > 1}
        dots={false}
        onPhotoClick={(index) => setViewer({ mounted: true, open: true, index })}
        photoLabel={(index, total) => t("open", { index: index + 1, total })}
      />
      {viewer.mounted ? (
        <Lightbox photos={photos} title={name} open={viewer.open} startIndex={viewer.index} onOpenChange={(open) => setViewer((s) => ({ ...s, open }))} />
      ) : null}
    </>
  );
}
