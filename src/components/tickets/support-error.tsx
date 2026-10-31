"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Container } from "@/components/common/container";
import { ErrorState } from "@/components/common/states";

/** Error boundary content for the help center and ticket pages: retry, or write to support. */
export function SupportError({
  error,
  retry,
  secondary = "contact",
}: {
  error: unknown;
  retry: () => void;
  /** The other way forward: the contact form, or the help center (on the contact page itself). */
  secondary?: "contact" | "help";
}) {
  const t = useTranslations("tickets.loadError");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container size="narrow" className="py-10">
      <ErrorState
        bordered
        title={t("title")}
        description={t("body")}
        action={{ label: t("retry"), onClick: retry, icon: RotateCcw }}
        secondaryAction={
          secondary === "help" ? { label: t("help"), href: "/help" } : { label: t("contact"), href: "/contact" }
        }
      />
    </Container>
  );
}
