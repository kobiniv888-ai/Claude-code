import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { ArrowEnd } from "@/components/common/directional-icon";
import { IconCircle } from "@/components/ds/icon-circle";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";

/** A small, friendly safety tip with a link to the Safety Center. */
export async function SafetyNote({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.safety" });
  return (
    <aside aria-labelledby="home-safety-title" className="py-[calc(var(--section-space)*0.3)]">
      <Container size="narrow">
        <div className="flex items-start gap-3 rounded-card bg-card p-4 shadow-xs ring-1 ring-foreground/5 sm:items-center sm:gap-4">
          <IconCircle icon={ShieldCheck} tone="green" size="md" />
          <div className="grid min-w-0 flex-1 gap-0.5 sm:flex sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="home-safety-title" className="text-small font-bold text-foreground">
                {t("title")}
              </h2>
              <p className="text-small text-pretty text-muted-foreground">{t("text")}</p>
            </div>
            <Link
              href="/safety"
              className="group -ms-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-1 text-small font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("link")}
              <ArrowEnd className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Container>
    </aside>
  );
}
