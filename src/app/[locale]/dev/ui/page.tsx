import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompassIcon, HeartIcon, MapPinIcon, PlusIcon, SearchIcon, SearchXIcon, ShareIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/common/brand-icons";
import {
  BadgeRow,
  BayitBadge,
  Button,
  CardCarousel,
  EmptyState,
  IconCircle,
  ListingCardSkeleton,
  PhotoCarousel,
  Reveal,
  SectionHeader,
  Skeleton,
  jewishIcons,
  type BayitBadgeKind,
} from "@/components/ds";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import { ListingCard } from "@/components/listing/listing-card";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/locale";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import { getNewestListings } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { locales } from "@/config/site";
import { ChipsDemo, ContactBarDemo, HeartDemo, NumberRollDemo, SegmentedDemo, SheetDemo } from "./interactive";

/**
 * /dev/ui — hidden showcase of the design system (tokens and components). Only in development
 * or with NEXT_PUBLIC_SHOW_DEV_UI=true; 404 otherwise. Never linked, never indexed.
 */
const enabled = () => process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SHOW_DEV_UI === "true";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  if (!enabled()) return {};
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ds.devUi" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const COLORS = [
  "background",
  "surface",
  "card",
  "foreground",
  "muted",
  "muted-foreground",
  "border",
  "navy",
  "navy-soft",
  "coral",
  "coral-strong",
  "coral-soft",
  "verified",
  "verified-soft",
  "warning",
  "warning-soft",
  "whatsapp",
  "destructive",
] as const;

const TYPE = ["display", "h1", "h2", "h3", "body", "small", "caption"] as const;
/** Written out in full so Tailwind finds the classes. */
const TYPE_CLASS: Record<(typeof TYPE)[number], string> = {
  display: "text-display",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  body: "text-body",
  small: "text-small",
  caption: "text-caption",
};
const SHADOWS = ["shadow-card", "shadow-card-hover", "shadow-raised", "shadow-float"] as const;
const BADGES: BayitBadgeKind[] = [
  "welcomes",
  "verified",
  "hebrew",
  "kosherKitchen",
  "kosherMeals",
  "shabbatFriendly",
  "synagogueWalk",
  "keepsShabbat",
  "business",
];
const TAGS: BayitBadgeKind[] = ["welcomes", "demo", "new", "priceDropped", "promoted"];

function Section({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`ds-${name}`} className="flex flex-col gap-4 border-t border-border pt-8">
      <h2 id={`ds-${name}`} className="font-mono text-sm font-semibold text-muted-foreground" dir="ltr">
        {name}
      </h2>
      {children}
    </section>
  );
}

/** Demo variations of a real card (or a stand-in when the database is empty). */
function variants(base: ListingCardData | undefined): ListingCardData[] {
  const card: ListingCardData = base ?? {
    id: "dev-ui-card",
    publicId: 1000,
    href: "/search",
    title: "—",
    titleIsAutoTranslated: false,
    cityName: null,
    neighborhoodName: null,
    photos: [],
    price: 450,
    currency: "ILS",
    pricePeriod: "NIGHT",
    priceIsFrom: false,
    priceUsd: null,
    dealType: "SHORT_STAY",
    propertyType: "APARTMENT",
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 70,
    maxGuests: 4,
    badges: {
      welcomes: false,
      verified: false,
      business: false,
      shabbatFriendly: false,
      kosherKitchen: false,
      synagogueWalkMin: null,
      speaksHebrew: false,
      keepsShabbat: false,
      kosherMeals: false,
      isNew: false,
      priceDropped: false,
      promoted: false,
      demo: true,
    },
    lat: null,
    lng: null,
    isFavorite: false,
    publishedAt: null,
  };
  return [
    {
      ...card,
      id: `${card.id}-all`,
      publicId: card.publicId + 100000,
      photoCount: Math.max(14, card.photos.length + 8),
      floor: 3,
      badges: {
        ...card.badges,
        welcomes: true,
        verified: true,
        speaksHebrew: true,
        kosherKitchen: true,
        shabbatFriendly: true,
        synagogueWalkMin: 6,
        keepsShabbat: true,
        isNew: true,
        demo: true,
      },
    },
    {
      ...card,
      id: `${card.id}-sale`,
      publicId: card.publicId + 200000,
      photos: card.photos.slice(0, 1),
      price: 1_250_000,
      currency: "USD",
      pricePeriod: "TOTAL",
      dealType: "SALE",
      badges: { ...card.badges, welcomes: true, verified: true, promoted: true, demo: false },
    },
    {
      ...card,
      id: `${card.id}-empty`,
      publicId: card.publicId + 300000,
      photos: [],
      title: `${card.title} · ${card.title} · ${card.title}`,
      price: null,
      badges: { ...card.badges, welcomes: false, verified: false, demo: true, isNew: false },
    },
  ];
}

export default async function DevUiPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!enabled()) notFound();
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("ds");
  const tc = await getTranslations("common");

  const [rates, currency] = await Promise.all([getRates(), getDisplayCurrency(null)]);
  const cards = await getNewestListings({ locale, currency, rates }, 6).catch(() => [] as ListingCardData[]);
  const demo = variants(cards[0]);
  const photos = cards.flatMap((card) => card.photos).slice(0, 6);

  const typeSample: Record<(typeof TYPE)[number], string> = {
    display: t("badges.welcomes"),
    h1: t("devUi.title"),
    h2: t("devUi.sectionTitle"),
    h3: t("devUi.emptyTitle"),
    body: t("devUi.intro"),
    small: t("devUi.emptyText"),
    caption: t("badges.verifiedHint"),
  };

  return (
    <main id="main" className="mx-auto flex max-w-6xl flex-col gap-10 px-gutter py-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-h1">{t("devUi.title")}</h1>
        <p className="text-body text-muted-foreground">{t("devUi.intro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSegmented className="w-72" />
          <nav className="flex flex-wrap gap-1" dir="ltr">
            {locales.map((l) => (
              <Link key={l} href="/dev/ui" locale={l} className="rounded-full px-3 py-2 font-mono text-sm hover:bg-muted" aria-current={l === locale ? "page" : undefined}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <Section name="colors">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLORS.map((name) => (
            <li key={name} className="flex flex-col gap-1.5">
              <span className="h-14 rounded-input ring-1 ring-foreground/10" style={{ background: `var(--${name})` }} />
              <code className="text-caption text-muted-foreground" dir="ltr">
                {name}
              </code>
            </li>
          ))}
        </ul>
      </Section>

      <Section name="type">
        <div className="flex flex-col gap-3">
          {TYPE.map((size) => (
            <div key={size} className="flex items-baseline gap-4">
              <code className="w-16 shrink-0 text-caption text-muted-foreground" dir="ltr">
                {size}
              </code>
              <p className={`${TYPE_CLASS[size]} min-w-0`}>{typeSample[size]}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section name="radius · shadow">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {SHADOWS.map((shadow) => (
            <div key={shadow} className={`flex h-24 items-end rounded-card bg-card p-3 ${shadow}`}>
              <code className="text-caption text-muted-foreground" dir="ltr">
                {shadow}
              </code>
            </div>
          ))}
          <div className="flex h-24 items-end rounded-input border border-input bg-card p-3">
            <code className="text-caption text-muted-foreground" dir="ltr">rounded-input</code>
          </div>
          <div className="flex h-24 items-end rounded-t-sheet bg-card p-3 shadow-sheet">
            <code className="text-caption text-muted-foreground" dir="ltr">rounded-t-sheet</code>
          </div>
          <div className="flex h-24 items-end rounded-full bg-navy-soft px-5 py-3">
            <code className="text-caption text-navy" dir="ltr">rounded-full</code>
          </div>
        </div>
      </Section>

      <Section name="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <SearchIcon />
            {tc("search")}
          </Button>
          <Button variant="accent">
            <PlusIcon />
            {t("devUi.post")}
          </Button>
          <Button variant="outline">{tc("seeAll")}</Button>
          <Button variant="soft">{tc("filter")}</Button>
          <Button variant="ghost">{tc("cancel")}</Button>
          <Button variant="whatsapp">
            <WhatsAppIcon />
            WhatsApp
          </Button>
          <Button variant="link">{tc("learnMore")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{tc("apply")}</Button>
          <Button size="md">{tc("apply")}</Button>
          <Button size="lg">{tc("apply")}</Button>
          <Button variant="round" size="icon" aria-label={tc("share")}>
            <ShareIcon />
          </Button>
          <Button variant="round" size="icon" aria-label={tc("save")}>
            <HeartIcon />
          </Button>
          <Button variant="accent" size="icon" className="size-14 bg-coral shadow-float dark:bg-coral [&_svg]:size-7" aria-label={t("devUi.post")}>
            <PlusIcon />
          </Button>
          <Button disabled>{tc("apply")}</Button>
        </div>
      </Section>

      <Section name="Chip · RemovableChip">
        <ChipsDemo />
      </Section>

      <Section name="SegmentedControl">
        <SegmentedDemo />
      </Section>

      <Section name="IconCircle · JewishIcons">
        <div className="flex flex-wrap items-center gap-3">
          {(["navy", "coral", "green", "amber", "neutral", "navy-solid", "coral-solid"] as const).map((tone, i) => {
            const icons = Object.values(jewishIcons);
            return <IconCircle key={tone} tone={tone} size="lg" icon={icons[i % icons.length]} />;
          })}
        </div>
        <div className="flex flex-wrap items-end gap-5 text-foreground">
          {Object.entries(jewishIcons).map(([name, Icon]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div className="flex items-end gap-3">
                <Icon size={16} />
                <Icon size={24} />
                <Icon size={48} />
              </div>
              <code className="text-caption text-muted-foreground" dir="ltr">
                {name}
              </code>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <IconCircle key={size} size={size} tone="navy" icon={jewishIcons.synagogue} />
          ))}
        </div>
      </Section>

      <Section name="BayitBadge · BadgeRow">
        <div className="flex flex-wrap gap-2">
          {BADGES.map((kind) => (
            <BayitBadge key={kind} kind={kind} minutes={6} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {BADGES.slice(0, 4).map((kind) => (
            <BayitBadge key={kind} kind={kind} size="md" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 rounded-card bg-navy p-3">
          {TAGS.map((kind) => (
            <BayitBadge key={kind} kind={kind} variant="solid" />
          ))}
        </div>
        <BadgeRow items={BADGES.slice(1, 6).map((kind) => ({ kind, minutes: 6 }))} max={3} />
      </Section>

      <Section name="ListingCard">
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {demo.map((card, i) => (
            <ListingCard key={card.id} listing={card} priority={i === 0} showCompare={i === 0} />
          ))}
          <ListingCardSkeleton />
        </div>
        <ListingCard listing={demo[0]} variant="list" />
      </Section>

      <Section name="SectionHeader · CardCarousel">
        <div className="-mx-gutter flex flex-col gap-4">
          <SectionHeader className="px-gutter" title={t("devUi.sectionTitle")} subtitle={t("devUi.sectionSubtitle")} href="/search" />
          <CardCarousel label={t("devUi.sectionTitle")}>
            {(cards.length > 0 ? cards : demo).map((card) => (
              <ListingCard key={card.id} listing={card} />
            ))}
          </CardCarousel>
        </div>
      </Section>

      <Section name="PhotoCarousel">
        <div className="grid gap-5 sm:grid-cols-2">
          <PhotoCarousel photos={photos} label={t("devUi.sectionTitle")} sizes="(min-width: 640px) 50vw, 100vw" totalCount={photos.length + 9} className="rounded-card" />
          <PhotoCarousel photos={photos} label={t("devUi.sectionTitle")} sizes="(min-width: 640px) 45vw, 90vw" peek />
        </div>
      </Section>

      <Section name="Skeleton">
        <div className="flex max-w-md flex-col gap-3">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-6 w-2/5 rounded-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Section>

      <Section name="EmptyState">
        <div className="rounded-card bg-card shadow-card">
          <EmptyState
            icon={SearchXIcon}
            title={t("devUi.emptyTitle")}
            description={t("devUi.emptyText")}
            action={{ label: t("devUi.emptyAction"), href: "/search", icon: CompassIcon }}
            quickFixes={[
              { label: t("devUi.fixKosher"), href: "/search" },
              { label: t("devUi.fixArea"), href: "/search", icon: MapPinIcon },
            ]}
          />
        </div>
      </Section>

      <Section name="BottomSheet · NumberRoll · HeartButton">
        <div className="flex flex-wrap items-center gap-4">
          <SheetDemo />
          <HeartDemo />
        </div>
        <NumberRollDemo />
      </Section>

      <Section name="StickyContactBar">
        <ContactBarDemo />
      </Section>

      <Section name="Reveal">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {BADGES.map((kind, i) => (
            <Reveal as="li" key={kind} index={i} className="flex h-28 items-center justify-center rounded-card bg-card shadow-card">
              <BayitBadge kind={kind} minutes={6} />
            </Reveal>
          ))}
        </ul>
      </Section>
    </main>
  );
}
