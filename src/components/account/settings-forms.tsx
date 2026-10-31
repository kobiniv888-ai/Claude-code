"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, CheckIcon, DownloadIcon, LinkIcon, LoaderIcon, Trash2Icon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";
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
import {
  deleteMyAccount,
  removeAvatar,
  unlinkSocialAccount,
  updateContactEmail,
  updateNotifications,
  updatePreferences,
  updateProfile,
} from "@/lib/account/actions";
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
import { languageName } from "@/lib/listing-page/helpers";
import { cn } from "@/lib/utils";
import { initials } from "./account-shell";
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

function AvatarField({ name, image }: { name: string; image: string | null }) {
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
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
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
        save(() => updateProfile({ name, bio, spokenLanguages: languages, keepsShabbat, accountType, businessName }));
      }}
    >
      <AvatarField name={data.name} image={data.image} />

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

export function ContactEmailForm({ loginEmail, contactEmail }: { loginEmail: string | null; contactEmail: string | null }) {
  const t = useTranslations("account.settings.email");
  const id = useId();
  const { pending, save, fieldErrors } = useSave();
  const [value, setValue] = useState(contactEmail ?? "");
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save(() => updateContactEmail({ contactEmail: value }));
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
          aria-invalid={!!fieldErrors.contactEmail}
          aria-describedby={fieldErrors.contactEmail ? `${id}-error` : `${id}-hint`}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 rounded-xl bg-background text-start"
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {loginEmail ? t("hintWithLogin") : t("hintPhone")}
        </p>
        <FieldError id={`${id}-error`} errors={fieldErrors.contactEmail} />
      </div>
      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
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
  const display = useCurrency().currency;
  const [currency, setCurrency] = useState<string>(data.currency ?? display ?? enabledCurrencies[0]);
  const [hebrewDates, setHebrewDates] = useState(data.showHebrewDates);

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save(
          () => updatePreferences({ locale, currency, showHebrewDates: hebrewDates }),
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

export function NotificationsForm({ prefs, emailAvailable }: { prefs: NotificationPrefs; emailAvailable: boolean }) {
  const t = useTranslations("account.settings.notifications");
  const id = useId();
  const { pending, save } = useSave();
  const [value, setValue] = useState(prefs);
  const emailRows = (["listing", "tickets", ...(siteConfig.features.chat ? (["messages"] as const) : []), "marketing"] as const).map(
    (key) => key as keyof NotificationPrefs["email"],
  );

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
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm">
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

  const link = async (provider: ConnectedProvider) => {
    setBusy(provider);
    const result = await authClient.linkSocial({ provider, callbackURL: `/${locale}/account/settings#connected` });
    if (result?.error) {
      setBusy(null);
      toast.error(errorText("server_error"));
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
                    const result = await unlinkSocialAccount(provider);
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
                const result = await deleteMyAccount({ confirmation: typed });
                if (!result.ok) {
                  toast.error(errorText(result.error));
                  return;
                }
                // A full page load on purpose: the session is gone and every cached page must forget the user.
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
    </div>
  );
}
