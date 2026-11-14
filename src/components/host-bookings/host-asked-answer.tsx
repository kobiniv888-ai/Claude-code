"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { useRouter } from "@/i18n/navigation";
import { answerHostAskedAction } from "@/lib/booking/actions";
import { toast } from "@/lib/toast";

/**
 * "The guest says you asked them to cancel" (founder's answer (4), src/lib/booking/host-asked.ts):
 * the host confirms or denies it on their booking page. The server decides who may answer and
 * until when (answerHostAskedAction); this only sends the answer and refreshes the page.
 */
export function HostAskedAnswer({ bookingId, deadline }: { bookingId: string; deadline: string }) {
  const t = useTranslations("hostBooking.hostAsked");
  const tb = useTranslations("booking.errors");
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(choice: "confirm" | "deny") {
    setPending(choice);
    setError(null);
    const result = await answerHostAskedAction({ bookingId, answer: choice });
    setPending(null);
    if (!result.ok) {
      const code = result.error;
      setError(tb.has(code) ? tb(code) : te.has(code) ? te(code) : te("server_error"));
      return;
    }
    toast.success(t(result.data.state === "confirmed" ? "confirmed" : "denied"));
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <h2 id="host-asked-title" className="text-h3">
        {t("title")}
      </h2>
      <p className="text-body text-pretty">{t("body", { deadline })}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => answer("confirm")} disabled={pending !== null} aria-busy={pending === "confirm"}>
          <CheckIcon className="size-4" aria-hidden />
          {t("confirm")}
        </Button>
        <Button variant="secondary" onClick={() => answer("deny")} disabled={pending !== null} aria-busy={pending === "deny"}>
          <XIcon className="size-4" aria-hidden />
          {t("deny")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground">{t("note")}</p>
    </div>
  );
}
