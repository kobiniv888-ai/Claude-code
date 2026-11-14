"use client";

import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Link, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { setAlertEmailAction } from "@/lib/saved-searches/actions";
import { toast } from "@/lib/toast";

type Kind = "savedSearches" | "priceDrops";

/**
 * The two email switches of /account/alerts (round 3, brief 7.4): new places for the saved
 * searches, and price drops of saved places. Optimistic; a failure puts the switch back.
 */
export function AlertEmailSwitches({
  initial,
  watching,
  emailState,
}: {
  initial: Record<Kind, boolean>;
  /** Saved places of other people's live listings (what the price-drop email watches). */
  watching: number;
  /** "none": no address to write to; "failing": the address is paused after a bounce. */
  emailState: "ok" | "none" | "failing";
}) {
  const t = useTranslations("alerts.page.emails");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  const change = (kind: Kind, on: boolean) => {
    const before = value[kind];
    setValue((v) => ({ ...v, [kind]: on }));
    startTransition(async () => {
      const result = await setAlertEmailAction({ kind, on }).catch(() => null);
      if (!result?.ok) {
        setValue((v) => ({ ...v, [kind]: before }));
        toast.error(t("failed"));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  };

  const row = (kind: Kind, extra?: React.ReactNode) => (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <label htmlFor={`${id}-${kind}`} className="text-sm font-medium text-pretty">
          {t(`${kind}.label`)}
        </label>
        <p className="text-xs text-muted-foreground text-pretty">{t(`${kind}.hint`)}</p>
        {extra}
      </div>
      <Switch
        id={`${id}-${kind}`}
        checked={value[kind]}
        onCheckedChange={(on) => change(kind, on)}
        data-alert-switch={kind}
        className="mt-1 after:-inset-x-3 after:-inset-y-3.5"
      />
    </li>
  );

  return (
    <div className="grid gap-3">
      {emailState !== "ok" ? (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-pretty" role="note">
          {emailState === "none" ? t("noEmail") : t("failing")}{" "}
          <Link href="/account/settings#email" className="font-medium text-primary-text underline-offset-4 hover:underline">
            {emailState === "none" ? t("addEmail") : t("checkEmail")}
          </Link>
        </p>
      ) : null}
      <ul className="divide-y">
        {row("savedSearches")}
        {row(
          "priceDrops",
          <p className="text-xs text-muted-foreground">
            {t("watching", { count: watching, countText: formatNumber(watching, locale) })}{" "}
            <Link href="/account/favorites" className="font-medium text-primary-text underline-offset-4 hover:underline">
              {t("lists")}
            </Link>
          </p>,
        )}
      </ul>
    </div>
  );
}
