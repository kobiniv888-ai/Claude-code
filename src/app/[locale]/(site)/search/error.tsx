"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, SearchX } from "lucide-react";
import { Container } from "@/components/common/container";
import { ErrorState } from "@/components/common/states";

/** The search could not load: try again, or start over without filters. */
export default function SearchError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("search.error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container size="narrow" className="py-16">
      <ErrorState
        headingLevel="h1"
        title={t("title")}
        description={t("description")}
        action={{ label: t("retry"), onClick: retry, icon: RotateCcw }}
        secondaryAction={{ label: t("startOver"), href: "/search", icon: SearchX }}
      />
    </Container>
  );
}
