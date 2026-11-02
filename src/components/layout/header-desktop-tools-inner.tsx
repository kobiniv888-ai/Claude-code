"use client";

import type { ReactNode } from "react";
import { Heart, MessageCircle, Plus } from "lucide-react";
import { LoginButton } from "@/components/auth/login-dialog";
import { UserMenuClient, type UserMenuUser } from "@/components/auth/user-menu-client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CurrencySwitcher } from "./currency-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

export type HeaderDesktopToolsProps = {
  labels: { saved: string; messages: string; post: string };
  /** Show the Messages link (siteConfig.features.chat). */
  chat: boolean;
  /** From userMenuData() on the server; null shows "Log in". */
  user: UserMenuUser | null;
};

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

/** The desktop header's tools (≥ 1024px): switchers, Saved, Messages, account menu and "Post a listing". */
export function HeaderDesktopTools({ labels, chat, user }: HeaderDesktopToolsProps) {
  return (
    <>
      <LanguageSwitcher />
      <CurrencySwitcher />
      <ThemeToggle />
      <span aria-hidden className="mx-1.5 h-6 w-px bg-border" />
      <IconLink href="/account/favorites" label={labels.saved}>
        <Heart aria-hidden className="size-[18px]" />
      </IconLink>
      {chat ? (
        <IconLink href="/account/messages" label={labels.messages}>
          <MessageCircle aria-hidden className="size-[18px]" />
        </IconLink>
      ) : null}
      {user ? (
        <div className="ms-1">
          <UserMenuClient user={user} />
        </div>
      ) : (
        <LoginButton className="ms-1" />
      )}
      <PostListingButton label={labels.post} className="ms-2" />
    </>
  );
}
