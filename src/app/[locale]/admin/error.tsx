"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorState } from "@/components/common/states";

/** Errors inside the admin panel keep the panel's sidebar and top bar. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("admin.errorPage");
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);
  return (
    <ErrorState
      icon={TriangleAlert}
      bordered
      title={t("title")}
      description={t("description")}
      action={{ label: t("retry"), onClick: reset, icon: RefreshCw }}
      secondaryAction={{ label: t("overview"), href: "/admin" }}
    >
      {error.digest ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("reference")} <bdi dir="ltr">{error.digest}</bdi>
        </p>
      ) : null}
    </ErrorState>
  );
}
