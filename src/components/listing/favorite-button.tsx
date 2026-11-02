"use client";

import { useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { HeartButton } from "@/components/ds/heart-button";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { toggleFavorite } from "@/lib/listing/favorites";
import { FAVORITES_PATH } from "@/lib/listing/paths";

/**
 * The heart (coral, pops when saved). Optimistic: it fills at once and rolls back if saving fails. Signed-out visitors
 * get the login dialog first, and the save runs right after they log in.
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
  const te = useTranslations("errors");
  const requireLogin = useRequireLogin();
  const router = useRouter();
  const [state, setState] = useState({ value: initial, server: initial });
  const [pending, setPending] = useState(false);

  // A fresh value from the server (navigation, refresh) wins over the local one.
  let isFavorite = state.value;
  if (state.server !== initial) {
    isFavorite = initial;
    setState({ value: initial, server: initial });
  }
  const apply = (value: boolean) => setState((s) => ({ ...s, value }));

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    void requireLogin(async () => {
      const next = !isFavorite;
      apply(next);
      setPending(true);
      try {
        const result = await toggleFavorite(listingId, next);
        if (!result.ok) {
          apply(!next);
          const key = errorMessageKey(result.error);
          toast.error(key === "rate_limited" || key === "auth_required" ? te(key) : t("failed"));
          return;
        }
        apply(result.data.isFavorite);
        onChange?.(result.data.isFavorite);
        if (result.data.isFavorite) {
          toast.success(t("saved"), { action: { label: t("viewSaved"), onClick: () => router.push(FAVORITES_PATH) } });
        } else {
          toast(t("removed"));
        }
      } catch {
        apply(!next);
        toast.error(t("failed"));
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <HeartButton
      pressed={isFavorite}
      onClick={onClick}
      label={isFavorite ? t("unsave", { title }) : t("save", { title })}
      busy={pending}
      variant={variant}
      className={className}
    />
  );
}
