"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/format";
import type { PhotoGroup } from "@/lib/listing-page/photo-groups";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { GalleryImage, TILE, ZOOM } from "./gallery-image";

/**
 * "All photos" in room sections ("חדר שינה", "מטבח"…, then the unlabelled ones), with a row of
 * room chips that jump to a section (and move focus to its heading). `onOpen` takes the index in
 * the viewer's (grouped) order. Loaded with next/dynamic at the first opening of "All photos".
 */
export function RoomSections({ groups, total, onOpen }: { groups: PhotoGroup<PagePhoto>[]; total: number; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const sectionId = (room: string | null) => `gallery-room-${(room ?? "other").toLowerCase()}`;
  // One wide photo, then two side by side; a photo left alone in its row is wide too.
  const wide = (i: number, count: number) => i % 3 === 0 || (i % 3 === 1 && i === count - 1);
  const name = (room: string | null) => (room ? t(`rooms.${room}`) : t("otherPhotos"));
  const sections = groups;
  return (
    <div className="grid gap-5 p-3 sm:p-4">
      <nav aria-label={t("roomsNav")}>
        <ul className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <li key={section.room ?? "other"}>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-small font-medium text-foreground outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/60"
                onClick={() => {
                  document.getElementById(sectionId(section.room))?.scrollIntoView({ block: "start" });
                  // Keyboard and screen-reader users land on the room's heading, not on the chip.
                  document.getElementById(`${sectionId(section.room)}-title`)?.focus({ preventScroll: true });
                }}
              >
                {name(section.room)}
                <span className="text-muted-foreground tabular-nums">{formatNumber(section.photos.length, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {sections.map((section) => (
        <section key={section.room ?? "other"} id={sectionId(section.room)} aria-labelledby={`${sectionId(section.room)}-title`} className="grid scroll-mt-3 gap-2.5">
          <h3
            id={`${sectionId(section.room)}-title`}
            tabIndex={-1}
            className="flex items-baseline gap-2 rounded-sm text-h3 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            {name(section.room)}
            <span className="text-small font-normal text-muted-foreground">
              {t("sectionCount", { count: section.photos.length, formatted: formatNumber(section.photos.length, locale) })}
            </span>
          </h3>
          <ul className="grid grid-cols-2 gap-2 sm:gap-3">
            {section.photos.map((photo, i) => (
              <li
                key={photo.id}
                className={cn(wide(i, section.photos.length) ? "col-span-2 aspect-[16/10]" : "aspect-square sm:aspect-[4/3]")}
              >
                <button
                  type="button"
                  className={cn(TILE, "size-full rounded-xl")}
                  onClick={() => onOpen(section.start + i)}
                  aria-label={t("open", { index: section.start + i + 1, total })}
                >
                  <GalleryImage
                    photo={photo}
                    src={photo.medium}
                    sizes={wide(i, section.photos.length) ? "(min-width: 768px) 56rem, 100vw" : "(min-width: 768px) 28rem, 50vw"}
                    className={ZOOM}
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
