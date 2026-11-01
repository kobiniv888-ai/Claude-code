import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentContainer } from "@/components/content/content-container";
import { creditedPhotos, photoFile, type PhotoCredit } from "@/config/photos";
import { db } from "@/lib/db";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "photos.credits" });
  return pageMetadata({ locale, path: "/photo-credits", title: t("metaTitle"), description: t("metaDescription") });
}

const GROUPS = [
  { key: "hero", prefix: "/photos/hero/" },
  { key: "cities", prefix: "/photos/cities/" },
  { key: "categories", prefix: "/photos/categories/" },
  { key: "cta", prefix: "/photos/cta/" },
  { key: "jewish", prefix: "/photos/jewish/" },
] as const;

/** /photo-credits — every photo of the site with its author, source and license (CC BY / BY-SA need it). */
export default async function PhotoCreditsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("photos.credits");
  const photos = creditedPhotos();
  // Demo listings use stock photos (they disappear with the demo data).
  const demoCount = await db.listingPhoto.count({ where: { listing: { isDemo: true } } }).catch(() => 0);

  return (
    <ContentContainer size="narrow" className="grid gap-8 py-8 sm:py-12">
      <header className="grid gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-pretty text-muted-foreground">{t("lead")}</p>
      </header>

      {GROUPS.map((group) => {
        const items = photos.filter((p) => p.src.startsWith(group.prefix));
        if (items.length === 0) return null;
        return (
          <section key={group.key} aria-labelledby={`credits-${group.key}`} className="grid gap-3">
            <h2 id={`credits-${group.key}`} className="text-xl font-semibold">
              {t(`groups.${group.key}`)}
            </h2>
            <ul className="grid gap-2">
              {items.map(({ src, credit }) => (
                <CreditRow
                  key={src}
                  src={src}
                  credit={credit}
                  // The name keeps its own direction inside the sentence (FSI … PDI isolate).
                  photoBy={t("photoBy", { author: `\u2068${credit.author}\u2069` })}
                  sourceLabel={t("source")}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {demoCount > 0 && (
        <p className="rounded-2xl bg-secondary/70 p-4 text-sm text-pretty">
          {t("listings", { count: demoCount })}{" "}
          <a href="https://unsplash.com/license" className="font-medium text-primary underline underline-offset-4" rel="noopener noreferrer license" target="_blank">
            Unsplash License
          </a>
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t("shareAlike")}</p>
    </ContentContainer>
  );
}

function CreditRow({ src, credit, photoBy, sourceLabel }: { src: string; credit: PhotoCredit; photoBy: string; sourceLabel: string }) {
  const file = photoFile(src);
  return (
    <li className="flex items-center gap-3 rounded-2xl border bg-card p-2.5 pe-4">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
        {file && (
          <Image src={src} alt="" fill sizes="64px" placeholder="blur" blurDataURL={file.blurDataURL} className="object-cover" />
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
        {/* Titles and names are kept as on the source page. */}
        <p className="font-medium" dir="auto">
          {credit.title}
        </p>
        <p className="text-muted-foreground">{photoBy}</p>
        <p>
          <a
            href={credit.licenseUrl}
            dir="ltr"
            className="whitespace-nowrap text-muted-foreground underline underline-offset-4 hover:text-foreground"
            rel="noopener noreferrer license"
            target="_blank"
          >
            {credit.license}
          </a>
        </p>
      </div>
      <a
        href={credit.source}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="hidden sm:inline">{sourceLabel}</span>
        <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden />
        <span className="sr-only sm:hidden">{sourceLabel}</span>
      </a>
    </li>
  );
}
