import { getTranslations } from "next-intl/server";
import { userMenuData } from "@/components/auth/user-menu-data";
import { Container } from "@/components/common/container";
import { LogoLink } from "@/components/common/logo";
import { siteConfig } from "@/config/site";
import type { CurrentUser } from "@/lib/auth/session";
import { HeaderDesktopTools } from "./header-desktop-tools";
import { HeaderShell } from "./header-shell";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";

/**
 * Site header. Desktop (≥ 1024px): logo, switchers, Saved, Messages (Phase 2), account menu and
 * "Post a listing", with the main tabs on a second row. Phones: logo and a menu sheet (the
 * bottom bar carries Home, Search, Post, Saved and Profile).
 */
export async function Header({ user }: { user: CurrentUser | null }) {
  const t = await getTranslations("nav");
  return (
    <HeaderShell>
      <Container className="flex h-14 items-center gap-3 lg:h-16">
        <LogoLink />
        <div data-desktop-tools="" className="ms-auto hidden items-center gap-1 lg:flex">
          <HeaderDesktopTools
            labels={{ saved: t("saved"), messages: t("messages"), post: t("post") }}
            chat={siteConfig.features.chat}
            user={userMenuData(user)}
          />
        </div>
        <div className="ms-auto flex items-center lg:hidden">
          <MobileMenu isSignedIn={!!user} postLabel={t("post")} />
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
