"use client";

import { useEffect } from "react";
import { House, LifeBuoy, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { LogoLink } from "@/components/common/logo";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The friendly "something went wrong" page used by the error boundaries. `standalone` adds a
 * minimal top bar for errors that happen outside the site header (e.g. in the header itself).
 */
export function ErrorView({
  error,
  retry,
  standalone = false,
}: {
  error: unknown;
  retry: () => void;
  standalone?: boolean;
}) {
  const t = useTranslations("states.error");
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  const content = (
    <Container size="narrow" className="flex flex-1 items-center justify-center">
      <ErrorState
        size="lg"
        headingLevel="h1"
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        action={{ label: t("retry"), onClick: retry, icon: RotateCcw }}
        secondaryAction={{ label: t("home"), href: "/", icon: House }}
      >
        <Button asChild variant="link" className="h-auto gap-1.5 px-0 text-sm font-medium text-muted-foreground hover:text-foreground">
          <Link href="/help">
            <LifeBuoy aria-hidden className="size-4" />
            {t("report")}
          </Link>
        </Button>
        {digest ? (
          <p className="text-xs text-muted-foreground/80">
            {t("reference", { digest })}
          </p>
        ) : null}
      </ErrorState>
    </Container>
  );

  if (!standalone) return <div className="flex min-h-[60vh] flex-col py-6">{content}</div>;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b">
        <Container className="flex h-14 items-center lg:h-16">
          <LogoLink />
        </Container>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col py-6 outline-none">
        {content}
      </main>
    </div>
  );
}
