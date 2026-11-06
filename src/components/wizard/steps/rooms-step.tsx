"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BedDoubleIcon, BedSingleIcon, BedIcon, EyeOffIcon, HashIcon, PencilIcon, PlusIcon, SofaIcon, Trash2Icon, UsersIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Ltr } from "@/components/common/ltr";
import { siteConfig, type CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { enabledCurrencies } from "@/lib/currency/convert";
import { formatArea, formatMoney, formatNumber } from "@/lib/format";
import { deleteRoomType, saveRoomType } from "@/lib/wizard/actions";
import { LIMITS, ROOM_TYPE_AMENITIES, ROOM_TYPE_PERIODS, roomTypeSchema } from "@/lib/wizard/schemas";
import type { WizardPhoto, WizardRoomType } from "@/lib/wizard/types";
import { CheckCards, Field, NumberInput, Section, Stepper, useIssueText } from "../fields";
import { AMENITY_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import { PhotoGrid } from "../photo-grid";
import { PhotoDropZone, UploadQueue, usePhotoUploads } from "../photo-uploader";
import type { StepProps } from "../step-props";
import { usePhotoActions } from "./photos-step";

type Draft = {
  id?: string;
  name: string;
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  weekendPrice: number | null;
  maxGuests: number | null;
  bedsSingle: number | null;
  bedsDouble: number | null;
  bedsSofa: number | null;
  sizeSqm: number | null;
  amenities: string[];
  quantity: number | null;
  active: boolean;
};

function emptyDraft(currency: CurrencyCode): Draft {
  return {
    name: "",
    price: null,
    currency,
    pricePeriod: "NIGHT",
    weekendPrice: null,
    maxGuests: 2,
    bedsSingle: null,
    bedsDouble: 1,
    bedsSofa: null,
    sizeSqm: null,
    amenities: [],
    quantity: 1,
    active: true,
  };
}

/** The editor's values for a saved room type. */
function draftOf(room: WizardRoomType): Draft {
  const { photos: _photos, ...rest } = room;
  void _photos;
  return rest;
}

function RoomEditor({
  initial,
  onCancel,
  onSaved,
  listingId,
  originalLocale,
  track,
}: {
  initial: Draft;
  onCancel: () => void;
  onSaved: (room: WizardRoomType) => void;
  listingId: string;
  originalLocale: string;
  track: StepProps["track"];
}) {
  const t = useTranslations("wizard.rooms");
  const tw = useTranslations("wizard");
  const label = useOptionLabel();
  const issueText = useIssueText();
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = roomTypeSchema.safeParse({ ...draft, price: draft.price ?? Number.NaN });
    if (!parsed.success) {
      const next: Record<string, string | null> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field && !next[field]) next[field] = issueText(issue.message === "Invalid input" ? "invalid" : issue.message);
      }
      if (draft.price === null) next.price = issueText("priceRequired");
      setErrors(next);
      return;
    }
    setSaving(true);
    const result = await track(saveRoomType(listingId, parsed.data)).catch(() => null);
    setSaving(false);
    if (!result?.ok) {
      const code = result?.error ?? "network";
      toast.error(tw.has(`errors.${code}`) ? tw(`errors.${code}`) : tw("errors.server_error"));
      if (result && "fieldErrors" in result && result.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k, issueText(v?.[0])])));
      }
      return;
    }
    onSaved(result.data.roomType);
  };

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-primary/30 bg-card p-4 shadow-card sm:p-5" noValidate>
      <h3 className="font-semibold">{draft.id ? t("editTitle") : t("addTitle")}</h3>
      <Field label={t("name")} description={t("nameHelp")} error={errors.name}>
        {(props) => (
          <Input
            {...props}
            dir="auto"
            lang={originalLocale}
            value={draft.name}
            maxLength={LIMITS.roomTypeNameMax}
            placeholder={t("namePlaceholder")}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-11 text-base"
            autoFocus
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Field label={t("price")} error={errors.price}>
          {(props) => <NumberInput {...props} decimals value={draft.price} onChange={(price) => patch({ price })} />}
        </Field>
        <Field label={t("currency")}>
          {(props) => (
            <Select value={draft.currency} onValueChange={(v) => patch({ currency: v as CurrencyCode })}>
              <SelectTrigger {...props} className="h-11 w-full min-w-28 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {enabledCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    <Ltr>{c}</Ltr>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={t("period")}>
          {(props) => (
            <Select value={draft.pricePeriod} onValueChange={(v) => patch({ pricePeriod: v as PricePeriod })}>
              <SelectTrigger {...props} className="h-11 w-full min-w-32 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ROOM_TYPE_PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {label("period", p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>
      {draft.pricePeriod === "NIGHT" && (
        <Field label={t("weekendPrice")} description={t("weekendPriceHelp")} error={errors.weekendPrice} optional className="sm:max-w-xs">
          {(props) => <NumberInput {...props} decimals value={draft.weekendPrice} onChange={(weekendPrice) => patch({ weekendPrice })} />}
        </Field>
      )}
      {/* "כמה חדרים כאלה להציע בבית" (founder's answer 3): a hotel may offer fewer rooms than it has. */}
      <Stepper
        label={t("quantity")}
        icon={HashIcon}
        value={draft.quantity}
        onChange={(quantity) => patch({ quantity })}
        min={1}
        max={1000}
        error={errors.quantity}
        description={t("quantityHelp")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Stepper label={t("maxGuests")} icon={UsersIcon} value={draft.maxGuests} onChange={(maxGuests) => patch({ maxGuests })} min={1} max={50} error={errors.maxGuests} />
        <Stepper label={t("bedsDouble")} icon={BedDoubleIcon} value={draft.bedsDouble} onChange={(bedsDouble) => patch({ bedsDouble })} error={errors.bedsDouble} />
        <Stepper label={t("bedsSingle")} icon={BedSingleIcon} value={draft.bedsSingle} onChange={(bedsSingle) => patch({ bedsSingle })} error={errors.bedsSingle} />
        <Stepper label={t("bedsSofa")} icon={SofaIcon} value={draft.bedsSofa} onChange={(bedsSofa) => patch({ bedsSofa })} error={errors.bedsSofa} />
      </div>
      <Field label={t("size")} error={errors.sizeSqm} optional className="sm:max-w-xs">
        {(props) => <NumberInput {...props} decimals value={draft.sizeSqm} onChange={(sizeSqm) => patch({ sizeSqm })} suffix={tw("details.sqm")} />}
      </Field>
      <CheckCards
        legend={t("amenities")}
        description={t("amenitiesHelp")}
        optional
        values={draft.amenities}
        onChange={(amenities) => patch({ amenities })}
        columns="grid-cols-1 sm:grid-cols-2"
        options={ROOM_TYPE_AMENITIES.map((a) => ({ value: a, label: label("amenity", a), icon: AMENITY_ICONS[a] }))}
      />
      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-card border border-border bg-card px-3 py-2.5">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-small font-semibold">{t("active")}</span>
          <span className="text-caption text-pretty text-muted-foreground">{draft.active ? t("activeOn") : t("activeOff")}</span>
        </span>
        <Switch checked={draft.active} onCheckedChange={(active) => patch({ active })} aria-label={t("active")} />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={saving} className="min-w-28">
          {draft.id ? t("save") : t("add")}
        </Button>
      </div>
    </form>
  );
}

function RoomPhotos({
  room,
  listingId,
  remaining,
  setRoomPhotos,
  track,
}: {
  room: WizardRoomType;
  listingId: string;
  remaining: number;
  setRoomPhotos: (roomId: string, update: (photos: WizardPhoto[]) => WizardPhoto[]) => void;
  track: StepProps["track"];
}) {
  const t = useTranslations("wizard.rooms");
  const setPhotos = useCallback(
    (update: (photos: WizardPhoto[]) => WizardPhoto[]) => setRoomPhotos(room.id, update),
    [room.id, setRoomPhotos],
  );
  const actions = usePhotoActions({ listingId, photos: room.photos, setPhotos, roomTypeId: room.id, track });
  const uploads = usePhotoUploads({
    listingId,
    roomTypeId: room.id,
    remaining,
    onUploaded: actions.addUploaded,
    onBatchDone: actions.onBatchDone,
  });
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">{t("photos")}</p>
      {room.photos.length > 0 && (
        <PhotoGrid photos={room.photos} actions={actions} disabled={uploads.busy} showCover={false} />
      )}
      <UploadQueue items={uploads.items} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
      <PhotoDropZone onFiles={uploads.add} disabled={remaining === 0} remaining={remaining} compact />
    </div>
  );
}

/** Hotels, guesthouses and hostels: several room types, each with its own price and photos. */
export function RoomsStep({ listing, values, roomTypes, setRoomTypes, photos, track }: StepProps) {
  const t = useTranslations("wizard.rooms");
  const tw = useTranslations("wizard");
  const locale = useLocale();
  const label = useOptionLabel();
  const [editing, setEditing] = useState<Draft | null>(roomTypes.length === 0 ? emptyDraft(values.currency) : null);
  const totalPhotos = photos.length + roomTypes.reduce((n, r) => n + r.photos.length, 0);
  const remaining = Math.max(0, siteConfig.listings.maxPhotos - totalPhotos);

  const setRoomPhotos = useCallback(
    (roomId: string, update: (photos: WizardPhoto[]) => WizardPhoto[]) =>
      setRoomTypes((rooms) => rooms.map((r) => (r.id === roomId ? { ...r, photos: update(r.photos) } : r))),
    [setRoomTypes],
  );

  const remove = async (room: WizardRoomType) => {
    const before = roomTypes;
    setRoomTypes((rooms) => rooms.filter((r) => r.id !== room.id));
    const result = await track(deleteRoomType(listing.id, room.id)).catch(() => null);
    if (!result?.ok) {
      setRoomTypes(() => before);
      // Rooms held by upcoming bookings: switch the room type off instead (founder's answer 3).
      toast.error(result?.error === "room_type_has_bookings" ? t("hasBookings") : tw("errors.server_error"));
    }
  };

  return (
    <div className="grid gap-5">
      {roomTypes.length === 0 && !editing && (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
          <BedIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      )}

      {roomTypes.map((room) =>
        editing?.id === room.id ? (
          <RoomEditor
            key={room.id}
            initial={editing}
            listingId={listing.id}
            originalLocale={values.originalLocale}
            track={track}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setRoomTypes((rooms) => rooms.map((r) => (r.id === saved.id ? { ...saved, photos: r.photos } : r)));
              setEditing(null);
            }}
          />
        ) : (
          <Section key={room.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span dir="auto">{room.name}</span>
                  {!room.active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-caption font-medium text-muted-foreground">
                      <EyeOffIcon className="size-3.5" aria-hidden />
                      {t("offBadge")}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground">
                  <Ltr className="font-semibold text-foreground">{formatMoney(room.price, room.currency, locale)}</Ltr>{" "}
                  {label("period", room.pricePeriod)}
                  {room.weekendPrice !== null && room.pricePeriod === "NIGHT" && (
                    <>
                      {" · "}
                      {t("weekendSummary", { price: `⁦${formatMoney(room.weekendPrice, room.currency, locale)}⁩` })}
                    </>
                  )}
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {room.maxGuests !== null && (
                    <li className="flex items-center gap-1.5">
                      <UsersIcon className="size-4" aria-hidden />
                      {t("guestsSummary", { count: room.maxGuests })}
                    </li>
                  )}
                  {(room.bedsDouble ?? 0) + (room.bedsSingle ?? 0) + (room.bedsSofa ?? 0) > 0 && (
                    <li className="flex items-center gap-1.5">
                      <BedDoubleIcon className="size-4" aria-hidden />
                      {t("bedsSummary", { count: (room.bedsDouble ?? 0) + (room.bedsSingle ?? 0) + (room.bedsSofa ?? 0) })}
                    </li>
                  )}
                  {room.sizeSqm !== null && <li>{formatArea(room.sizeSqm, locale)}</li>}
                  {room.quantity !== null && (
                    <li className="flex items-center gap-1.5">
                      <HashIcon className="size-4" aria-hidden />
                      {t("quantitySummary", { count: room.quantity, formatted: formatNumber(room.quantity, locale) })}
                    </li>
                  )}
                </ul>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(draftOf(room))}
                  disabled={editing !== null}
                >
                  <PencilIcon aria-hidden />
                  {t("edit")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" aria-label={t("deleteLabel", { name: room.name })}>
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
                      <AlertDialogAction variant="destructive" onClick={() => void remove(room)}>
                        {t("deleteConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <RoomPhotos room={room} listingId={listing.id} remaining={remaining} setRoomPhotos={setRoomPhotos} track={track} />
          </Section>
        ),
      )}

      {editing && !editing.id && (
        <RoomEditor
          initial={editing}
          listingId={listing.id}
          originalLocale={values.originalLocale}
          track={track}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setRoomTypes((rooms) => [...rooms, saved]);
            setEditing(null);
          }}
        />
      )}

      {!editing && (
        <Button type="button" variant="outline" className="h-12 justify-self-start px-5 text-base" onClick={() => setEditing(emptyDraft(values.currency))}>
          <PlusIcon aria-hidden />
          {roomTypes.length === 0 ? t("addFirst") : t("addAnother")}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">{t("namesNote")}</p>
    </div>
  );
}
