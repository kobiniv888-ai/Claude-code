"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, CheckIcon, DownloadIcon, LinkIcon, LoaderIcon, MailCheckIcon, Trash2Icon, UnlinkIcon, UserRoundIcon } from "lucide-react";
import { clearPrivateCaches, clearPrivateDeviceData } from "@/lib/auth/device-data";
import { toast } from "@/lib/toast";
import { CodeInput } from "@/components/auth/code-input";
import { formatCountdown } from "@/components/auth/use-auth-messages";
import { useFreshProof } from "@/components/auth/use-fresh-proof";
import { AppleIcon, GoogleIcon } from "@/components/common/brand-icons";
import { Ltr } from "@/components/common/ltr";
import { useCurrency } from "@/components/providers/currency-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { usePathname, useRouter } from "@/i18n/navigation";
import { FIRST_NAME_MAX } from "@/lib/auth/first-name";
import {
  deleteMyAccount,
  removeAvatar,
  unlinkSocialAccount,
  updateNotifications,
  updatePreferences,
  updateProfile,
} from "@/lib/account/actions";
import { confirmContactEmailChange, removeContactEmail, sendContactEmailCode } from "@/lib/auth/contact-email-actions";
import type { AccountSettingsData, ConnectedProvider } from "@/lib/account/queries";
import {
  BIO_MAX,
  BUSINESS_NAME_MAX,
  MAX_SPOKEN_LANGUAGES,
  NAME_MAX,
  remainingSignInMethods,
  SPOKEN_LANGUAGE_OPTIONS,
  type NotificationPrefs,
} from "@/lib/account/settings-schema";
import { authClient } from "@/lib/auth/client";
import { enabledCurrencies } from "@/lib/currency/convert";
import { currencySymbol } from "@/lib/format";
import { UPLOAD_IMAGE_ACCEPT } from "@/lib/media";
import { languageName } from "@/lib/listing-page/helpers";
import { cn } from "@/lib/utils";
import { avatarInitial } from "@/lib/account/greeting";
import { useActionError } from "./use-action-error";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Runs a settings action with a toast and a refresh of the server data. */
function useSave() {
  const t = useTranslations("account.settings");
  const router = useRouter();
  const errorText = useActionError();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const save = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(errorText(result.error));
        return;
      }
      setFieldErrors({});
      toast.success(t("saved"));
      if (after) after();
      else router.refresh();
    });
  return { pending, save, fieldErrors };
}

function SaveButton({ pending, label }: { pending: boolean; label?: string }) {
  const t = useTranslations("account.settings");
  return (
    <Button type="submit" className="h-11 rounded-xl px-5" disabled={pending}>
      {pending ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
      {pending ? t("saving") : (label ?? t("save"))}
    </Button>
  );
}

export function SettingsSection({
  id,
  title,
  lead,
  children,
  tone = "default",
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-4 shadow-xs sm:p-6",
        tone === "danger" && "border-destructive/30",
      )}
    >
      <h2 id={`${id}-title`} className={cn("text-lg font-semibold", tone === "danger" && "text-destructive")}>
        {title}
      </h2>
      {lead ? <p className="mt-1 text-sm text-muted-foreground">{lead}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  const t = useTranslations("account.settings.fieldErrors");
  if (!errors?.length) return null;
  const code = errors[0];
  return (
    <p id={id} className="text-sm text-destructive">
      {t.has(code) ? t(code) : t("invalid")}
    </p>
  );
}

// ─── Profile ──────────────────────────────────────────────────

function AvatarField({ initial, image }: { initial: string | null; image: string | null }) {
  const t = useTranslations("account.settings.profile");
  const router = useRouter();
  const errorText = useActionError();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        toast.error(errorText(body.error ?? "server_error"));
        return;
      }
      toast.success(t("photoSaved"));
      router.refresh();
    } catch {
      toast.error(errorText("network"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-20">
        {image ? <AvatarImage src={image} alt={t("photoAlt")} /> : null}
        <AvatarFallback className="text-lg">{initial ?? <UserRoundIcon className="size-8" aria-hidden />}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={UPLOAD_IMAGE_ACCEPT}
          className="sr-only"
          aria-label={t("photo")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <CameraIcon aria-hidden="true" />}
          {busy ? t("uploading") : image ? t("changePhoto") : t("addPhoto")}
        </Button>
        {image ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl px-4 text-muted-foreground"
            disabled={pending || busy}
            onClick={() =>
              startTransition(async () => {
                const result = await removeAvatar();
                if (!result.ok) toast.error(errorText(result.error));
                else router.refresh();
              })
            }
          >
            <Trash2Icon aria-hidden="true" />
            {t("removePhoto")}
          </Button>
        ) : null}
      </div>
      <p className="w-full text-xs text-muted-foreground">{t("photoHint")}</p>
    </div>
  );
}

/** `languageNames`: spoken-language names in the page language, from the server (Intl data differs per browser). */
export function ProfileForm({ data, languageNames }: { data: AccountSettingsData; languageNames: Record<string, string> }) {
  const t = useTranslations("account.settings.profile");
  const locale = useLocale();
  const id = useId();
  const { pending, save, fieldErrors } = useSave();
  const [name, setName] = useState(data.name);
  const [firstName, setFirstName] = useState(data.firstName ?? "");
  const [bio, setBio] = useState(data.bio ?? "");
  const [languages, setLanguages] = useState<string[]>(data.spokenLanguages);
  const [keepsShabbat, setKeepsShabbat] = useState(data.keepsShabbat);
  const [accountType, setAccountType] = useState(data.accountType);
  const [businessName, setBusinessName] = useState(data.businessName ?? "");
  const options = [...new Set([...SPOKEN_LANGUAGE_OPTIONS, ...data.spokenLanguages])];

  const toggleLanguage = (code: string) =>
    setLanguages((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : current.length >= MAX_SPOKEN_LANGUAGES ? current : [...current, code],
    );

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateProfile({ name, firstName, bio, spokenLanguages: languages, keepsShabbat, accountType, businessName }));
      }}
    >
      <AvatarField initial={avatarInitial({ firstName: data.firstName, isDemo: false })} image={data.image} />

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          {t("name")}
        </label>
        <Input
          id={`${id}-name`}
          dir="auto"
          value={name}
          maxLength={NAME_MAX}
          required
          autoComplete="name"
          aria-invalid={!!fieldErrors.name}
          aria-describedby={fieldErrors.name ? `${id}-name-error` : `${id}-name-hint`}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl bg-background"
        />
        <p id={`${id}-name-hint`} className="text-xs text-muted-foreground">
          {t("nameHint")}
        </p>
        <FieldError id={`${id}-name-error`} errors={fieldErrors.name} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-first-name`} className="text-sm font-medium">
          {t("firstName")}
        </label>
        <Input
          id={`${id}-first-name`}
          dir="auto"
          value={firstName}
          maxLength={FIRST_NAME_MAX}
          required
          autoComplete="given-name"
          aria-invalid={!!fieldErrors.firstName}
          aria-describedby={fieldErrors.firstName ? `${id}-first-name-error` : `${id}-first-name-hint`}
          onChange={(e) => setFirstName(e.target.value)}
          className="h-11 rounded-xl bg-background"
        />
        <p id={`${id}-first-name-hint`} className="text-xs text-muted-foreground">
          {t("firstNameHint")}
        </p>
        <FieldError id={`${id}-first-name-error`} errors={fieldErrors.firstName} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-bio`} className="text-sm font-medium">
          {t("bio")}
        </label>
        <Textarea
          id={`${id}-bio`}
          dir="auto"
          rows={4}
          maxLength={BIO_MAX}
          value={bio}
          placeholder={t("bioPlaceholder")}
          onChange={(e) => setBio(e.target.value)}
          className="bg-background"
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t("languages")}</legend>
        <p className="text-xs text-muted-foreground">{t("languagesHint")}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((code) => {
            const on = languages.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLanguage(code)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "border-primary bg-secondary font-medium text-primary" : "bg-background hover:bg-muted",
                )}
              >
                {on ? <CheckIcon className="size-3.5" aria-hidden="true" /> : null}
                {languageNames[code] ?? languageName(code, locale)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
        <div className="grid gap-0.5">
          <label htmlFor={`${id}-shabbat`} className="text-sm font-medium">
            {t("keepsShabbat")}
          </label>
          <p className="text-xs text-muted-foreground">{t("keepsShabbatHint")}</p>
        </div>
        <Switch id={`${id}-shabbat`} checked={keepsShabbat} onCheckedChange={setKeepsShabbat} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t("accountType")}</legend>
        <RadioGroup
          value={accountType}
          onValueChange={(v) => setAccountType(v as typeof accountType)}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(["PRIVATE", "BUSINESS"] as const).map((type) => (
            <label
              key={type}
              htmlFor={`${id}-${type}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-3",
                accountType === type && "border-primary bg-secondary/50",
              )}
            >
              <RadioGroupItem id={`${id}-${type}`} value={type} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t(`types.${type}.label`)}</span>
                <span className="text-xs text-muted-foreground">{t(`types.${type}.hint`)}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {accountType === "BUSINESS" ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-business`} className="text-sm font-medium">
            {t("businessName")}
          </label>
          <Input
            id={`${id}-business`}
            dir="auto"
            value={businessName}
            maxLength={BUSINESS_NAME_MAX}
            required
            autoComplete="organization"
            aria-invalid={!!fieldErrors.businessName}
            aria-describedby={fieldErrors.businessName ? `${id}-business-error` : undefined}
            onChange={(e) => setBusinessName(e.target.value)}
            className="h-11 rounded-xl bg-background"
          />
          <FieldError id={`${id}-business-error`} errors={fieldErrors.businessName} />
        </div>
      ) : null}

      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

// ─── Contact email ────────────────────────────────────────────

/**
 * The contact email (it receives every notification). A sensitive change (SECURITY_REPORT 3.6.a):
 * a fresh code first, then a code to the NEW address; the old address is told, and the other
 * devices are signed out (src/lib/auth/contact-email-actions.ts).
 */
export function ContactEmailForm({ loginEmail, contactEmail }: { loginEmail: string | null; contactEmail: string | null }) {
  const t = useTranslations("account.settings.email");
  const tc = useTranslations("security.contactEmail");
  const router = useRouter();
  const errorText = useActionError();
  const id = useId();
  const proof = useFreshProof();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(contactEmail ?? "");
  const [fieldError, setFieldError] = useState<string[] | undefined>(undefined);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [screenCode, setScreenCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  // A code to a typed address needs the CAPTCHA (checked on the server: SECURITY_REPORT 3.2.b).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  const changed = value.trim().toLowerCase() !== (contactEmail ?? "").toLowerCase();

  function sendCode() {
    startTransition(async () => {
      setFieldError(undefined);
      setCodeError(null);
      if (!value.trim()) {
        const removed = await proof.run(() => removeContactEmail());
        if (!removed) return;
        if (!removed.ok) return void toast.error(errorText(removed.error));
        toast.success(tc("removed"));
        router.refresh();
        return;
      }
      const token = captchaToken;
      const result = await proof.run(() => sendContactEmailCode({ contactEmail: value, captchaToken: token }));
      // Turnstile tokens are single-use: a new one for the next send.
      setCaptchaToken(null);
      captcha.current?.reset();
      if (!result) return;
      if (!result.ok) {
        setFieldError(result.fieldErrors?.contactEmail);
        if (!result.fieldErrors) toast.error(errorText(result.error));
        return;
      }
      setSentTo(result.data.sentTo);
      setScreenCode(result.data.screenCode ?? null);
      setCode("");
      setNow(Date.now());
      setWaitUntil(Date.now() + result.data.retryAfterSeconds * 1000);
      if (!result.data.sent) setCodeError("code_wait");
    });
  }

  function confirm(entered: string) {
    if (entered.length !== 6) return;
    startTransition(async () => {
      setCodeError(null);
      const result = await confirmContactEmailChange({ contactEmail: value, code: entered });
      if (!result.ok) {
        setCode("");
        setCodeError(result.error);
        return;
      }
      setSentTo(null);
      setScreenCode(null);
      toast.success(result.data.sessionsEnded > 0 ? tc("savedSignedOut") : tc("saved"));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !sentTo) sendCode();
        }}
      >
        {loginEmail ? (
          <p className="text-sm">
            {t("loginEmail")} <Ltr className="font-medium">{loginEmail}</Ltr>
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t("label")}
          </label>
          <Input
            id={id}
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={value}
            maxLength={254}
            disabled={!!sentTo}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? `${id}-error` : `${id}-hint`}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 rounded-xl bg-background text-start"
          />
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {loginEmail ? t("hintWithLogin") : t("hintPhone")} {tc("hint")}
          </p>
          <FieldError id={`${id}-error`} errors={fieldError} />
        </div>
        {!sentTo ? (
          <div>
            <Button type="submit" disabled={pending || !changed || (!!value.trim() && !captchaToken)} className="h-11 rounded-xl px-5">
              {pending ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <MailCheckIcon aria-hidden="true" />}
              {value.trim() ? tc("sendCode") : tc("remove")}
            </Button>
          </div>
        ) : null}
      </form>

      {/* Invisible unless Cloudflare needs a click; the token goes with "send code". */}
      <Turnstile ref={captcha} action="contact_email" onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => setCaptchaToken(null)} />

      {sentTo ? (
        <form
          className="grid gap-3 rounded-xl border bg-background p-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            confirm(code);
          }}
        >
          <p id={`${id}-sent`} className="text-sm text-muted-foreground">
            {tc.rich("sent", { email: sentTo, ltr: (chunks) => <Ltr className="font-medium text-foreground">{chunks}</Ltr> })}
          </p>
          {screenCode ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {tc.rich("screenCode", { code: screenCode, ltr: (chunks) => <Ltr className="font-mono font-semibold tracking-widest">{chunks}</Ltr> })}
            </p>
          ) : null}
          <CodeInput
            id={`${id}-code`}
            label={tc("codeLabel")}
            value={code}
            onChange={(next) => {
              setCode(next);
              if (codeError) setCodeError(null);
            }}
            onComplete={confirm}
            disabled={pending}
            invalid={!!codeError && codeError !== "code_wait"}
            autoFocus
            autoComplete="one-time-code"
            describedBy={[`${id}-sent`, codeError ? `${id}-code-error` : null].filter(Boolean).join(" ")}
          />
          {codeError ? (
            <p id={`${id}-code-error`} role="alert" className="text-sm font-medium text-destructive">
              {codeError === "code_wait" ? tc("wait", { time: formatCountdown(secondsLeft) }) : errorText(codeError)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending || code.length !== 6} className="h-11 rounded-xl px-5">
              {pending ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
              {tc("confirm")}
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-xl" disabled={pending || secondsLeft > 0 || !captchaToken} onClick={sendCode}>
              {secondsLeft > 0 ? tc("resendIn", { time: formatCountdown(secondsLeft) }) : tc("resend")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xl"
              disabled={pending}
              onClick={() => {
                setSentTo(null);
                setScreenCode(null);
                setCodeError(null);
                setValue(contactEmail ?? "");
              }}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      ) : null}
      {proof.dialog}
    </div>
  );
}

// ─── Language, currency, Hebrew dates ─────────────────────────

export function PreferencesForm({ data }: { data: AccountSettingsData }) {
  const t = useTranslations("account.settings.preferences");
  const current = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const { pending, save } = useSave();
  const [locale, setLocale] = useState<AppLocale>(data.locale as AppLocale);
  const display = useCurrency();
  // "auto" while prices follow the language (no choice yet); else the currency the visitor chose
  // (the header's choice is a cookie and wins over the account setting, so show what is in effect).
  const [initialCurrency] = useState<string>(display.chosen ? display.currency : "auto");
  const [currency, setCurrency] = useState<string>(initialCurrency);
  const [hebrewDates, setHebrewDates] = useState(data.showHebrewDates);

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save(
          // The currency only when it was changed here (bug 2.8: a save used to pin the shown one).
          () => updatePreferences({ locale, currency: currency !== initialCurrency ? currency : undefined, showHebrewDates: hebrewDates }),
          () => (locale !== current ? router.replace(pathname, { locale }) : router.refresh()),
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-locale`} className="text-sm font-medium">
            {t("language")}
          </label>
          <Select value={locale} onValueChange={(v) => setLocale(v as AppLocale)}>
            <SelectTrigger id={`${id}-locale`} className="h-11! w-full rounded-xl bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((code) => (
                <SelectItem key={code} value={code}>
                  <span lang={code}>{siteConfig.i18n.nativeNames[code]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-currency`} className="text-sm font-medium">
            {t("currency")}
          </label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id={`${id}-currency`} className="h-11! w-full rounded-xl bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                {t("currencyAuto")} ·{" "}
                <Ltr>
                  {currencySymbol(display.automatic)} {display.automatic}
                </Ltr>
              </SelectItem>
              {enabledCurrencies.map((code) => (
                <SelectItem key={code} value={code}>
                  <Ltr>
                    {currencySymbol(code)} {code}
                  </Ltr>{" "}
                  · {t(`currencies.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("currencyHint")}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
        <div className="grid gap-0.5">
          <label htmlFor={`${id}-hebrew`} className="text-sm font-medium">
            {t("hebrewDates")}
          </label>
          <p className="text-xs text-muted-foreground">{t("hebrewDatesHint")}</p>
        </div>
        <Switch id={`${id}-hebrew`} checked={hebrewDates} onCheckedChange={setHebrewDates} />
      </div>
      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

// ─── Notifications ────────────────────────────────────────────

export function NotificationsForm({ prefs, emailAvailable, isHost = false }: { prefs: NotificationPrefs; emailAvailable: boolean; isHost?: boolean }) {
  const t = useTranslations("account.settings.notifications");
  const id = useId();
  const { pending, save } = useSave();
  const [value, setValue] = useState(prefs);
  // "weeklyStats": the hosts' weekly stats email (round 3, brief 6.2), for accounts with listings.
  const emailRows = (
    ["listing", ...(isHost ? (["weeklyStats"] as const) : []), "tickets", ...(siteConfig.features.chat ? (["messages"] as const) : []), "marketing"] as const
  ).map((key) => key as keyof NotificationPrefs["email"]);

  const row = (key: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <li key={key} className="flex items-start justify-between gap-4 py-3">
      <div className="grid gap-0.5">
        <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={`${id}-${key}`} checked={checked} onCheckedChange={onChange} />
    </li>
  );

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateNotifications(value));
      }}
    >
      {!emailAvailable ? (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm">
          {t("noEmail")}{" "}
          <a href="#email" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("addEmail")}
          </a>
        </p>
      ) : null}
      <fieldset>
        <legend className="text-sm font-semibold">{t("emailTitle")}</legend>
        <ul className="divide-y">
          {emailRows.map((key) =>
            row(key, t(`email.${key}.label`), t(`email.${key}.hint`), value.email[key], (v) =>
              setValue((p) => ({ ...p, email: { ...p.email, [key]: v } })),
            ),
          )}
        </ul>
      </fieldset>
      {siteConfig.features.whatsappNotifications ? (
        <fieldset>
          <legend className="text-sm font-semibold">{t("whatsappTitle")}</legend>
          <ul>{row("whatsapp", t("whatsapp.label"), t("whatsapp.hint"), value.whatsapp, (v) => setValue((p) => ({ ...p, whatsapp: v })))}</ul>
        </fieldset>
      ) : null}
      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

// ─── Connected accounts ───────────────────────────────────────

const PROVIDER_ICON: Record<ConnectedProvider, typeof GoogleIcon> = { google: GoogleIcon, apple: AppleIcon };

export function ConnectedAccounts({ data }: { data: AccountSettingsData }) {
  const t = useTranslations("account.settings.connected");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useActionError();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<ConnectedProvider | null>(null);
  const proof = useFreshProof();

  // Connecting Google/Apple needs a fresh code first (SECURITY_REPORT 3.3.c; the server refuses without).
  const link = async (provider: ConnectedProvider) => {
    if (!(await proof.ask())) return;
    setBusy(provider);
    const result = await authClient.linkSocial({ provider, callbackURL: `/${locale}/account/settings#connected` });
    if (result?.error) {
      setBusy(null);
      toast.error(errorText(result.error.code === "FRESH_PROOF_REQUIRED" ? "fresh_proof_required" : "server_error"));
    }
  };

  return (
    <ul className="grid gap-2">
      {data.providers.map((provider) => {
        const Icon = PROVIDER_ICON[provider];
        const linked = data.linked.includes(provider);
        const last = linked && remainingSignInMethods(data, provider) < 1;
        return (
          <li key={provider} className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
            <Icon className="size-6 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(`providers.${provider}`)}</p>
              <p className="text-xs text-muted-foreground">{linked ? (last ? t("lastMethod") : t("linked")) : t("notLinked")}</p>
            </div>
            {linked ? (
              <Button
                variant="outline"
                className="h-10 rounded-xl px-4"
                disabled={pending || last}
                onClick={() =>
                  startTransition(async () => {
                    const result = await proof.run(() => unlinkSocialAccount(provider));
                    if (!result) return;
                    if (!result.ok) {
                      toast.error(errorText(result.error));
                      return;
                    }
                    toast.success(t("unlinked"));
                    router.refresh();
                  })
                }
              >
                <UnlinkIcon aria-hidden="true" />
                {t("unlink")}
              </Button>
            ) : (
              <Button variant="outline" className="h-10 rounded-xl px-4" disabled={busy !== null} onClick={() => void link(provider)}>
                {busy === provider ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
                {t("link")}
              </Button>
            )}
          </li>
        );
      })}
      {proof.dialog}
    </ul>
  );
}

// ─── Download my data ─────────────────────────────────────────

export function DataExport() {
  const t = useTranslations("account.settings.data");
  return (
    <div className="grid gap-3">
      <ul className="grid list-disc gap-1 ps-5 text-sm text-muted-foreground">
        <li>{t("includes")}</li>
        <li>{t("excludes")}</li>
        <li>{t("limit")}</li>
      </ul>
      <div>
        <Button asChild variant="outline" className="h-11 rounded-xl px-5">
          <a href="/api/account/export" download>
            <DownloadIcon aria-hidden="true" />
            {t("download")}
          </a>
        </Button>
      </div>
    </div>
  );
}

// ─── Delete my account ────────────────────────────────────────

export function DeleteAccount({ isStaff }: { isStaff: boolean }) {
  const t = useTranslations("account.settings.delete");
  const locale = useLocale();
  const errorText = useActionError();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const proof = useFreshProof();
  const word = t("confirmWord");
  const matches = typed.trim().toLocaleLowerCase() === word.toLocaleLowerCase();

  if (isStaff) return <p className="text-sm text-muted-foreground">{t("staff")}</p>;

  return (
    <div className="grid gap-3">
      <ul className="grid list-disc gap-1 ps-5 text-sm text-muted-foreground">
        <li>{t("what1")}</li>
        <li>{t("what2")}</li>
        <li>{t("what3")}</li>
      </ul>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="h-11 w-fit rounded-xl px-5">
            <Trash2Icon aria-hidden="true" />
            {t("button")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!matches) return;
              startTransition(async () => {
                // Deleting the account needs a fresh code first (SECURITY_REPORT 3.6.b).
                const result = await proof.run(() => deleteMyAccount({ confirmation: typed }));
                if (!result) return;
                if (!result.ok) {
                  toast.error(errorText(result.error));
                  return;
                }
                // A full page load on purpose: the session is gone and every cached page must forget the user.
                // This device's private data goes too (recently viewed, compare list…: round 3, bug 2.9),
                // and the saved trip pages are gone BEFORE the page is, as at logout (trip-offline-6).
                clearPrivateDeviceData();
                await clearPrivateCaches();
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign(`/${locale}`);
              });
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("dialogBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor={id} className="text-sm font-medium">
                {t.rich("typeToConfirm", { word: () => <strong className="font-mono">{word}</strong> })}
              </label>
              <Input
                id={id}
                value={typed}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => setTyped(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={pending}>
                {t("cancel")}
              </AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!matches || pending}>
                {pending ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <Trash2Icon aria-hidden="true" />}
                {pending ? t("deleting") : t("confirm")}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {proof.dialog}
    </div>
  );
}
