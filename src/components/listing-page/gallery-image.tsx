"use client";

import Image from "next/image";
import { isOptimizableImage } from "@/components/ds/photo-carousel";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";

/** A gallery tile: a button around a photo, with the focus ring above its neighbours. */
export const TILE =
  "group relative block overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2";
/** The photo's slow zoom on hover (none with reduced motion). */
export const ZOOM = "transition-transform duration-500 ease-soft group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100";

/** One listing photo filling its tile (shared by the gallery and "All photos" by room). */
export function GalleryImage({ photo, src, sizes, eager = false, className }: { photo: PagePhoto; src: string; sizes: string; eager?: boolean; className?: string }) {
  return (
    <Image
      src={src}
      alt={photo.alt}
      fill
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      unoptimized={!isOptimizableImage(src)}
      placeholder={photo.blurDataUrl ? "blur" : "empty"}
      blurDataURL={photo.blurDataUrl ?? undefined}
      draggable={false}
      className={cn("object-cover", className)}
    />
  );
}
