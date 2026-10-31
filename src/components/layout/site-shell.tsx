import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getConsent } from "@/lib/consent";
import { getSettings } from "@/lib/settings";
import { CookieConsent } from "./cookie-consent";
import { DemoDataBanner } from "./demo-data-banner";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { ScamAlertBanner } from "./scam-alert-banner";
import { ShabbatModeBanner } from "./shabbat-mode-banner";

/**
 * The public site frame: notices (Shabbat mode, scam alert, demo data), the sticky header,
 * the cookie banner, <main id="main">, the footer and the phone bottom bar.
 * Used by app/[locale]/(site)/layout.tsx and the 404 page.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const [user, settings, consent] = await Promise.all([
    getCurrentUser().catch((error: unknown) => {
      // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
      unstable_rethrow(error);
      console.error("[layout] could not read the session", error);
      return null;
    }),
    getSettings(),
    getConsent(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col pb-(--bottom-nav-height)">
      <ShabbatModeBanner />
      <ScamAlertBanner />
      {settings.demoDataVisible ? <DemoDataBanner /> : null}
      <Header user={user} />
      {/* Fixed to the bottom of the screen, but early in the document: the browser parses and
          paints it with the first screen instead of after the whole page (it was the largest
          contentful paint on most first visits). Keyboard order: header, then this banner. */}
      <CookieConsent initialOpen={!consent} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
      <MobileBottomNav isSignedIn={!!user} />
    </div>
  );
}
