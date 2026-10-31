import { MailIcon, MessageSquareTextIcon, PhoneIcon } from "lucide-react";
import { brandColors, MessengerIcon, TelegramIcon, ViberIcon, WhatsAppIcon } from "@/components/common/brand-icons";
import type { ContactChannelKey } from "@/lib/listing/fields";
import { cn } from "@/lib/utils";

const BRANDS = {
  WHATSAPP: { Icon: WhatsAppIcon, color: brandColors.whatsapp },
  TELEGRAM: { Icon: TelegramIcon, color: brandColors.telegram },
  VIBER: { Icon: ViberIcon, color: brandColors.viber },
  MESSENGER: { Icon: MessengerIcon, color: brandColors.messenger },
} as const;

/**
 * The app's logo for WhatsApp, Telegram, Viber and Messenger, or a Lucide icon for phone, SMS
 * and email. `mono` keeps the current text color (on a colored button).
 */
export function ChannelIcon({ channel, mono = false, className }: { channel: ContactChannelKey; mono?: boolean; className?: string }) {
  const cls = cn("size-5 shrink-0", className);
  if (channel in BRANDS) {
    const { Icon, color } = BRANDS[channel as keyof typeof BRANDS];
    return <Icon className={cls} style={mono ? undefined : { color }} aria-hidden />;
  }
  if (channel === "PHONE") return <PhoneIcon className={cls} aria-hidden />;
  if (channel === "SMS") return <MessageSquareTextIcon className={cls} aria-hidden />;
  return <MailIcon className={cls} aria-hidden />;
}
