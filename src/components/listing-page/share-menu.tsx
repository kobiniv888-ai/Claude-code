"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon, Share2Icon } from "lucide-react";
import { toast } from "@/lib/toast";
import { FacebookIcon, TelegramIcon, WhatsAppIcon, brandColors } from "@/components/common/brand-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Share: the phone's own share sheet when there is one, otherwise WhatsApp, Telegram,
 * Facebook and "Copy link".
 *
 * Which one is decided at tap time, and the same tree is rendered either way: a tap that came
 * before hydration is replayed by the island (share-menu-island.tsx) right after it, and a tree
 * that changed in between would drop it (hardening C3).
 */
export type ShareMenuProps = {
  url: string;
  title: string;
  /** outline = labeled pill on the page; round = a white 44px circle over the photo. */
  variant?: "outline" | "round";
  className?: string;
};

export function ShareMenu({ url, title, variant = "outline", className }: ShareMenuProps) {
  const t = useTranslations("listing.share");
  const [open, setOpen] = useState(false);

  const text = t("text", { title });
  const encodedUrl = encodeURIComponent(url);
  const links = [
    { key: "whatsapp", Icon: WhatsAppIcon, color: brandColors.whatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { key: "telegram", Icon: TelegramIcon, color: brandColors.telegram, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(text)}` },
    { key: "facebook", Icon: FacebookIcon, color: brandColors.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const round = variant === "round";
  const shareNative = () => {
    navigator.share({ title, text, url }).catch((error: unknown) => {
      // The tap no longer counts as one (a replayed early tap): offer the menu instead.
      if (error instanceof Error && error.name === "NotAllowedError") setOpen(true);
    });
  };
  // The menu opens on pointerdown (Radix) and skips it when the event is defaultPrevented.
  const native = {
    onPointerDown: (event: PointerEvent) => {
      if (canShareNatively()) event.preventDefault();
    },
    onKeyDown: (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && canShareNatively()) {
        event.preventDefault();
        shareNative();
      }
    },
    onClick: () => {
      if (canShareNatively()) shareNative();
    },
  };
  const button = round ? (
    <button
      type="button"
      aria-label={t("button")}
      {...native}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-raised outline-none backdrop-blur transition-transform duration-(--motion-fast) ease-standard hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:active:scale-100",
        className,
      )}
    >
      <Share2Icon className="size-5" aria-hidden />
    </button>
  ) : (
    <Button type="button" variant="outline" className={cn("h-11 rounded-full px-4", className)} {...native}>
      <Share2Icon aria-hidden />
      {t("button")}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {links.map(({ key, Icon, color, href }) => (
          <DropdownMenuItem key={key} asChild className="min-h-10 gap-3">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Icon className="size-4" style={{ color }} aria-hidden />
              {t(`networks.${key}`)}
            </a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10 gap-3" onSelect={() => void copy()}>
          <CopyIcon className="size-4" aria-hidden />
          {t("copy")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone's own share sheet: on touch screens that have one (checked at tap time). */
function canShareNatively(): boolean {
  return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
}
