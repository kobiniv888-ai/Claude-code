import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { PhotoSlot } from "@/components/photos/photo-slot";
import { HERO_SLIDES, resolvePhoto } from "@/config/photos";
import type { AppLocale } from "@/config/site";
import { siteName } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { HeroSlideshow, type HeroSlide } from "./hero-slideshow";
import { HomeMotionStyles } from "./home-motion";

const rise = (delay: number) => ({ "--rise-delay": `${delay}ms` }) as CSSProperties;

/**
 * The top of the home page: a full-bleed slideshow of Georgia under a dark gradient, the promise
 * (eyebrow, headline, one line) and the search card floating over the photo's bottom edge.
 * The first photo is the LCP image (priority, 100vw); the slideshow fetches the rest after load.
 */
export async function HomeHero({ locale, searchCard }: { locale: AppLocale; searchCard: ReactNode }) {
  const [t, tPhotos] = await Promise.all([
    getTranslations({ locale, namespace: "home.hero" }),
    getTranslations({ locale, namespace: "photos" }),
  ]);
  const [first, ...rest] = HERO_SLIDES;
  const base = resolvePhoto(first);
  const slides = rest.flatMap((slot): HeroSlide[] => {
    const photo = resolvePhoto(slot);
    return photo.kind === "photo" ? [{ src: photo.src, blurDataURL: photo.blurDataURL }] : [];
  });

  return (
    <section aria-labelledby="home-hero-title" className="relative isolate">
      <HomeMotionStyles />
      {/* A minimum height that is taller than the text in most languages, so the photo box keeps its
          size when the web font replaces the fallback font: a later slide must never paint larger than
          the first photo, or it would become the page's LCP. */}
      <div className="relative isolate min-h-[25rem] overflow-hidden bg-neutral-900 sm:min-h-[27rem] md:min-h-[26rem] lg:min-h-[32rem]">
        <div className="absolute inset-0">
          <HeroSlideshow slides={slides} labels={{ pause: t("pause"), play: t("play") }}>
            {base.kind === "photo" ? (
              // The LCP image: fetched at high priority straight from the HTML (Next 16: fetchPriority
              // instead of the deprecated `priority`, which only adds a low-priority preload).
              <Image
                src={base.src}
                alt={tPhotos(`alt.${base.slot}`)}
                fill
                sizes="100vw"
                loading="eager"
                fetchPriority="high"
                placeholder="blur"
                blurDataURL={base.blurDataURL}
                className="object-cover"
              />
            ) : (
              <PhotoSlot slot={first} sizes="100vw" className="absolute inset-0" />
            )}
          </HeroSlideshow>
          {/* Legibility: at least 55% black behind every line of text (white text ≥ 4.6:1 on any photo);
              lighter at the bottom, where the search card covers the photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[2] bg-linear-to-b from-black/60 via-black/55 via-60% to-black/25"
          />
        </div>

        <Container className="relative z-[3] pt-7 pb-36 text-center text-white sm:pt-12 sm:pb-40 md:pb-32 lg:pt-20 lg:pb-36">
          <div className="mx-auto flex max-w-3xl flex-col items-center lg:max-w-4xl">
            <p
              className={`bh-rise inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-small font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm`}
            >
              <MapPin className="size-4" aria-hidden="true" />
              {t("eyebrow", { siteName: siteName(locale) })}
            </p>
            <h1
              id="home-hero-title"
              style={rise(60)}
              className={`bh-rise mt-3 text-display text-balance text-white max-sm:[&:lang(ka)]:text-[1.75rem] [text-shadow:0_2px_16px_rgb(0_0_0/0.35)]`}
            >
              {t("title")}
            </h1>
            <p
              style={rise(120)}
              className={`bh-rise mt-3 max-w-2xl text-body text-pretty text-white/95 [text-shadow:0_1px_8px_rgb(0_0_0/0.4)] sm:text-lg`}
            >
              {t("lead")}
            </p>
          </div>
        </Container>
      </div>

      <Container className="relative z-10 -mt-28 sm:-mt-32 md:-mt-24 lg:-mt-28">
        <div style={rise(180)} className={cn("mx-auto max-w-5xl", "bh-rise")}>
          {searchCard}
        </div>
      </Container>
    </section>
  );
}
