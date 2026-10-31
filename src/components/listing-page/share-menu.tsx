"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { FacebookIcon, TelegramIcon, WhatsAppIcon, brandColors } from "@/components/common/brand-icons";
import { Button } from "@/components/ui/button";
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
 */
export function ShareMenu({ url, title }: { url: string; title: string }) {
  const t = useTranslations("listing.share");
  const [native, setNative] = useState(false);

  useEffect(() => {
    // Feature detection after hydration (navigator only exists in the browser).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNative(typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

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

  const button = (
    <Button type="button" variant="outline" className="h-10 rounded-full">
      <Share2Icon aria-hidden />
      {t("button")}
    </Button>
  );

  if (native) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-full"
        onClick={() => {
          navigator.share({ title, text, url }).catch(() => undefined);
        }}
      >
        <Share2Icon aria-hidden />
        {t("button")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
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
