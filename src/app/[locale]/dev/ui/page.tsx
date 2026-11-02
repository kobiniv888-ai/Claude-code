import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheckIcon, CompassIcon, HeartIcon, MapPinIcon, PlusIcon, SearchIcon, SearchXIcon, ShareIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/common/brand-icons";
import {
  BadgeRow,
  BayitBadge,
  Button,
  Card,
  CardCarousel,
  EmptyState,
  IconCircle,
  ListingCardSkeleton,
  PhotoCarousel,
  SectionHeader,
  Skeleton,
  Tag,
  jewishIcons,
  type BayitBadgeKind,
} from "@/components/ds";
import { ThemeSegmented } from "@/components/layout/theme-toggle";
import { ListingCard } from "@/components/listing/listing-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/locale";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import { getNewestListings } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { locales } from "@/config/site";
import { CalendarDemo, ChipsDemo, ContactBarDemo, HeartDemo, NumberRollDemo, SegmentedDemo, SheetDemo } from "./interactive";

/**
 * /dev/ui — hidden showcase of the design system (round 2: tokens in both themes, the type scale,
 * the logo and every component). Only in development or with NEXT_PUBLIC_SHOW_DEV_UI=true; 404
 * otherwise. Never linked, never indexed.
 */
const enabled = () => process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SHOW_DEV_UI === "true";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  if (!enabled()) return {};
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ds.devUi" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The token contract (src/app/styles/bayit.css). Swatches read the live CSS variables. */
const TOKENS = [
  "primary",
  "primary-foreground",
  "primary-pressed",
  "primary-text",
  "primary-tint",
  "primary-tint-border",
  "background",
  "card",
  "surface",
  "surface-muted",
  "raised",
  "foreground",
  "muted-foreground",
  "placeholder",
  "border",
  "border-strong",
  "input",
  "error",
  "success",
  "header-bg",
  "header-fg",
  "hero-band",
  "bottom-nav",
] as const;

const TYPE = ["display", "h1", "h2", "h3", "body", "small", "caption", "price"] as const;
/** Written out in full so Tailwind finds the classes. */
const TYPE_CLASS: Record<(typeof TYPE)[number], string> = {
  display: "text-display",
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  body: "text-body",
  small: "text-small",
  caption: "text-caption",
  price: "text-price",
};
const SHAPES = [
  { name: "rounded-card · border", className: "rounded-card border border-border bg-card" },
  { name: "rounded-input · border-strong", className: "rounded-input border border-border-strong bg-card" },
  { name: "rounded-button · primary", className: "rounded-button bg-primary text-primary-foreground" },
  { name: "rounded-full · primary-tint", className: "rounded-full border border-primary-tint-border bg-primary-tint text-primary-text" },
  { name: "shadow-raised (search card)", className: "rounded-card bg-card shadow-raised" },
  { name: "shadow-sheet · rounded-t-sheet", className: "rounded-t-sheet bg-card shadow-sheet" },
] as const;
const BADGES: BayitBadgeKind[] = [
  "verified",
  "new",
  "demo",
  "kosherKitchen",
  "shabbatFriendly",
  "synagogueWalk",
  "hebrew",
  "keepsShabbat",
  "business",
];

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

function Swatches({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-background p-3 text-foreground">
      <p className="text-small font-medium">{label}</p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        {TOKENS.map((name) => (
          <li key={name} className="flex items-center gap-2">
            <span className="size-8 shrink-0 rounded-input border border-border" style={{ background: `var(--${name})` }} />
            <code className="min-w-0 truncate text-caption text-muted-foreground" dir="ltr">
              {name}
            </code>
          </li>
        ))}
      </ul>
    </div>
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
    display: t("devUi.title"),
    h1: t("devUi.sectionTitle"),
    h2: t("devUi.sectionTitle"),
    h3: t("devUi.emptyTitle"),
    body: t("devUi.intro"),
    small: t("devUi.emptyText"),
    caption: t("badges.verifiedHint"),
    price: "₪420",
  };

  return (
    <main id="main" className="mx-auto flex max-w-content flex-col gap-10 px-gutter py-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-h1">{t("devUi.title")}</h1>
        <p className="text-body text-muted-foreground">{t("devUi.intro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSegmented className="w-72" />
          <nav className="flex flex-wrap gap-1" dir="ltr">
            {locales.map((l) => (
              <Link
                key={l}
                href="/dev/ui"
                locale={l}
                className="inline-flex min-h-11 items-center rounded-full px-3 font-mono text-sm hover:bg-surface-muted aria-[current=page]:bg-primary-tint aria-[current=page]:text-primary-text"
                aria-current={l === locale ? "page" : undefined}
              >
                {l}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <Section name="tokens">
        <div className="grid gap-4 lg:grid-cols-2">
          <Swatches label={t("devUi.currentTheme")} />
          <div className="dark">
            <Swatches label={t("devUi.darkTheme")} />
          </div>
        </div>
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
          <div className="flex items-baseline gap-4">
            <code className="w-16 shrink-0 text-caption text-muted-foreground" dir="ltr">
              title ×3
            </code>
            <p className="line-clamp-3 min-w-0 text-h1">{`${t("devUi.intro")} ${t("devUi.emptyText")} ${t("devUi.intro")}`}</p>
          </div>
        </div>
      </Section>

      <Section name="Logo">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex h-24 items-center justify-center rounded-card border border-border bg-card">
            <Logo href={null} />
          </div>
          <div className="flex h-24 items-center justify-center rounded-card bg-primary-tint">
            <Logo href={null} />
          </div>
          <div className="flex h-24 items-center justify-center rounded-card bg-header">
            <Logo href={null} color="white" />
          </div>
          <div className="dark">
            <div className="flex h-24 items-center justify-center rounded-card border border-border bg-background">
              <Logo href={null} color="white" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Logo href={null} size={18} />
          <Logo href={null} size={22} />
          <Logo href={null} size={28} />
          <Logo href={null} size={40} />
          <Logo href={null} size={28} showName={false} />
        </div>
      </Section>

      <Section name="radius · border · shadow">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SHAPES.map((shape) => (
            <div key={shape.name} className={`flex h-24 items-end p-3 ${shape.className}`}>
              <code className="text-caption" dir="ltr">
                {shape.name}
              </code>
            </div>
          ))}
        </div>
      </Section>

      <Section name="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <SearchIcon />
            {tc("search")}
          </Button>
          <Button variant="secondary">{tc("cancel")}</Button>
          <Button variant="outline">{tc("seeAll")}</Button>
          <Button variant="soft">{tc("filter")}</Button>
          <Button variant="ghost">{tc("reset")}</Button>
          <Button variant="whatsapp">
            <WhatsAppIcon />
            WhatsApp
          </Button>
          <Button variant="link">{tc("learnMore")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{tc("apply")}</Button>
          <Button size="md">{tc("apply")}</Button>
          <Button variant="round" size="icon" aria-label={tc("share")}>
            <ShareIcon />
          </Button>
          <Button variant="round" size="icon" aria-label={tc("save")}>
            <HeartIcon />
          </Button>
          <Button size="icon" className="size-12 border-[3px] border-white [&_svg]:size-6" aria-label={t("devUi.post")}>
            <PlusIcon />
          </Button>
          <Button disabled>{tc("apply")}</Button>
          <Button variant="secondary" disabled>
            {tc("cancel")}
          </Button>
        </div>
      </Section>

      <Section name="Chip · RemovableChip">
        <ChipsDemo />
      </Section>

      <Section name="Tag · BayitBadge · BadgeRow">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{tc("demo")}</Tag>
          <Tag variant="primary">{tc("new")}</Tag>
          <Tag variant="success" icon={BadgeCheckIcon}>
            {t("badges.verified")}
          </Tag>
          <Tag size="sm">{t("badges.kosherKitchen")}</Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((kind) => (
            <BayitBadge key={kind} kind={kind} minutes={6} />
          ))}
        </div>
        <div className="relative flex h-28 items-start justify-between rounded-card bg-surface-muted p-3">
          <BayitBadge kind="demo" variant="solid" />
          <BayitBadge kind="new" variant="solid" />
        </div>
        <BadgeRow items={BADGES.slice(3, 8).map((kind) => ({ kind, minutes: 6 }))} />
      </Section>

      <Section name="Card">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-h3">{t("devUi.sectionTitle")}</p>
            <p className="text-small text-muted-foreground">{t("devUi.sectionSubtitle")}</p>
          </Card>
          <Card interactive>
            <Link href="/search" className="text-h3 outline-none after:absolute after:inset-0">
              {t("devUi.emptyAction")}
            </Link>
            <p className="text-small text-muted-foreground">{t("devUi.emptyText")}</p>
          </Card>
          <Card muted>
            <p className="text-h3">{t("devUi.accordionTitle2")}</p>
            <p className="text-small text-muted-foreground">{t("devUi.accordionBody2")}</p>
          </Card>
        </div>
      </Section>

      <Section name="SegmentedControl · Tabs">
        <SegmentedDemo />
        <Tabs defaultValue="short">
          <TabsList>
            <TabsTrigger value="short">{t("devUi.tabsShort")}</TabsTrigger>
            <TabsTrigger value="monthly">{t("devUi.tabsMonthly")}</TabsTrigger>
            <TabsTrigger value="buy">{t("devUi.tabsBuy")}</TabsTrigger>
          </TabsList>
          <TabsContent value="short" className="text-body text-muted-foreground">
            {t("devUi.sectionSubtitle")}
          </TabsContent>
          <TabsContent value="monthly" className="text-body text-muted-foreground">
            {t("devUi.emptyText")}
          </TabsContent>
          <TabsContent value="buy" className="text-body text-muted-foreground">
            {t("devUi.intro")}
          </TabsContent>
        </Tabs>
      </Section>

      <Section name="Input · Textarea">
        <div className="grid max-w-md gap-3">
          <label className="grid gap-1.5 text-small font-medium">
            {t("devUi.inputLabel")}
            <Input placeholder={t("devUi.inputPlaceholder")} />
          </label>
          <label className="grid gap-1.5 text-small font-medium">
            {t("devUi.notesLabel")}
            <Textarea />
          </label>
          <Input disabled placeholder={t("devUi.inputPlaceholder")} aria-label={t("devUi.inputLabel")} />
        </div>
      </Section>

      <Section name="Accordion">
        <Accordion type="single" collapsible className="max-w-xl">
          <AccordionItem value="kosher">
            <AccordionTrigger>{t("devUi.accordionTitle")}</AccordionTrigger>
            <AccordionContent>{t("devUi.accordionBody")}</AccordionContent>
          </AccordionItem>
          <AccordionItem value="know">
            <AccordionTrigger>{t("devUi.accordionTitle2")}</AccordionTrigger>
            <AccordionContent>{t("devUi.accordionBody2")}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section name="Calendar">
        <CalendarDemo />
      </Section>

      <Section name="IconCircle · JewishIcons">
        <div className="flex flex-wrap items-center gap-3">
          {(["neutral", "primary", "primary-solid"] as const).map((tone, i) => {
            const icons = Object.values(jewishIcons);
            return <IconCircle key={tone} tone={tone} size="lg" icon={icons[i % icons.length]} />;
          })}
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <IconCircle key={size} size={size} icon={jewishIcons.synagogue} />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-5 text-muted-foreground">
          {Object.entries(jewishIcons).map(([name, Icon]) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <div className="flex items-end gap-3">
                <Icon size={20} />
                <Icon size={24} className="text-primary-text" />
              </div>
              <code className="text-caption" dir="ltr">
                {name}
              </code>
            </div>
          ))}
        </div>
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
        <Card padding="none">
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
        </Card>
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
    </main>
  );
}
