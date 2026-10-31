"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type UserMenuUser = {
  name: string;
  image: string | null;
  /** A real email or the phone number (already formatted by the server) — shown under the name. */
  contact: string | null;
  contactIsPhone: boolean;
  isStaff: boolean;
};

/** Up to two initials; null when the name is a phone number (shows a person icon instead). */
function initials(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || /^[+\d\s()-]+$/.test(trimmed)) return null;
  const letters = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("");
  return letters.toLocaleUpperCase() || null;
}

export function UserAvatar({ user, className }: { user: Pick<UserMenuUser, "name" | "image">; className?: string }) {
  const letters = initials(user.name);
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
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function logOut() {
    setSigningOut(true);
    try {
      // Loaded on demand: Better Auth's client is not needed to show the menu.
      const { signOut } = await import("@/lib/auth/client");
      await signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-card ps-3 pe-1 shadow-xs transition-shadow outline-none hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:shadow-card"
        // The visible initials are part of the name (WCAG 2.5.3 label in name).
        aria-label={[t("openMenu"), initials(user.name)].filter(Boolean).join(" · ")}
      >
        <MenuIcon className="size-4 text-muted-foreground" aria-hidden />
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <UserAvatar user={user} className="size-10" />
          <span className="grid min-w-0">
            <span dir="auto" className="truncate text-sm font-semibold text-foreground">
              {user.name}
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
