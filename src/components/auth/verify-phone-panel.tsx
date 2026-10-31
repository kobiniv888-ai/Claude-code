"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheckIcon, CircleCheckBigIcon, EyeOffIcon, MessageCircleIcon } from "lucide-react";
import { formatPhoneNumberIntl } from "react-phone-number-input";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { LoginConfig } from "@/lib/auth/config";
import { PhoneCodeForm } from "./phone-code-form";

/** Add and verify a phone number (Google/Apple accounts; required to post a listing). */
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
  const [changing, setChanging] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  function goOn() {
    router.replace(next);
    router.refresh();
  }

  if (verified && !changing) {
    const display = formatPhoneNumberIntl(verified) || verified;
    return (
      <div className="grid gap-5">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-verified-soft text-verified">
            <CircleCheckBigIcon className="size-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold">{t("doneTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t.rich("doneText", {
              phone: display,
              ltr: (chunks) => <Ltr className="font-medium text-foreground">{chunks}</Ltr>,
            })}
          </p>
        </div>
        <Button size="lg" className="h-12 w-full rounded-xl text-base" onClick={goOn} autoFocus={justVerified}>
          {t("continue")}
        </Button>
        {!justVerified && (
          <Button variant="link" className="mx-auto h-auto" onClick={() => setChanging(true)}>
            {t("useAnother")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <ul className="grid gap-3 text-sm">
        <li className="flex items-start gap-3">
          <BadgeCheckIcon className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
          <span>{t("reasonTrust")}</span>
        </li>
        <li className="flex items-start gap-3">
          <MessageCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{t("reasonContact")}</span>
        </li>
        <li className="flex items-start gap-3">
          <EyeOffIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{t("reasonPrivate")}</span>
        </li>
      </ul>
      <PhoneCodeForm
        mode="add-phone"
        config={config}
        onVerified={(phoneNumber) => {
          setVerified(phoneNumber);
          setChanging(false);
          setJustVerified(true);
        }}
      />
      {changing && (
        <Button variant="link" className="mx-auto h-auto" onClick={() => setChanging(false)}>
          {t("keepCurrent")}
        </Button>
      )}
    </div>
  );
}
