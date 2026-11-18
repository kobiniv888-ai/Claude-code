"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { BellPlusIcon, BellRingIcon } from "lucide-react";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { useRouter } from "@/i18n/navigation";
import { DEFAULT_SORT, DEFAULT_VIEW, serializeSearchQuery } from "@/lib/listing/search-params";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-context";

const loadSheet = () => import("./save-search-sheet");
// The name sheet (and the server action behind it) loads at the first tap, not with the results.
const SaveSearchSheet = dynamic(() => loadSheet().then((m) => m.SaveSearchSheet), { ssr: false });

export type SaveSearchButtonProps = {
  /** The prefilled name, from the server ("השכרה לטווח קצר בבטומי · 10–14 בדצמ׳"). */
  defaultName: string;
  /** This search is already saved (and on): the button leads to the alerts page instead. */
  saved: boolean;
  /** "pill": the floating pill next to "מפה" on phones; "inline": the count line from 1024px. */
  variant: "pill" | "inline";
  className?: string;
};

/**
 * "שמירת חיפוש" (round 3, brief 7.4): saves the results page's search (city, deal type,
 * property types, filters and dates) under a name, for the daily email about new places.
 * Signed in only: a signed-out visitor gets the sign-in sheet first, then the name sheet.
 */
export function SaveSearchButton({ defaultName, saved, variant, className }: SaveSearchButtonProps) {
  const t = useTranslations("alerts.save");
  const { filters } = useSearch();
  const router = useRouter();
  const requireLogin = useRequireLogin();
  const [sheet, setSheet] = useState({ wanted: false, open: false });
  const query = serializeSearchQuery({ ...filters, sort: DEFAULT_SORT, view: DEFAULT_VIEW, page: 1 });
  const Icon = saved ? BellRingIcon : BellPlusIcon;

  const onClick = () => {
    if (saved) {
      router.push("/account/alerts");
      return;
    }
    void loadSheet();
    void requireLogin(() => setSheet({ wanted: true, open: true }));
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={() => void loadSheet()}
        onFocus={() => void loadSheet()}
        aria-haspopup={saved ? undefined : "dialog"}
        data-save-search={saved ? "saved" : ""}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full text-small font-semibold outline-none transition-[transform,background-color] duration-(--motion-fast) focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100",
          variant === "pill"
            ? "h-11 border border-border-strong bg-card px-4 text-foreground shadow-float"
            : "min-h-11 px-3 text-foreground hover:bg-muted",
          saved && "text-primary-text",
          className,
        )}
      >
        <Icon className={cn("size-4.5", saved ? "text-primary-text" : "text-primary-text")} aria-hidden="true" />
        <span className="truncate">{saved ? t("savedButton") : t("button")}</span>
      </button>
      {sheet.wanted ? (
        <SaveSearchSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet({ wanted: true, open })}
          defaultName={defaultName}
          query={query}
          onReopenAfterLogin={() => void requireLogin(() => setSheet({ wanted: true, open: true }))}
        />
      ) : null}
    </>
  );
}
