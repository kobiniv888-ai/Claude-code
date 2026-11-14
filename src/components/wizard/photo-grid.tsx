"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, GripVerticalIcon, PencilIcon, StarIcon, TagIcon, Trash2Icon } from "lucide-react";
import type { PhotoRoom } from "@/generated/prisma/enums";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/lib/format";
import { PHOTO_ROOMS } from "@/lib/listing/fields";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/wizard/schemas";
import type { WizardPhoto } from "@/lib/wizard/types";

type GridActions = {
  onReorder: (ids: string[]) => void;
  onSetCover?: (id: string) => void;
  onDelete: (id: string) => void;
  onAlt: (id: string, alt: string) => Promise<boolean>;
  /** The photo's room label (round 3, brief 6.1); without it the grid shows no label picker. */
  onRoom?: (id: string, room: PhotoRoom | null) => void;
};

/**
 * "What does this photo show?" under a photo: bedroom, kitchen, bathroom… (optional). A native
 * select: the phone's own picker, 44px tall, labelled with the photo's number for screen readers.
 */
function RoomSelect({ photo, label, onChange }: { photo: WizardPhoto; label: string; onChange: (room: PhotoRoom | null) => void }) {
  const t = useTranslations("wizard.photos");
  const id = useId();
  const value = photo.room ?? "";
  return (
    <div className="relative border-t border-border bg-card">
      <label htmlFor={id} className="sr-only">
        {t("roomLabel", { label })}
      </label>
      <TagIcon
        className={cn("pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2", value ? "text-primary-text" : "text-muted-foreground")}
        aria-hidden
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value ? (e.target.value as PhotoRoom) : null)}
        className={cn(
          "h-11 w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent ps-9 pe-8 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
          value ? "font-medium text-foreground" : "text-muted-foreground",
        )}
        data-photo-room={photo.id}
      >
        <option value="">{t("roomNone")}</option>
        {PHOTO_ROOMS.map((room) => (
          <option key={room} value={room}>
            {t(`rooms.${room}`)}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * Arrow keys for a wrapping grid: Left/Right stay on the same row, Up/Down in the same column.
 * (dnd-kit's sortableKeyboardCoordinates compares exact pixel offsets, so sub-pixel column
 * positions can make "Right" jump a row down.) Returns the target tile's top-left corner.
 */
const gridKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, collisionRect, droppableRects, droppableContainers } = context;
  const code = event.code;
  if (code !== KeyboardCode.Left && code !== KeyboardCode.Right && code !== KeyboardCode.Up && code !== KeyboardCode.Down) {
    return undefined;
  }
  event.preventDefault();
  if (!active || !collisionRect) return undefined;
  const tolerance = Math.max(4, Math.min(collisionRect.width, collisionRect.height) / 2);
  let best: { x: number; y: number; distance: number } | null = null;
  for (const entry of droppableContainers.getEnabled()) {
    const rect = entry.disabled ? undefined : droppableRects.get(entry.id);
    if (!rect) continue;
    const dx = rect.left - collisionRect.left;
    const dy = rect.top - collisionRect.top;
    const distance =
      code === KeyboardCode.Right && Math.abs(dy) < tolerance && dx > tolerance ? dx
      : code === KeyboardCode.Left && Math.abs(dy) < tolerance && dx < -tolerance ? -dx
      : code === KeyboardCode.Down && Math.abs(dx) < tolerance && dy > tolerance ? dy
      : code === KeyboardCode.Up && Math.abs(dx) < tolerance && dy < -tolerance ? -dy
      : null;
    if (distance !== null && (!best || distance < best.distance)) best = { x: rect.left, y: rect.top, distance };
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

function AltEditor({ photo, onSave, label }: { photo: WizardPhoto; onSave: (alt: string) => Promise<boolean>; label: string }) {
  const t = useTranslations("wizard.photos");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(photo.alt);
  const [saving, setSaving] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText(photo.alt);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="secondary" aria-label={t("altEdit", { label })} className="size-10 rounded-full bg-card/90 shadow-sm">
          <PencilIcon aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-72 gap-3">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const okay = await onSave(text.trim());
            setSaving(false);
            if (okay) setOpen(false);
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            {t("altLabel")}
            <Input
              dir="auto"
              value={text}
              maxLength={LIMITS.altMax}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("altPlaceholder")}
              className="h-10 font-normal"
              autoFocus
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("altHelp")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {t("save")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SortablePhoto({
  photo,
  index,
  total,
  actions,
  disabled,
  showCover,
}: {
  photo: WizardPhoto;
  index: number;
  total: number;
  actions: GridActions;
  disabled: boolean;
  showCover: boolean;
}) {
  const t = useTranslations("wizard.photos");
  const locale = useLocale();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled,
  });
  const isCover = showCover && index === 0;
  const label = t("photoLabel", { index: formatNumber(index + 1, locale), total: formatNumber(total, locale) });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative overflow-hidden rounded-card bg-muted shadow-card ring-1 ring-foreground/5",
        isDragging && "z-10 scale-[1.03] opacity-90 shadow-raised ring-2 ring-primary",
        isCover && "ring-3 ring-primary",
      )}
    >
      <div className="relative">
        <div className="relative aspect-[4/3] touch-manipulation" {...listeners}>
          {/* eslint-disable-next-line @next/next/no-img-element -- already resized WebP thumbnails */}
          <img
            src={photo.thumbUrl}
            alt={photo.alt || label}
            className="size-full object-cover select-none"
            draggable={false}
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
          {isCover ? (
            <span className="flex h-7 items-center gap-1 rounded-full bg-primary px-2.5 text-caption font-bold text-primary-foreground shadow-sm">
              <StarIcon className="size-3.5 fill-current" aria-hidden />
              {t("cover")}
            </span>
          ) : (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-black/60 px-2 text-caption font-bold text-white tabular-nums">
              {formatNumber(index + 1, locale)}
            </span>
          )}
        </div>
        {/* Drag handle: top corner (mouse, touch or keyboard). */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={t("dragHandle", { label })}
          aria-roledescription={t("sortable")}
          className="absolute end-1.5 top-1.5 flex size-10 cursor-grab touch-none items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing disabled:opacity-50"
        >
          <GripVerticalIcon className="size-4.5" aria-hidden />
        </button>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-8">
          <div className="flex items-center gap-1.5">
            {showCover && actions.onSetCover && !isCover && (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={() => actions.onSetCover?.(photo.id)}
                disabled={disabled}
                aria-label={t("setCover", { label })}
                aria-pressed={false}
                className="size-10 rounded-full bg-card/90 shadow-sm"
              >
                <StarIcon aria-hidden />
              </Button>
            )}
            <AltEditor photo={photo} label={label} onSave={(alt) => actions.onAlt(photo.id, alt)} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  disabled={disabled}
                  aria-label={t("delete", { label })}
                  className="size-10 rounded-full bg-card/90 text-destructive shadow-sm"
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => actions.onDelete(photo.id)}>
                    {t("deleteConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
      {actions.onRoom ? <RoomSelect photo={photo} label={label} onChange={(room) => actions.onRoom?.(photo.id, room)} /> : null}
    </li>
  );
}

/** Thumbnails: drag (mouse, touch or keyboard) to reorder, star = cover (first), delete, alt text. */
export function PhotoGrid({
  photos,
  actions,
  disabled = false,
  showCover = true,
  className,
}: {
  photos: WizardPhoto[];
  actions: GridActions;
  disabled?: boolean;
  showCover?: boolean;
  className?: string;
}) {
  const t = useTranslations("wizard.photos");
  const locale = useLocale();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: gridKeyboardCoordinates }),
  );
  // A stable id keeps dnd-kit's aria-describedby the same on the server and the client.
  const dndId = useId();
  const ids = photos.map((p) => p.id);
  const position = (id: string | number) => formatNumber(ids.indexOf(String(id)) + 1, locale);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    actions.onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: t("dndInstructions") },
        announcements: {
          onDragStart: ({ active }) => t("dndStart", { position: position(active.id) }),
          onDragOver: ({ over }) => (over ? t("dndOver", { position: position(over.id) }) : undefined),
          onDragEnd: ({ over }) => (over ? t("dndEnd", { position: position(over.id) }) : t("dndCancel")),
          onDragCancel: () => t("dndCancel"),
        },
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
          {photos.map((photo, index) => (
            <SortablePhoto
              key={photo.id}
              photo={photo}
              index={index}
              total={photos.length}
              actions={actions}
              disabled={disabled}
              showCover={showCover}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
