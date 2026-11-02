"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIRST_NAME_MAX, firstNameSchema } from "@/lib/auth/first-name";
import { saveFirstName } from "@/lib/auth/profile-actions";

/**
 * "What's your first name?" — one short, required step right after the first sign-up (brief 5.8,
 * bug 8.2). Shown in the login sheet and on /login (also for accounts sent there by requireUser()).
 */
export function FirstNameForm({ onSaved, autoFocus = true }: { onSaved: (firstName: string) => void | Promise<void>; autoFocus?: boolean }) {
  const t = useTranslations("auth.name");
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function errorText(key: string | undefined): string {
    if (key === "required" || key === "too_long" || key === "not_a_name") return t(`errors.${key}`);
    return t("errors.unknown");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = firstNameSchema.safeParse({ firstName: value });
    if (!parsed.success) {
      setError(errorText(parsed.error.issues[0]?.message));
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveFirstName(parsed.data).catch(() => null);
    if (!result?.ok) {
      setPending(false);
      const fieldError = result && !result.ok ? result.fieldErrors?.firstName?.[0] : undefined;
      setError(result?.error === "rate_limited" ? t("errors.rate_limited") : errorText(fieldError));
      return;
    }
    try {
      await onSaved(result.data.firstName);
    } finally {
      setPending(false);
    }
  }

  const inputId = `${id}-first-name`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-1 text-center">
        <p className="text-h3">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("label")}
        </label>
        <Input
          id={inputId}
          dir="auto"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={FIRST_NAME_MAX}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          autoFocus={autoFocus}
          required
          aria-invalid={!!error}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="h-12 text-base"
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          {t("hint")}
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="h-12 w-full rounded-button text-base font-semibold" disabled={pending} aria-busy={pending || undefined}>
        {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
        {t("save")}
      </Button>
    </form>
  );
}
