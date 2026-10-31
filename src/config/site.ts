/**
 * Bayit — central site configuration.
 *
 * Everything a founder may want to change without touching the code lives here:
 * the brand name, logo, colors, languages, currencies, cities, limits,
 * feature flags (Phase 2/3) and the prices of paid features.
 *
 * Values that admins can change at runtime (listing expiry, Shabbat mode, …) are
 * stored in the database (SiteSetting) — the values here are only their defaults.
 */

export const locales = ["he", "en", "ru", "ar", "ka"] as const;
export type AppLocale = (typeof locales)[number];

export const rtlLocales: readonly AppLocale[] = ["he", "ar"];

export type Localized<T = string> = Record<AppLocale, T>;

export const currencyCodes = ["GEL", "USD", "ILS", "EUR", "GBP", "AED"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];

export type CityConfig = {
  slug: string;
  names: Localized;
  /** Extra spellings that should match in search (lower-case). */
  aliases: string[];
  lat: number;
  lng: number;
  timezone: string;
  airport: { code: string; lat: number; lng: number };
  /** Shown in "Popular cities" on the home page. */
  popular: boolean;
};

export const siteConfig = {
  /** Working name — a placeholder. Change it here and the whole site follows. */
  name: "Bayit",
  /** Brand name as written in each language (used in titles, emails and ready messages). */
  localizedName: {
    he: "בית",
    en: "Bayit",
    ru: "Bayit",
    ar: "Bayit",
    ka: "Bayit",
  } satisfies Localized,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL ?? "support@bayit.example",
  /** Logo files in /public/brand. Replace the SVGs to rebrand. */
  logo: {
    mark: "/brand/logo-mark.svg",
    wordmark: "/brand/logo.svg",
  },
  social: {
    facebook: "",
    instagram: "",
    telegram: "",
    whatsapp: "",
  },

  /**
   * Brand colors. These are copied into CSS variables in src/app/globals.css
   * (search for "BRAND COLORS"); keep both in sync when rebranding.
   */
  colors: {
    primary: "#1E3A6E", // deep, trustworthy blue
    primaryDark: "#93B4F0", // primary on dark backgrounds
    accent: "#B4533A", // terracotta — Georgian roofs
    wine: "#7B2D3B", // Georgian wine
    background: "#FAF8F5", // off-white
    verified: "#15803D", // green "Verified"
    warning: "#B45309", // amber warnings
  },

  i18n: {
    locales,
    /** The site's main language (content is designed Hebrew-first). */
    primaryLocale: "he" as AppLocale,
    /** Used on first visit when the browser language is not one of the five. */
    fallbackLocale: "en" as AppLocale,
    nativeNames: {
      he: "עברית",
      en: "English",
      ru: "Русский",
      ar: "العربية",
      ka: "ქართული",
    } satisfies Localized,
  },

  currencies: {
    /** Order shown in the currency switcher. `enabled: false` = Phase 3. */
    list: [
      { code: "GEL", symbol: "₾", enabled: true },
      { code: "USD", symbol: "$", enabled: true },
      { code: "ILS", symbol: "₪", enabled: true },
      { code: "EUR", symbol: "€", enabled: true },
      { code: "GBP", symbol: "£", enabled: false },
      { code: "AED", symbol: "AED", enabled: false },
    ] satisfies { code: CurrencyCode; symbol: string; enabled: boolean }[],
    /** Default display currency by visitor country (ISO 3166-1 alpha-2). */
    byCountry: { IL: "ILS", GE: "GEL" } as Record<string, CurrencyCode>,
    fallback: "USD" as CurrencyCode,
    /** Used only if the daily exchange-rate fetch has never succeeded. 1 USD = x. */
    fallbackRatesPerUsd: {
      USD: 1,
      GEL: 2.7,
      ILS: 3.7,
      EUR: 0.92,
      GBP: 0.79,
      AED: 3.67,
    } satisfies Record<CurrencyCode, number>,
  },

  /** Countries where listings can be posted. Phase 3 adds US, GB and AE. */
  countries: [
    { code: "GE", enabled: true },
    { code: "US", enabled: false },
    { code: "GB", enabled: false },
    { code: "AE", enabled: false },
  ],

  /**
   * Starting cities (seeded into the database). Admins can add more cities and
   * neighborhoods from the admin panel.
   */
  cities: [
    {
      slug: "tbilisi",
      names: { he: "טביליסי", en: "Tbilisi", ru: "Тбилиси", ar: "تبليسي", ka: "თბილისი" },
      aliases: ["tiflis", "tbilissi", "tblisi"],
      lat: 41.7151,
      lng: 44.8271,
      timezone: "Asia/Tbilisi",
      airport: { code: "TBS", lat: 41.6692, lng: 44.9547 },
      popular: true,
    },
    {
      slug: "batumi",
      names: { he: "בטומי", en: "Batumi", ru: "Батуми", ar: "باتومي", ka: "ბათუმი" },
      aliases: ["batum", "batoumi"],
      lat: 41.6168,
      lng: 41.6367,
      timezone: "Asia/Tbilisi",
      airport: { code: "BUS", lat: 41.6103, lng: 41.5997 },
      popular: true,
    },
    {
      slug: "kutaisi",
      names: { he: "קוטאיסי", en: "Kutaisi", ru: "Кутаиси", ar: "كوتايسي", ka: "ქუთაისი" },
      aliases: ["kutais"],
      lat: 42.2679,
      lng: 42.6946,
      timezone: "Asia/Tbilisi",
      airport: { code: "KUT", lat: 42.1766, lng: 42.4826 },
      popular: true,
    },
    {
      slug: "kobuleti",
      names: { he: "קובולטי", en: "Kobuleti", ru: "Кобулети", ar: "كوبوليتي", ka: "ქობულეთი" },
      aliases: [],
      lat: 41.8214,
      lng: 41.7792,
      timezone: "Asia/Tbilisi",
      airport: { code: "BUS", lat: 41.6103, lng: 41.5997 },
      popular: true,
    },
    {
      slug: "gudauri",
      names: { he: "גודאורי", en: "Gudauri", ru: "Гудаури", ar: "غوداوري", ka: "გუდაური" },
      aliases: [],
      lat: 42.4773,
      lng: 44.4778,
      timezone: "Asia/Tbilisi",
      airport: { code: "TBS", lat: 41.6692, lng: 44.9547 },
      popular: true,
    },
    {
      slug: "bakuriani",
      names: { he: "בקוריאני", en: "Bakuriani", ru: "Бакуриани", ar: "باكورياني", ka: "ბაკურიანი" },
      aliases: [],
      lat: 41.7497,
      lng: 43.5328,
      timezone: "Asia/Tbilisi",
      airport: { code: "KUT", lat: 42.1766, lng: 42.4826 },
      popular: true,
    },
    {
      slug: "borjomi",
      names: { he: "בורג׳ומי", en: "Borjomi", ru: "Боржоми", ar: "بورجومي", ka: "ბორჯომი" },
      aliases: [],
      lat: 41.8394,
      lng: 43.3788,
      timezone: "Asia/Tbilisi",
      airport: { code: "KUT", lat: 42.1766, lng: 42.4826 },
      popular: true,
    },
    {
      slug: "kazbegi",
      names: { he: "קזבגי", en: "Kazbegi", ru: "Казбеги", ar: "كازبيجي", ka: "ყაზბეგი" },
      aliases: ["stepantsminda", "степанцминда", "სტეფანწმინდა"],
      lat: 42.6574,
      lng: 44.6433,
      timezone: "Asia/Tbilisi",
      airport: { code: "TBS", lat: 41.6692, lng: 44.9547 },
      popular: true,
    },
    {
      slug: "sighnaghi",
      names: { he: "סיגנאגי", en: "Sighnaghi", ru: "Сигнахи", ar: "سيغناغي", ka: "სიღნაღი" },
      aliases: ["signagi", "sighnagi"],
      lat: 41.6205,
      lng: 45.9222,
      timezone: "Asia/Tbilisi",
      airport: { code: "TBS", lat: 41.6692, lng: 44.9547 },
      popular: true,
    },
    {
      slug: "mestia",
      names: { he: "מסטיה", en: "Mestia", ru: "Местиа", ar: "ميستيا", ka: "მესტია" },
      aliases: ["mestiya"],
      lat: 43.0453,
      lng: 42.7266,
      timezone: "Asia/Tbilisi",
      airport: { code: "KUT", lat: 42.1766, lng: 42.4826 },
      popular: true,
    },
  ] satisfies CityConfig[],

  /** Listing rules and limits. Admin-changeable values are only defaults here. */
  listings: {
    minPhotos: 5,
    maxPhotos: 30,
    maxPhotoBytes: 15 * 1024 * 1024,
    /** Default number of days before a listing expires (admin can change). */
    defaultExpiryDays: 60,
    /** Owners get an "about to expire" email this many days before. */
    expiryWarningDays: 3,
    titleMaxLength: 90,
    descriptionMaxLength: 5000,
    /** Public map location is shifted by up to this many meters from the real one. */
    approximateLocationMeters: 300,
    /** "New" label for this many days after publishing. */
    newLabelDays: 7,
    /** "Price dropped" label for this many days after a price drop. */
    priceDropLabelDays: 14,
    pageSize: 24,
    compareMax: 3,
  },

  /** Trust & safety defaults (admin can change thresholds). */
  safety: {
    /** Listings with a risk score at or above this wait for a moderator. */
    reviewRiskThreshold: 30,
    /** Open reports that hide a listing until a moderator checks it. */
    reportsToAutoHide: 3,
    /** An account younger than this is "new" for the velocity checks. */
    newAccountDays: 7,
    /** More listings than this from a new account within 24 hours is suspicious. */
    newAccountMaxListingsPerDay: 3,
    /** A price below this fraction of the area median is suspicious. */
    lowPriceRatio: 0.5,
  },

  /** Phone numbers: SMS codes are only sent to these countries (anti SMS-pumping). */
  phone: {
    defaultCountry: "GE",
    smsAllowedCountries: [
      "GE", "IL", "US", "CA", "GB", "FR", "DE", "NL", "BE", "IT", "ES", "UA",
      "RU", "BY", "KZ", "AZ", "AM", "TR", "AE", "AU",
    ],
  },

  /** Shabbat and holiday times (Hebcal). */
  shabbat: {
    candleLightingMinutesBefore: 18,
    havdalahMinutesAfter: 50,
    /** "Shabbat mode" uses Israel time, as the brief requires. */
    israel: { name: "Jerusalem", lat: 31.778, lng: 35.2354, timezone: "Asia/Jerusalem" },
    /** Cities shown on the home page. */
    homeCities: ["tbilisi", "batumi"],
  },

  /** Map tiles. OpenStreetMap's own tiles are fine for development; use a tile provider in production. */
  map: {
    tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution:
      process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    defaultCenter: { lat: 41.7151, lng: 44.8271 },
    defaultZoom: 12,
    /** Walking speed for "x min walk" estimates (meters per minute) and a detour factor for street routes. */
    walkingMetersPerMinute: 80,
    walkingDetourFactor: 1.3,
  },

  /** Contact channels owners can offer, in default order. */
  contactChannels: ["WHATSAPP", "TELEGRAM", "VIBER", "MESSENGER", "PHONE", "SMS", "EMAIL"] as const,

  /**
   * Paid features (switch on in Phase 2). Prices in USD; the payment provider is pluggable.
   */
  paidFeatures: {
    bump: { priceUsd: 3, label: "Bump to top" },
    featured7Days: { priceUsd: 15, label: "Featured for 7 days" },
    featured30Days: { priceUsd: 45, label: "Featured for 30 days" },
    premiumOwnerMonthly: { priceUsd: 12, label: "Premium owner plan (monthly)" },
    propertyVerificationVisit: { priceUsd: 25, label: "Property verification visit" },
  },

  /** Feature flags. Phase 1 ships with these off. */
  features: {
    reviews: false,
    chat: false,
    savedSearchAlerts: false,
    payments: false,
    bump: false,
    featuredPurchase: false,
    articles: false,
    partnerDirectory: false,
    investorCalculator: false,
    whatsappNotifications: false,
    booking: false,
  },
} as const;

export type SiteConfig = typeof siteConfig;
