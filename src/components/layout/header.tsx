import type { ReactNode } from "react";
import { Heart, MessageCircle, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { UserMenu } from "@/components/auth/user-menu";
import { Container } from "@/components/common/container";
import { LogoLink } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { CurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { CurrencySwitcher } from "./currency-switcher";
import { HeaderShell } from "./header-shell";
import { LanguageSwitcher } from "./language-switcher";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";
import { ThemeToggle } from "./theme-toggle";

/** Primary call to action: "Post a listing" (terracotta, so it stands apart from the blue UI). */
export function PostListingButton({ label, className }: { label: string; className?: string }) {
  return (
    <Button
      asChild
      className={cn(
        "h-10 gap-1.5 rounded-full bg-terracotta px-4 font-semibold text-terracotta-foreground shadow-xs hover:bg-terracotta/90 focus-visible:ring-terracotta/40",
        className,
      )}
    >
      <Link href="/post">
        <Plus aria-hidden className="size-4" strokeWidth={2.5} />
        {label}
      </Link>
    </Button>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className="size-10 rounded-full">
          <Link href={href} aria-label={label}>
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

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
        <div className="ms-auto hidden items-center gap-1 lg:flex">
          <LanguageSwitcher />
          <CurrencySwitcher />
          <ThemeToggle />
          <span aria-hidden className="mx-1.5 h-6 w-px bg-border" />
          <IconLink href="/account/favorites" label={t("saved")}>
            <Heart aria-hidden className="size-[18px]" />
          </IconLink>
          {siteConfig.features.chat ? (
            <IconLink href="/account/messages" label={t("messages")}>
              <MessageCircle aria-hidden className="size-[18px]" />
            </IconLink>
          ) : null}
          <UserMenu user={user} className="ms-1" />
          <PostListingButton label={t("post")} className="ms-2" />
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
