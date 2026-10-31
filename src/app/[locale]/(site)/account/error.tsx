"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CloudOffIcon, RotateCcwIcon } from "lucide-react";
import { ErrorState } from "@/components/common/states";

/** Shown when a dashboard page fails to load; the side navigation stays usable. */
export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("account.error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-10">
      <ErrorState
        bordered
        icon={CloudOffIcon}
        title={t("title")}
        description={t("body")}
        action={{ label: t("retry"), onClick: reset, icon: RotateCcwIcon }}
        secondaryAction={{ label: t("home"), href: "/account" }}
      />
    </div>
  );
}
