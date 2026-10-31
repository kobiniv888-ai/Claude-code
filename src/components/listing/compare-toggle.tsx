"use client";

import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, GitCompareArrowsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useCompare } from "@/hooks/use-compare";
import { COMPARE_PATH } from "@/lib/listing/urls";
import { cn } from "@/lib/utils";

/** Adds or removes a listing from the compare list (max siteConfig.listings.compareMax). */
export function CompareToggle({
  publicId,
  variant = "button",
  className,
}: {
  publicId: number;
  /** "button" = labeled outline button; "icon" = round icon button (over a photo). */
  variant?: "button" | "icon";
  className?: string;
}) {
  const t = useTranslations("listingCard.compare");
  const router = useRouter();
  const compare = useCompare();
  const active = compare.has(publicId);
  const openCompare = { label: t("open"), onClick: () => router.push(COMPARE_PATH) };

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const result = compare.toggle(publicId);
    if (result === "full") toast.error(t("full", { count: compare.max }), { action: openCompare });
    else if (result === "added") toast.success(t("added"), compare.count + 1 >= 2 ? { action: openCompare } : undefined);
    else if (result === "removed") toast(t("removed"));
  };

  const Icon = active ? CheckIcon : GitCompareArrowsIcon;
  const label = active ? t("remove") : t("add");

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur transition outline-none",
          "hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-90",
          active && "bg-primary text-primary-foreground hover:bg-primary/90",
          className,
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      aria-pressed={active}
      className={cn("h-10 rounded-xl", className)}
    >
      <Icon aria-hidden="true" />
      {active ? t("remove") : t("add")}
    </Button>
  );
}
