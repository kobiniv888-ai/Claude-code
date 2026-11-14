import { getTranslations } from "next-intl/server";
import { PhotoSlot } from "@/components/photos/photo-slot";
import type { AppLocale } from "@/config/site";
import { JlContainer } from "./section";

/**
 * Top of /jewish-life (round 2, brief 5.9): a calm title band. Light mode: the purple of the
 * header continues into a band with 28px rounded bottom corners (like the home hero); dark mode:
 * no band. On desktop a small photo of the Great Synagogue of Tbilisi sits beside the title.
 * No slideshow, no zoom, no staggered entrance.
 */
export async function JewishLifeHero({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "jewishLife.hero" });

  return (
    <section
      aria-labelledby="jewish-life-title"
      className="rounded-b-[1.75rem] bg-primary text-white dark:rounded-none dark:bg-background dark:text-foreground"
    >
      <JlContainer className="flex items-center gap-8 pt-5 pb-7 sm:pt-8 sm:pb-10">
        <div className="min-w-0 flex-1">
          <h1 id="jewish-life-title" className="text-display text-balance">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-xl text-body text-pretty text-white/85 dark:text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="hidden w-72 shrink-0 overflow-hidden rounded-card lg:block">
          <PhotoSlot slot="jewish.tbilisiSynagogue" sizes="288px" className="aspect-[16/9] w-full" imageClassName="object-[50%_35%]" />
        </div>
      </JlContainer>
    </section>
  );
}
