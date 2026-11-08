"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheckIcon, EyeOffIcon, MessageCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { LoginConfig } from "@/lib/auth/config";
import { PhoneCheck } from "./phone-check";

/** Sent here by the post form ("/post", "/post/<id>…", or a listing's edit page)? */
function fromPostForm(next: string): boolean {
  return /^\/(post|account\/listings\/[^/?#]+\/edit)(?:[/?#]|$)/.test(next);
}

/**
 * /verify-phone: a host verifies a phone number before posting (once per number). The server
 * sends a text only from the post form, or for a host's account (src/lib/auth/phone-check-policy.ts).
 */
export function VerifyPhonePanel({
  config,
  next,
  verifiedPhone,
}: {
  config: LoginConfig["phone"];
  next: string;
  /** The account's verified number, if it already has one. */
  verifiedPhone: string | null;
}) {
  const t = useTranslations("auth.verifyPhone");
  const router = useRouter();
  const [verified, setVerified] = useState<string | null>(verifiedPhone);
  const [justVerified, setJustVerified] = useState(false);

  function goOn() {
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {!verified && (
        <ul className="grid gap-3 text-sm">
          <li className="flex items-start gap-3">
            <BadgeCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>{t("reasonTrust")}</span>
          </li>
          <li className="flex items-start gap-3">
            <MessageCircleIcon className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
            <span>{t("reasonContact")}</span>
          </li>
          <li className="flex items-start gap-3">
            <EyeOffIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{t("reasonPrivate")}</span>
          </li>
        </ul>
      )}
      <PhoneCheck
        config={config}
        place={fromPostForm(next) ? "post" : "account"}
        verifiedPhone={verifiedPhone}
        onVerified={(phoneNumber) => {
          setVerified(phoneNumber);
          setJustVerified(true);
          router.refresh();
        }}
        onChangeStart={() => setVerified(null)}
      />
      {verified && (
        <Button size="lg" className="h-12 w-full rounded-button text-base font-semibold" onClick={goOn} autoFocus={justVerified}>
          {t("continue")}
        </Button>
      )}
    </div>
  );
}
