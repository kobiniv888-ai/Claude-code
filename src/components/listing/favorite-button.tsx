"use client";

import { useRef, useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { HeartButton } from "@/components/ds/heart-button";
import { listNameArg } from "@/components/lists/list-text";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { useDeviceSaved } from "@/lib/lists/device-store";

// The list sheet (brief 7.2) loads at the first long press or "Change list", not with the card.
const ListPickerSheet = dynamic(() => import("@/components/lists/list-picker-sheet").then((m) => m.ListPickerSheet), { ssr: false });

/**
 * The heart (coral, pops when saved). Optimistic: it fills at once and rolls back if saving fails.
 *
 * Round 3 (brief 7.2, saved lists): a tap saves into the list used last ("שמורים" at first); a
 * long press, a right click or the context-menu key opens a sheet to choose another list or make
 * a new one (one list per place: choosing another list moves it). Keyboard and screen-reader users
 * also get a "Change list" button right after a saved heart (shown when focused) and in the toast.
 * Signed-out visitors save on the device (src/lib/lists/device.ts); it is merged into their
 * account when they sign in.
 */
export function FavoriteButton({
  listingId,
  title,
  isFavorite: initial,
  variant = "overlay",
  className,
  onChange,
}: {
  /** Listing.id */
  listingId: string;
  /** For the accessible name ("Save Sunny flat in Vake"). */
  title: string;
  isFavorite: boolean;
  /** "overlay" = white circle over a photo; "outline" = bordered button on a page. */
  variant?: "overlay" | "outline";
  className?: string;
  onChange?: (isFavorite: boolean) => void;
}) {
  const t = useTranslations("listingCard.favorite");
  const tl = useTranslations("lists.saving");
  const te = useTranslations("errors");
  const router = useRouter();
  const savedOnDevice = useDeviceSaved(listingId);
  const heartRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  /** `value` = what the visitor just did (null: the server's value, or the device's). */
  const [state, setState] = useState<{ value: boolean | null; server: boolean }>({ value: null, server: initial });
  const [pending, setPending] = useState(false);
  const [sheet, setSheet] = useState({ wanted: false, open: false });

  // A fresh value from the server (navigation, refresh) wins over the local one.
  if (state.server !== initial) setState({ value: null, server: initial });
  const isFavorite = state.value ?? (initial || savedOnDevice);
  const apply = (value: boolean | null) => setState((s) => ({ ...s, value }));
  const openSheet = () => setSheet({ wanted: true, open: true });
  const change = { label: tl("heart.change"), onClick: openSheet };

  const onClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const before = isFavorite;
    const next = !before;
    apply(next);
    setPending(true);
    try {
      const { saveFromHeart } = await import("@/lib/lists/heart");
      const outcome = await saveFromHeart(listingId, next);
      // The device's places just went into the account: the page's other hearts were drawn from
      // the device copy, so they are redrawn from the account (lists-alerts-12).
      if (outcome.kind !== "device" && outcome.merged) router.refresh();
      if (outcome.kind === "error") {
        apply(before);
        const key = outcome.code in ERROR_KEYS ? ERROR_KEYS[outcome.code] : null;
        if (key) toast.error(tl(`errors.${key}`));
        else {
          const shared = errorMessageKey(outcome.code);
          toast.error(shared === "rate_limited" ? te(shared) : t("failed"));
        }
        return;
      }
      // Device saves follow the device copy; account saves keep the server's answer.
      apply(outcome.kind === "device" ? null : outcome.isFavorite);
      onChange?.(outcome.isFavorite);
      if (!outcome.isFavorite) {
        toast(t("removed"));
      } else if (outcome.kind === "device") {
        const text = outcome.listName ? tl("heart.savedOnDeviceInList", { name: listNameArg(outcome.listName) }) : tl("heart.savedOnDevice");
        toast.success(text, { description: tl("heart.deviceHint"), action: change });
      } else {
        const list = outcome.list;
        toast.success(list && !list.isDefault ? tl("heart.savedToList", { name: listNameArg(list.name) }) : t("saved"), { action: change });
      }
    } catch {
      apply(before);
      toast.error(t("failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <HeartButton
        ref={heartRef}
        pressed={isFavorite}
        onClick={onClick}
        onLongPress={openSheet}
        label={isFavorite ? t("unsave", { title }) : t("save", { title })}
        busy={pending}
        variant={variant}
        className={className}
      />
      {isFavorite ? (
        // Visible only while it has keyboard focus (the long press has no keyboard equivalent).
        <button
          ref={changeRef}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openSheet();
          }}
          aria-label={tl("heart.changeFor", { title })}
          className="sr-only z-30 rounded-full bg-card px-3.5 text-sm whitespace-nowrap font-medium text-foreground shadow-raised ring-3 ring-ring/60 outline-none focus-visible:not-sr-only focus-visible:absolute focus-visible:end-2 focus-visible:top-14 focus-visible:inline-flex focus-visible:min-h-11 focus-visible:items-center"
        >
          {tl("heart.change")}
        </button>
      ) : null}
      {sheet.wanted ? (
        <ListPickerSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet({ wanted: true, open })}
          listingId={listingId}
          title={title}
          onSaved={(saved, kind) => {
            apply(kind === "device" ? null : saved);
            onChange?.(saved);
          }}
          // "Remove" in the sheet unmounts the "Change list" button that opened it: focus goes
          // back to the heart instead of the page's start (a11y-2).
          onCloseAutoFocus={(event) => {
            if (changeRef.current?.isConnected) return;
            event.preventDefault();
            heartRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );
}

/** Error codes of the lists namespace (the rest use the shared "errors" texts). */
const ERROR_KEYS: Record<string, "device_full" | "storage_blocked" | "too_many_saved"> = {
  device_full: "device_full",
  storage_blocked: "storage_blocked",
  too_many_saved: "too_many_saved",
};
