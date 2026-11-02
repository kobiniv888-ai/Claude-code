"use client";

import { useTranslations } from "next-intl";
import { CopyIcon } from "lucide-react";
import { toast } from "@/lib/toast";

/** Copies a booking number ("BT-7K3Q9"), with a short confirmation. Text: `booking.trip`. */
export function CopyCode({ code }: { code: string }) {
  const t = useTranslations("booking.trip");
  return (
    <button
      type="button"
      aria-label={t("copy")}
      title={t("copy")}
      onClick={() => {
        navigator.clipboard
          ?.writeText(code)
          .then(() => toast.success(t("copied")))
          .catch(() => undefined);
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CopyIcon className="size-4.5" aria-hidden />
    </button>
  );
}
