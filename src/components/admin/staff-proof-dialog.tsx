"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { KeyRoundIcon, LoaderCircleIcon } from "lucide-react";
import { CodeInput } from "@/components/auth/code-input";
import { useSecurityErrorMessage } from "@/components/auth/use-security-messages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmProof } from "@/lib/auth/fresh-proof-actions";

/**
 * "Confirm with your authenticator" before a destructive admin action (SECURITY_REPORT 3.6.c).
 * Staff prove with the authenticator ONLY: an emailed code never counts for them (founder's
 * decision 5; the server rule is src/lib/admin/server/staff-proof.ts). Opened by the staff-proof
 * provider (./staff-proof.tsx); `onDone(true)` once the code was accepted.
 */
export function StaffProofDialog({ open, onDone }: { open: boolean; onDone: (proven: boolean) => void }) {
  const t = useTranslations("admin.staffProof");
  const errorText = useSecurityErrorMessage();
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await confirmProof({ method: "totp", code: value }).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setCode("");
      setError(result ? result.error : "network");
      return;
    }
    onDone(true);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void confirm(code);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onDone(false)}>
      <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="text-start">
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <KeyRoundIcon className="size-5" aria-hidden />
          </span>
          <DialogTitle className="text-lg font-semibold">{t("title")}</DialogTitle>
          <DialogDescription id={`${id}-desc`}>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <CodeInput
            id={`${id}-code`}
            label={t("codeLabel")}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error) setError(null);
            }}
            onComplete={(value) => void confirm(value)}
            disabled={pending}
            invalid={!!error}
            autoFocus
            autoComplete="one-time-code"
            describedBy={[`${id}-desc`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
              {errorText(error)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("emailNotAccepted")}</p>
          <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base" disabled={pending || code.length !== 6} aria-busy={pending || undefined}>
            {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
            {pending ? t("checking") : t("confirm")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
