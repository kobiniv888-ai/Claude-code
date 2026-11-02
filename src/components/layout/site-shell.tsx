import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getConsent } from "@/lib/consent";
import { getSettings } from "@/lib/settings";
import { CookieConsent } from "./cookie-consent";
import { DemoDataBanner } from "./demo-data-banner";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { NavigationSkeleton } from "./navigation-skeleton";
import { ScamAlertBanner } from "./scam-alert-banner";
import { ShabbatModeBanner } from "./shabbat-mode-banner";

/**
 * The public site frame: notices (Shabbat mode, scam alert, demo data), the sticky header,
 * the cookie banner, <main id="main">, the footer and the phone bottom bar.
 * Used by app/[locale]/(site)/layout.tsx and the 404 page.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const [user, settings, consent, t] = await Promise.all([
    getCurrentUser().catch((error: unknown) => {
      // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
      unstable_rethrow(error);
      console.error("[layout] could not read the session", error);
      return null;
    }),
    getSettings(),
    getConsent(),
    getTranslations("listing"),
  ]);

  return (
    // Never under the phone bottom bar (bug 8.7): every page ends with the bar's height (it includes
    // the safe-area inset), plus 1rem for the raised "+" — min() makes that 0 when there is no bar.
    <div className="flex min-h-dvh flex-col pb-[calc(var(--bottom-nav-height)+min(var(--bottom-nav-height),1rem))]">
      <ShabbatModeBanner />
      <ScamAlertBanner />
      {settings.demoDataVisible ? <DemoDataBanner /> : null}
      <Header user={user} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {/* The listing skeleton while a tapped listing link loads (the listing route streams nothing). */}
        <NavigationSkeleton loadingLabel={t("loading")}>{children}</NavigationSkeleton>
      </main>
      <Footer />
      <MobileBottomNav isSignedIn={!!user} />
      {/* Last in the document: its place above the bottom bar comes from --bottom-nav-height,
          which the bottom bar, <HideBottomNav /> and the listing contact bar set from the markup
          above. Painted before them, it jumped by the bar's height when they arrived (CLS 0.04).
          The photo heroes are larger, so it is not the largest contentful paint. */}
      <CookieConsent initialOpen={!consent} />
    </div>
  );
}
