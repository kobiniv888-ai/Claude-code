"use client";

import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BellRingIcon, HeartIcon, MessageCircleIcon, PlusIcon } from "lucide-react";
import { IconCircle } from "@/components/ds/icon-circle";
import type { IconComponent } from "@/components/ds/jewish-icons";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { WelcomeDoorIllustration } from "./illustrations/welcome-door";

type Benefit = { key: "save" | "alerts" | "contact" | "post"; icon: IconComponent; tone: "coral" | "navy" | "green" };

/**
 * What an account gives you, in three short rows. "Alerts for new places" is shown only while
 * saved-search alerts are switched on (siteConfig.features.savedSearchAlerts); until then the row
 * says what signing in really unlocks today: the hosts' phone and WhatsApp.
 */
function benefits(): Benefit[] {
  return [
    { key: "save", icon: HeartIcon, tone: "coral" },
    siteConfig.features.savedSearchAlerts
      ? { key: "alerts", icon: BellRingIcon, tone: "navy" }
      : { key: "contact", icon: MessageCircleIcon, tone: "green" },
    { key: "post", icon: PlusIcon, tone: "navy" },
  ];
}

export function LoginBenefits({ className }: { className?: string }) {
  const t = useTranslations("auth.welcome");
  return (
    <ul aria-label={t("benefitsLabel")} className={cn("grid gap-2", className)}>
      {benefits().map(({ key, icon, tone }) => (
        <li key={key} className="flex min-h-11 items-center gap-3 rounded-input bg-muted/60 px-3 py-1.5">
          <IconCircle icon={icon} tone={tone} size="sm" />
          <span className="text-small font-medium text-foreground">{t(`benefits.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}

type TextComponent = ComponentType<{ className?: string; children?: ReactNode }>;

/**
 * The top of the sign-in sheet and the /login page: the animated door, a short headline, one line
 * and the three benefits. `compact` (while entering the code or the 2-step code) keeps a small
 * door and the headline only, so the form stays above the phone keyboard.
 *
 * `Title`/`Description` let the dialog pass its accessible title components.
 */
export function LoginWelcome({
  title,
  description,
  compact = false,
  Title = "h1",
  Description = "p",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  compact?: boolean;
  Title?: TextComponent | "h1" | "h2";
  Description?: TextComponent | "p";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <WelcomeDoorIllustration className={compact ? "w-24" : "w-36 sm:w-40"} />
      <Title className="mt-1 text-h2 text-balance text-foreground">{title}</Title>
      {description && !compact ? (
        <Description className="mt-1.5 max-w-sm text-small text-pretty text-muted-foreground">{description}</Description>
      ) : null}
      {!compact ? <LoginBenefits className="mt-4 w-full text-start" /> : null}
    </div>
  );
}
