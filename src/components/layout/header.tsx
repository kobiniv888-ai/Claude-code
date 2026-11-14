import { getLocale, getTranslations } from "next-intl/server";
import { userMenuData } from "@/components/auth/user-menu-data";
import { Container } from "@/components/common/container";
import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import type { CurrentUser } from "@/lib/auth/session";
import { HeaderDesktopTools } from "./header-desktop-tools";
import { HeaderShell } from "./header-shell";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";

/**
 * Site header (round 2): purple with the white logo in light mode, near-black in dark mode.
 * Phones: 56px, the logo on the start side, the language pill and the menu button on the other
 * (the bottom bar carries Home, Search, Post, Saved and Profile). Desktop (≥ 1024px): logo,
 * switchers, Saved, Messages, account menu and "Post a listing", with the main tabs on a second row.
 */
export async function Header({ user }: { user: CurrentUser | null }) {
  const [t, tMenu, locale] = await Promise.all([getTranslations("nav"), getTranslations("auth.menu"), getLocale()]);
  const languageName = siteConfig.i18n.nativeNames[isAppLocale(locale) ? locale : siteConfig.i18n.fallbackLocale];
  return (
    <HeaderShell>
      <Container className="flex h-14 items-center gap-3 lg:h-16">
        <Logo color="white" />
        <div
          data-desktop-tools=""
          // Ghost buttons (switchers, Saved, Messages) are white on the header, with a soft white hover.
          className="ms-auto hidden items-center gap-1 lg:flex [&_[data-slot=button][data-variant=ghost]]:text-header-fg [&_[data-slot=button][data-variant=ghost]:hover]:bg-white/10 [&_[data-slot=button][data-variant=ghost][aria-expanded=true]]:bg-white/15"
        >
          <HeaderDesktopTools
            labels={{ saved: t("saved"), messages: t("messages"), post: t("post") }}
            chat={siteConfig.features.chat}
            user={userMenuData(user)}
          />
        </div>
        <div className="ms-auto flex items-center lg:hidden">
          <MobileMenu
            isSignedIn={!!user}
            adminLabel={user?.isStaff ? tMenu("admin") : undefined}
            postLabel={t("post")}
            languageLabel={t("language.change", { current: languageName })}
          />
        </div>
      </Container>
      <div className="hidden lg:block">
        <Container>
          <MainNav />
        </Container>
      </div>
    </HeaderShell>
  );
}
