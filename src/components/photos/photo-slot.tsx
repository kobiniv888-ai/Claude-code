import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { resolvePhoto, type PhotoSlotKey } from "@/config/photos";
import { cn } from "@/lib/utils";

type PhotoSlotProps = {
  slot: PhotoSlotKey;
  /** next/image sizes, e.g. "100vw" or "(min-width: 1024px) 25vw, 50vw". */
  sizes: string;
  /** The LCP image (first hero slide): load it first, no lazy loading. */
  priority?: boolean;
  /** Classes of the wrapper (it fills its box: give it a size or an aspect ratio). */
  className?: string;
  /** Classes of the <img> (object-position, hover zoom…). */
  imageClassName?: string;
  /** Override the translated alt text ("" for a decorative photo). */
  alt?: string;
};

/**
 * A photo from the slot registry (@/config/photos) with a blur placeholder, or — while the slot's
 * file is missing — a soft placeholder with "Photo coming soon". Works in server and client
 * components. The wrapper is `relative overflow-hidden`; the image covers it.
 */
export function PhotoSlot({ slot, sizes, priority = false, className, imageClassName, alt }: PhotoSlotProps) {
  const t = useTranslations("photos");
  const photo = resolvePhoto(slot);
  const altText = alt ?? t(`alt.${photo.slot}`);

  if (photo.kind === "placeholder") {
    return <PhotoPlaceholder label={t("comingSoon")} alt={alt === "" ? undefined : altText} className={className} />;
  }
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <Image
        src={photo.src}
        alt={altText}
        fill
        sizes={sizes}
        priority={priority}
        placeholder="blur"
        blurDataURL={photo.blurDataURL}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}

/**
 * The "photo coming soon" placeholder: a soft brand gradient, a photo icon and a short label.
 * `alt` describes the missing photo for screen readers (omit it when the photo is decorative).
 */
export function PhotoPlaceholder({ label, alt, className }: { label: string; alt?: string; className?: string }) {
  return (
    <div
      role={alt ? "img" : undefined}
      aria-label={alt ? `${alt} — ${label}` : undefined}
      className={cn(
        "relative grid place-items-center overflow-hidden bg-linear-to-br from-primary/15 via-secondary to-accent/25 text-primary",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 p-4 text-center" aria-hidden>
        <span className="grid size-12 place-items-center rounded-full bg-background/70 shadow-sm backdrop-blur-sm">
          <ImageIcon className="size-6" />
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
}
