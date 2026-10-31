"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, StarIcon, Trash2Icon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/wizard/schemas";
import type { WizardPhoto } from "@/lib/wizard/types";

type GridActions = {
  onReorder: (ids: string[]) => void;
  onSetCover?: (id: string) => void;
  onDelete: (id: string) => void;
  onAlt: (id: string, alt: string) => Promise<boolean>;
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
        <Button type="button" size="icon-sm" variant="secondary" aria-label={t("altEdit", { label })} className="bg-card/90 shadow-sm">
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
        "group relative overflow-hidden rounded-xl bg-muted shadow-card ring-1 ring-foreground/5",
        isDragging && "z-10 scale-[1.02] opacity-90 shadow-card-hover ring-2 ring-primary",
        isCover && "ring-2 ring-primary",
      )}
    >
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
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
        <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
          {formatNumber(index + 1, locale)}
        </span>
        {isCover && (
          <span className="flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            <StarIcon className="size-3 fill-current" aria-hidden />
            {t("cover")}
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent p-1.5 pt-6">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={t("dragHandle", { label })}
          aria-roledescription={t("sortable")}
          className="flex size-8 cursor-grab touch-none items-center justify-center rounded-md bg-card/90 text-foreground shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring active:cursor-grabbing disabled:opacity-50"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
        <div className="flex items-center gap-1">
          {showCover && actions.onSetCover && (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              onClick={() => actions.onSetCover?.(photo.id)}
              disabled={isCover || disabled}
              aria-label={isCover ? t("isCover") : t("setCover", { label })}
              aria-pressed={isCover}
              className="bg-card/90 shadow-sm"
            >
              <StarIcon className={cn(isCover && "fill-primary text-primary")} aria-hidden />
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
                className="bg-card/90 text-destructive shadow-sm"
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
