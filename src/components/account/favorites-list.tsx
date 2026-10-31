"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CloudOffIcon, HeartOffIcon, LoaderIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/states";
import { CompareToggle } from "@/components/listing/compare-toggle";
import { ListingCard } from "@/components/listing/listing-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { FavoriteItem } from "@/lib/account/queries";
import { toggleFavorite, updateFavoriteNote } from "@/lib/listing/favorites";
import { useActionError } from "./use-action-error";

const NOTE_MAX = 500;
const SAVE_DELAY_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

/** A private note that saves itself shortly after the user stops typing. */
function NoteEditor({ listingId, initial }: { listingId: string; initial: string | null }) {
  const t = useTranslations("account.favorites.note");
  const id = useId();
  const [value, setValue] = useState(initial ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const saved = useRef(initial ?? "");

  useEffect(() => {
    if (value.trim() === saved.current.trim()) return;
    const timer = setTimeout(async () => {
      setState("saving");
      const result = await updateFavoriteNote(listingId, value);
      if (result.ok) {
        saved.current = value;
        setState("saved");
      } else {
        setState("error");
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, listingId]);

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("label")}
      </label>
      <Textarea
        id={id}
        dir="auto"
        value={value}
        maxLength={NOTE_MAX}
        rows={2}
        placeholder={t("placeholder")}
        onChange={(event) => setValue(event.target.value)}
        className="min-h-16 resize-y bg-background"
      />
      <p aria-live="polite" className="flex min-h-5 items-center gap-1 text-xs text-muted-foreground">
        {state === "saving" ? (
          <>
            <LoaderIcon className="size-3.5 animate-spin" aria-hidden="true" />
            {t("saving")}
          </>
        ) : state === "saved" ? (
          <>
            <CheckIcon className="size-3.5 text-verified" aria-hidden="true" />
            {t("saved")}
          </>
        ) : state === "error" ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <CloudOffIcon className="size-3.5" aria-hidden="true" />
            {t("error")}
          </span>
        ) : (
          t("private")
        )}
      </p>
    </div>
  );
}

function RemoveButton({ listingId, onRemoved }: { listingId: string; onRemoved: () => void }) {
  const t = useTranslations("account.favorites");
  const errorText = useActionError();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-10 rounded-xl px-3 text-muted-foreground"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleFavorite(listingId, false);
          if (!result.ok) {
            toast.error(errorText(result.error));
            return;
          }
          onRemoved();
          toast(t("removed"));
        })
      }
    >
      <HeartOffIcon aria-hidden="true" />
      {t("remove")}
    </Button>
  );
}

export function FavoritesList({ items }: { items: FavoriteItem[] }) {
  const t = useTranslations("account.favorites");
  const router = useRouter();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const visible = items.filter((item) => !removed.has(item.listingId));

  const onRemoved = (listingId: string) => {
    setRemoved((prev) => new Set(prev).add(listingId));
    router.refresh();
  };

  if (visible.length === 0) {
    return (
      <EmptyState
        bordered
        icon={HeartOffIcon}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={{ label: t("search"), href: "/search", icon: SearchIcon }}
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) =>
        item.available ? (
          <li key={item.listingId} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-xs">
            <ListingCard listing={item.card} />
            <NoteEditor listingId={item.listingId} initial={item.note} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CompareToggle publicId={item.card.publicId} />
              <RemoveButton listingId={item.listingId} onRemoved={() => onRemoved(item.listingId)} />
            </div>
          </li>
        ) : (
          <li key={item.listingId} className="flex flex-col gap-3 rounded-2xl border border-dashed bg-muted/40 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{t("unavailable")}</p>
            <p className="font-semibold break-words" dir="auto">
              {item.title || t("untitled")}
            </p>
            <p className="text-sm text-muted-foreground">{t("unavailableBody")}</p>
            <NoteEditor listingId={item.listingId} initial={item.note} />
            <div className="mt-auto flex justify-end">
              <RemoveButton listingId={item.listingId} onRemoved={() => onRemoved(item.listingId)} />
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
