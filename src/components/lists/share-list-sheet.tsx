"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2OffIcon, LinkIcon, LoaderIcon, ShieldCheckIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/common/brand-icons";
import { CopyLinkField } from "@/components/common/copy-link-field";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { isPermanentSiteUrl } from "@/lib/site-url";
import { setListSharingAction } from "@/lib/lists/actions";
import { toast } from "@/lib/toast";
import { listNameArg } from "./list-text";

/** wa.me with the list's name and link (no phone number: WhatsApp asks whom to send it to). */
export function whatsappShareHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/**
 * Sharing one list (round 3, brief 7.2): turns on a private, view-only link (a new unguessable one
 * each time sharing starts), shows it to copy, sends it on WhatsApp, and stops sharing (the link
 * then stops working).
 */
export function ShareListSheet({
  open,
  onOpenChange,
  listId,
  name,
  url: initialUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  /** The list's name as shown. */
  name: string;
  /** The live link (null = not shared). */
  url: string | null;
}) {
  const t = useTranslations("lists.share");
  const tl = useTranslations("lists.saving");
  const te = useTranslations("errors");
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [pending, setPending] = useState<"on" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Another list, or a fresh link from the server: show that one (never a previous list's link, ui-1).
  const [seen, setSeen] = useState({ listId, initialUrl });
  if (seen.listId !== listId || seen.initialUrl !== initialUrl) {
    setSeen({ listId, initialUrl });
    setUrl(initialUrl);
    setError(null);
  }

  const setSharing = async (shared: boolean) => {
    if (pending) return;
    setPending(shared ? "on" : "off");
    setError(null);
    try {
      const result = await setListSharingAction({ listId, shared });
      if (!result.ok) {
        setError(te(errorMessageKey(result.error)));
        return;
      }
      setUrl(result.data.url);
      toast.success(shared ? t("started") : t("stopped"));
      router.refresh();
    } catch {
      setError(tl("errors.failed"));
    } finally {
      setPending(null);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)} title={t("title", { name: listNameArg(name) })}>
      <div className="grid gap-4 pb-1">
        <p className="flex items-start gap-3 rounded-input bg-surface-muted px-3 py-3 text-small text-pretty">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          {t("intro")}
        </p>
        {url ? (
          <>
            <CopyLinkField value={url} label={t("linkLabel")} />
            {isPermanentSiteUrl(url) ? (
              <Button asChild variant="whatsapp" block>
                <a href={whatsappShareHref(t("whatsappText", { name }), url)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon aria-hidden className="size-5" />
                  {t("whatsapp")}
                </a>
              </Button>
            ) : (
              // A temporary address (codespace, preview) would break later: like Copy, not offered yet.
              <Button variant="whatsapp" block disabled>
                <WhatsAppIcon aria-hidden className="size-5" />
                {t("whatsapp")}
              </Button>
            )}
            <div className="grid gap-2 border-t pt-4">
              <Button variant="outline" block onClick={() => void setSharing(false)} disabled={pending !== null} aria-busy={pending === "off" || undefined}>
                {pending === "off" ? <LoaderIcon className="animate-spin" aria-hidden /> : <Link2OffIcon aria-hidden />}
                {t("stop")}
              </Button>
              <p className="text-small text-pretty text-muted-foreground">{t("stopHint")}</p>
            </div>
          </>
        ) : (
          <Button block onClick={() => void setSharing(true)} disabled={pending !== null} aria-busy={pending === "on" || undefined}>
            {pending === "on" ? <LoaderIcon className="animate-spin" aria-hidden /> : <LinkIcon aria-hidden />}
            {t("create")}
          </Button>
        )}
        {error ? (
          <p role="alert" className="text-small text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
