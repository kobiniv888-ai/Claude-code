"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ErrorState } from "@/components/common/states";
import { JlContainer } from "@/components/jewish-life/section";

export default function JewishLifeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("jewishLife.error");

  useEffect(() => {
    console.error("[jewish-life] page error:", error);
  }, [error]);

  return (
    <JlContainer className="py-10">
      <ErrorState
        size="lg"
        headingLevel="h1"
        title={t("title")}
        description={t("body")}
        action={{ label: t("retry"), onClick: reset, icon: RotateCcw }}
        secondaryAction={{ label: t("home"), href: "/" }}
      />
    </JlContainer>
  );
}
