import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { cardStyles } from "@/components/ds/card";
import { SynagogueIcon } from "@/components/ds/jewish-icons";
import { ChevronRightIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The one slim link to the Jewish life hub near the bottom of the home page (brief round 2, 4 and
 * 5.2): "Jewish life in Georgia · Shabbat times, synagogues, kosher food ←". Kosher and Shabbat
 * content is an extra, so it is one quiet row, not a band.
 */
export async function JewishLifeCard({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "home.jewishLife" });
  return (
    <section aria-labelledby="home-jewish-life-title">
      <Container>
        <Link
          href="/jewish-life"
          className={cn(
            cardStyles({ padding: "none", interactive: true }),
            "group flex min-h-16 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
            <SynagogueIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <h2 id="home-jewish-life-title" className="text-base leading-snug font-semibold text-foreground">
              {t("title")}
            </h2>
            <span className="text-small leading-snug text-pretty text-muted-foreground">{t("text")}</span>
          </span>
          <ChevronRightIcon
            className="size-5 shrink-0 text-primary-text transition-transform duration-(--motion-fast) rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      </Container>
    </section>
  );
}
