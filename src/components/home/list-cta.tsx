import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { buttonStyles } from "@/components/ds/button";
import { HousePlusIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The host card (brief round 2, 5.2): "Have a place in Georgia? List it for free" and one button
 * to /post, on the soft purple tint. No photo.
 */
export async function ListCta({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.listCta" });
  return (
    <section aria-labelledby="home-cta-title">
      <Container>
        <div className="flex flex-col gap-3 rounded-card bg-primary-tint p-4 ring-1 ring-primary-tint-border sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary-text ring-1 ring-primary-tint-border">
              <HousePlusIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 id="home-cta-title" className="min-w-0 text-base leading-snug font-semibold text-pretty text-foreground">
              {t("title")}
            </h2>
          </div>
          <Link href="/post" className={cn(buttonStyles({ variant: "primary" }), "w-full sm:w-auto")}>
            {t("button")}
          </Link>
        </div>
      </Container>
    </section>
  );
}
