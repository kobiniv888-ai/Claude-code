"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { errorMessageKey } from "@/lib/errors";
import { setReviewRequests } from "@/lib/reviews/actions";
import { toast } from "@/lib/toast";

/** "Ask me for a review by email after a stay" (User.notificationPrefs.email.reviewRequests). */
export function ReviewRequestSwitch({ initial }: { initial: boolean }) {
  const t = useTranslations("reviews.account");
  const tc = useTranslations("errors");
  const id = useId();
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setPending(true);
    try {
      const result = await setReviewRequests({ on: next });
      if (!result.ok) {
        setOn(!next);
        toast.error(tc(errorMessageKey(result.error)));
      } else toast.success(next ? t("emailOnSaved") : t("emailOffSaved"));
    } catch {
      setOn(!next);
      toast.error(tc("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-body font-medium">
          {t("emailTitle")}
        </Label>
        <p id={`${id}-hint`} className="text-small text-muted-foreground">
          {t("emailHint")}
        </p>
      </div>
      <Switch id={id} checked={on} onCheckedChange={change} disabled={pending} aria-describedby={`${id}-hint`} className="mt-1" />
    </div>
  );
}
