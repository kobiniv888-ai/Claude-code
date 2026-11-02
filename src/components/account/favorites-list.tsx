"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, CloudOffIcon, HeartIcon, HeartOffIcon, LoaderIcon, MapPinIcon, SearchIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { EmptyState } from "@/components/ds/empty-state";
import { siteConfig, type AppLocale } from "@/config/site";
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
      <label htmlFor={id} className="text-small font-semibold">
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
        className="min-h-16 resize-y rounded-input bg-card"
      />
      <p aria-live="polite" className="flex min-h-5 items-center gap-1 text-xs text-muted-foreground">
        {state === "saving" ? (
          <>
            <LoaderIcon className="size-3.5 animate-spin" aria-hidden="true" />
            {t("saving")}
          </>
        ) : state === "saved" ? (
          <>
            <CheckIcon className="size-3.5 text-success" aria-hidden="true" />
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
      className="h-11 rounded-full px-3 text-muted-foreground"
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
    return <FavoritesEmpty />;
  }

  return (
    <ul className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) =>
        item.available ? (
          <li key={item.listingId} className="flex min-w-0 flex-col gap-3">
            <ListingCard listing={item.card} />
            <div className="grid gap-2 rounded-card bg-muted/60 p-3">
              <NoteEditor listingId={item.listingId} initial={item.note} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CompareToggle publicId={item.card.publicId} />
                <RemoveButton listingId={item.listingId} onRemoved={() => onRemoved(item.listingId)} />
              </div>
            </div>
          </li>
        ) : (
          <li key={item.listingId} className="flex min-w-0 flex-col gap-3 rounded-card border border-dashed bg-muted/40 p-4">
            <p className="text-caption font-semibold text-muted-foreground">{t("unavailable")}</p>
            <p className="text-h3 break-words" dir="auto">
              {item.title || t("untitled")}
            </p>
            <p className="text-small text-muted-foreground">{t("unavailableBody")}</p>
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

/** Nothing saved yet: a coral heart, one line, "Start searching" and the first three popular cities. */
export function FavoritesEmpty() {
  const t = useTranslations("account.favorites");
  const locale = useLocale() as AppLocale;
  return (
    <EmptyState
      icon={HeartIcon}
      tone="coral"
      title={t("emptyTitle")}
      description={t("emptyBody")}
      action={{ label: t("startSearching"), href: "/search", icon: SearchIcon }}
      quickFixes={siteConfig.cities
        .filter((city) => city.popular)
        .slice(0, 3)
        .map((city) => ({ label: city.names[locale], href: `/search?city=${city.slug}`, icon: MapPinIcon }))}
      className="rounded-card bg-card px-6 shadow-raised ring-1 ring-foreground/5"
    />
  );
}
