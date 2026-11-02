"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, MoonStarIcon, SendIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendContactEmail } from "@/lib/contact/actions";
import type { StayRequest } from "@/lib/contact/message";
import { errorMessageKey } from "@/lib/errors";

type FieldName = "name" | "email" | "message";

/**
 * The email channel: a form that emails the owner (their address is never shown). The owner
 * replies straight to the guest's address. Paused while Shabbat mode is on.
 */
type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  defaultName: string;
  defaultEmail: string;
  defaultMessage: string;
  stay: StayRequest;
  paused: boolean;
  /** Who receives the email: "seller" for sale listings, otherwise the host (Hebrew/Arabic wording). */
  role: "host" | "seller";
};

export function EmailContactDialog({
  open,
  onOpenChange,
  role,
  ...form
}: DialogProps) {
  const t = useTranslations("contact.email");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle>{t("title", { role })}</DialogTitle>
          <DialogDescription>{t("description", { role })}</DialogDescription>
        </DialogHeader>
        {/* Mounted on every open, so the fields start from the latest ready message. */}
        <EmailForm {...form} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EmailForm({
  listingId,
  defaultName,
  defaultEmail,
  defaultMessage,
  stay,
  paused,
  onClose,
}: Omit<DialogProps, "open" | "onOpenChange" | "role"> & { onClose: () => void }) {
  const t = useTranslations("contact.email");
  const tc = useTranslations("contact");
  const te = useTranslations("errors");
  const id = useId();
  const [values, setValues] = useState({
    name: defaultName,
    email: defaultEmail,
    message: defaultMessage,
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);

  const set = (field: FieldName) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || paused) return;
    const next: Partial<Record<FieldName, string>> = {};
    if (values.name.trim().length < 2) next.name = t("errors.name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = t("errors.email");
    if (values.message.trim().length < 10) next.message = t("errors.message");
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    setFormError(null);
    try {
      const result = await sendContactEmail({
        listingId,
        name: values.name,
        email: values.email,
        message: values.message,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        turnstileToken: token,
      });
      if (result.ok) {
        setSent(true);
        toast.success(t("sent"));
        return;
      }
      captcha.current?.reset();
      if (result.fieldErrors) {
        setErrors({
          name: result.fieldErrors.name ? t("errors.name") : undefined,
          email: result.fieldErrors.email ? t("errors.email") : undefined,
          message: result.fieldErrors.message ? t("errors.message") : undefined,
        });
      }
      setFormError(
        tc.has(`errors.${result.error}`)
          ? tc(`errors.${result.error}` as never)
          : te(errorMessageKey(result.error)),
      );
    } catch {
      captcha.current?.reset();
      setFormError(te("network"));
    } finally {
      setPending(false);
    }
  }

  const field = (name: FieldName) => ({
    id: `${id}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });

  return sent ? (
    <div
      role="status"
      className="flex flex-col items-center gap-3 py-6 text-center"
    >
      <CheckCircle2Icon className="size-12 text-verified" aria-hidden />
      <p className="font-semibold">{t("sentTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("sent")}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-2 h-11 rounded-xl"
        onClick={onClose}
      >
        {t("close")}
      </Button>
    </div>
  ) : (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      {paused ? (
        <p
          role="status"
          className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning"
        >
          <MoonStarIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("shabbat")}
        </p>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-name`}>{t("name")}</Label>
        <Input
          {...field("name")}
          value={values.name}
          onChange={set("name")}
          autoComplete="name"
          maxLength={80}
          dir="auto"
          className="h-11"
        />
        {errors.name ? (
          <p id={`${id}-name-error`} className="text-sm text-destructive">
            {errors.name}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-email`}>{t("email")}</Label>
        <Input
          {...field("email")}
          type="email"
          inputMode="email"
          dir="ltr"
          value={values.email}
          onChange={set("email")}
          autoComplete="email"
          maxLength={254}
          className="h-11"
        />
        {errors.email ? (
          <p id={`${id}-email-error`} className="text-sm text-destructive">
            {errors.email}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-message`}>{t("message")}</Label>
        <Textarea
          {...field("message")}
          value={values.message}
          onChange={set("message")}
          rows={6}
          maxLength={2000}
          dir="auto"
        />
        {errors.message ? (
          <p id={`${id}-message-error`} className="text-sm text-destructive">
            {errors.message}
          </p>
        ) : null}
      </div>
      <Turnstile
        ref={captcha}
        action="contact_owner"
        onToken={setToken}
        onExpire={() => setToken(null)}
      />
      {formError ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {formError}
        </p>
      ) : null}
      <DialogFooter>
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-xl sm:w-auto"
          disabled={pending || paused}
        >
          <SendIcon className="rtl:-scale-x-100" aria-hidden />
          {pending ? t("sending") : t("send")}
        </Button>
      </DialogFooter>
    </form>
  );
}
