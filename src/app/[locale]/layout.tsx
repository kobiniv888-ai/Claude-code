import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { LoginDialogProvider } from "@/components/auth/login-dialog-provider";
import { InlineScript } from "@/components/common/inline-script";
import { DISMISSED_ALERTS_SCRIPT } from "@/components/layout/dismissed-alerts";
import { fontStyle, scriptFontUrl } from "@/components/layout/fonts";
import { SkipLink } from "@/components/layout/skip-link";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppToaster } from "@/components/providers/toaster";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { DirectionProvider } from "@/components/ui/direction";
import { siteConfig } from "@/config/site";
import { SHELL_MESSAGES, pickMessages } from "@/i18n/client-messages";
import { dirFor } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import { absoluteUrl, defaultOgImage, ogLocale, siteName } from "@/lib/seo";
import { ZOD_JITLESS_SCRIPT } from "@/lib/zod-jitless";
import { DemoDataBanner } from "@/components/dev/demo-data-banner";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const name = siteName(locale);
  const description = t("meta.description");
  return {
    metadataBase: new URL(siteConfig.url),
    applicationName: siteConfig.name,
    title: { default: `${name} · ${t("siteTagline")}`, template: `%s · ${name}` },
    description,
    openGraph: {
      type: "website",
      siteName: name,
      locale: ogLocale(locale),
      title: name,
      description,
      images: [{ ...defaultOgImage(locale), url: absoluteUrl(defaultOgImage(locale).url), alt: name }],
    },
    twitter: { card: "summary_large_image" },
    robots: { index: true, follow: true },
    appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "default" },
    // Phone numbers are shown on purpose (contact buttons); don't let iOS turn every number into a link.
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  // The header's color: purple in light mode, near-black in dark mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: siteConfig.colors.primary },
    { media: "(prefers-color-scheme: dark)", color: siteConfig.colors.backgroundDark },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const dir = dirFor(locale);
  // Hebrew, Russian and Arabic pages: the script's Rubik face is needed for the first paint
  // (headline, menus), so fetch it with the HTML instead of after the stylesheet
  // (src/components/layout/fonts.ts). Latin is preloaded by next/font on every page. A <link> in
  // <head> rather than preload(): the layout awaits data first, and a later hint only reaches the
  // browser in the streamed payload.
  const scriptFont = scriptFontUrl(locale);

  const [nonce, user, rates, messages] = await Promise.all([
    headers().then((h) => h.get("x-nonce") ?? undefined),
    getCurrentUser().catch(() => null),
    getRates(),
    getMessages(),
  ]);
  const currency = await getDisplayCurrency(user?.currency);

  return (
    <html lang={locale} dir={dir} style={fontStyle} suppressHydrationWarning>
      <head>
        {scriptFont ? <link rel="preload" href={scriptFont} as="font" type="font/woff2" crossOrigin="anonymous" /> : null}
        <InlineScript nonce={nonce} html={DISMISSED_ALERTS_SCRIPT} />
        <InlineScript nonce={nonce} html={ZOD_JITLESS_SCRIPT} />
      </head>
      <body>
        <ThemeProvider nonce={nonce}>
          <DirectionProvider dir={dir}>
            {/* Only the shell's interface text; routes add theirs (src/i18n/client-messages.ts). */}
            <NextIntlClientProvider messages={pickMessages(messages, SHELL_MESSAGES)}>
              <CurrencyProvider currency={currency} rates={rates}>
                <LoginDialogProvider signedIn={!!user}>
                  <SkipLink />
                  <DemoDataBanner />
                  {children}
                  <AppToaster dir={dir} />
                </LoginDialogProvider>
              </CurrencyProvider>
            </NextIntlClientProvider>
          </DirectionProvider>
        </ThemeProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
