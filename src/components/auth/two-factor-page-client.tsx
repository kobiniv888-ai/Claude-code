"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/client";
import { TwoFactorChallenge } from "./two-factor-challenge";

/** /two-factor: the code form, then on to `next`. */
export function TwoFactorPageClient({ next }: { next: string }) {
  const t = useTranslations("auth.twoFactor");
  const router = useRouter();
  return (
    <div className="grid gap-4">
      <TwoFactorChallenge
        showIntro={false}
        onVerified={() => {
          router.replace(next);
          router.refresh();
        }}
      />
      <Button
        type="button"
        variant="link"
        className="mx-auto h-auto"
        onClick={async () => {
          await signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}
