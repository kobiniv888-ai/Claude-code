"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  HeartIcon,
  HouseIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UserRoundIcon,
} from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPathname, Link } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type UserMenuUser = {
  name: string;
  /** One letter for the avatar (`avatarInitial`), or null for a person icon. */
  initial: string | null;
  image: string | null;
  /** A real email or the phone number (already formatted by the server) — shown under the name. */
  contact: string | null;
  contactIsPhone: boolean;
  isStaff: boolean;
};

export function UserAvatar({ user, className }: { user: Pick<UserMenuUser, "initial" | "image">; className?: string }) {
  const letters = user.initial;
  return (
    <Avatar className={cn("size-8", className)}>
      {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
        {letters ?? <UserRoundIcon className="size-4" aria-hidden />}
      </AvatarFallback>
    </Avatar>
  );
}

const LINKS = [
  { href: "/account", key: "account", icon: UserIcon },
  { href: "/account/listings", key: "listings", icon: HouseIcon },
  { href: "/account/favorites", key: "favorites", icon: HeartIcon },
  { href: "/account/settings", key: "settings", icon: SettingsIcon },
] as const;

export function UserMenuClient({ user }: { user: UserMenuUser }) {
  const t = useTranslations("auth.menu");
  const locale = useLocale();
  const [signingOut, setSigningOut] = useState(false);

  // The shared logout (round 3, bug 2.9): signs out, clears this device's private data and opens
  // the home page with "התנתקתם". Loaded on demand: not needed to show the menu.
  async function logOut() {
    setSigningOut(true);
    const { logOut: run } = await import("@/lib/auth/logout");
    const result = await run({ homeHref: getPathname({ href: "/", locale }) });
    if (!result.ok) {
      setSigningOut(false);
      toast.error(t("logoutError"));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-card ps-3 pe-1 shadow-xs transition-shadow outline-none hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:shadow-card"
        // The visible initials are part of the name (WCAG 2.5.3 label in name).
        aria-label={[t("openMenu"), user.name].filter(Boolean).join(" · ")}
      >
        <MenuIcon className="size-4 text-muted-foreground" aria-hidden />
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <UserAvatar user={user} className="size-10" />
          <span className="grid min-w-0">
            <span dir="auto" className="truncate text-sm font-semibold text-foreground">
              {user.name || t("account")}
            </span>
            {user.contact && (
              <span className="truncate text-xs text-muted-foreground">
                <Ltr>{user.contact}</Ltr>
              </span>
            )}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {LINKS.map(({ href, key, icon: Icon }) => (
            <DropdownMenuItem key={key} asChild className="gap-2.5 px-2 py-2">
              <Link href={href}>
                <Icon aria-hidden />
                {t(key)}
              </Link>
            </DropdownMenuItem>
          ))}
          {user.isStaff && (
            <DropdownMenuItem asChild className="gap-2.5 px-2 py-2">
              <Link href="/admin">
                <ShieldCheckIcon aria-hidden />
                {t("admin")}
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 px-2 py-2"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void logOut();
          }}
        >
          {signingOut ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : (
            <LogOutIcon className="rtl:-scale-x-100" aria-hidden />
          )}
          {signingOut ? t("loggingOut") : t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
