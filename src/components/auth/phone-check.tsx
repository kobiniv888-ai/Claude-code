"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheckBigIcon, PhoneOffIcon } from "lucide-react";
import { formatPhoneNumberIntl } from "react-phone-number-input/input";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import type { LoginConfig } from "@/lib/auth/config";
import type { PhoneCheckPlace } from "@/lib/auth/phone-check-policy";
import { PhoneCodeForm } from "./phone-code-form";
import { useFreshProof } from "./use-fresh-proof";

/**
 * "Verify your phone" — reusable (founder request, round 2): a guest making a booking, and a host
 * before posting. SMS codes are used ONLY here, and once per number: when the account already has
 * a verified number it is shown with a check mark and no code is sent; choosing the same number
 * again needs no code either (the server checks, see @/lib/auth/phone-check-actions).
 *
 *   const config = await getLoginConfig(locale);          // server component
 *   <PhoneCheck
 *     config={config.phone}
 *     place="booking" listingId={listing.id}               // where the check happens (the server checks it)
 *     verifiedPhone={user.phoneNumberVerified ? user.phoneNumber : null}
 *     onVerified={(phone) => setGuestPhone(phone)}         // E.164, also called for a re-chosen verified number
 *   />
 *
 * The signed-in account's User.phoneNumber/phoneNumberVerified are updated by the server; call
 * router.refresh() if the page shows them elsewhere. Client text: `auth.verifyPhone`, `auth.phone`,
 * `auth.codes`, `auth.country`, `auth.errors` (add them to the route's client messages).
 * Without an SMS service on the real site it says the check is not available yet and sends nothing.
 */
export function PhoneCheck({
  config,
  verifiedPhone,
  onVerified,
  onChangeStart,
  autoFocus,
  place,
  listingId,
  postStepToken,
}: {
  config: LoginConfig["phone"];
  /** Where the check happens: a guest's booking (with `listingId`), the post form, or a host's account. */
  place: PhoneCheckPlace;
  listingId?: string | null;
  /** `place="post"` before the first draft: the post form's phone-step token (given by /verify-phone). */
  postStepToken?: string | null;
  /** The account's verified number (E.164), if it has one. */
  verifiedPhone: string | null;
  onVerified?: (phoneNumber: string) => void | Promise<void>;
  /** Told when the person starts entering a different number (the verified one no longer applies). */
  onChangeStart?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("auth.verifyPhone");
  const [verified, setVerified] = useState<string | null>(verifiedPhone);
  const [changing, setChanging] = useState(false);
  // Replacing a verified number needs a fresh code first (SECURITY_REPORT 3.6.a; the server checks).
  const proof = useFreshProof();

  if (verified && !changing) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-input border border-border bg-card px-3.5 py-3">
        <span className="flex items-center gap-2.5 text-sm">
          <CircleCheckBigIcon className="size-5 shrink-0 text-success" aria-hidden />
          <span>
            {t.rich("verifiedLine", {
              phone: formatPhoneNumberIntl(verified) || verified,
              ltr: (chunks) => <Ltr className="font-semibold text-foreground">{chunks}</Ltr>,
            })}
          </span>
        </span>
        <Button
          type="button"
          variant="link"
          className="min-h-tap h-auto max-w-full px-0 whitespace-normal text-start"
          onClick={async () => {
            if (!(await proof.ask())) return;
            setChanging(true);
            onChangeStart?.();
          }}
        >
          {t("useAnother")}
        </Button>
        {proof.dialog}
      </div>
    );
  }

  if (!config.available) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-input border border-border bg-surface-muted px-3.5 py-3">
        <PhoneOffIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="grid gap-0.5">
          <p className="text-sm font-semibold">{t("unavailableTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("unavailableText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <PhoneCodeForm
        purpose="check"
        config={config}
        place={place}
        listingId={listingId}
        postStepToken={postStepToken}
        autoFocus={autoFocus}
        onVerified={async (phoneNumber) => {
          setVerified(phoneNumber);
          setChanging(false);
          await onVerified?.(phoneNumber);
        }}
      />
      {changing && verified && (
        <Button
          type="button"
          variant="link"
          className="mx-auto min-h-tap h-auto max-w-full whitespace-normal text-center"
          onClick={() => {
            setChanging(false);
            void onVerified?.(verified);
          }}
        >
          {t("keepCurrent")}
        </Button>
      )}
    </div>
  );
}
