"use client";

import {
  ArrowDown,
  ArrowUp,
  CandlestickChart,
  Coins,
  FlaskConical,
  Moon,
  Phone,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CurrencyCode } from "@/config/site";
import { deleteAllDemoData, saveEmergencyContacts, saveSettings } from "@/lib/admin/content/actions/settings";
import { emptyLocalized, toLocalizedForm, type LocalizedForm } from "@/lib/admin/content/localized";
import { moveItem } from "@/lib/admin/content/order";
import { DELETE_DEMO_CONFIRMATION, LIMITS, emergencyContactsInputSchema } from "@/lib/admin/content/schemas";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { errorAt, FormField, LocalizedInputs, parseNumber, SwitchRow, useFieldErrors } from "./form";
import { useContentAction } from "./use-content-action";

export type SettingsData = {
  listingExpiryDays: number;
  shabbatModeEnabled: boolean;
  defaultCurrency: CurrencyCode;
  reviewRiskThreshold: number;
  reportsToAutoHide: number;
  scamBannerEnabled: boolean;
  demoDataVisible: boolean;
  paidFeaturePrices: Record<string, number>;
  /** The support reply promise per language (SECURITY_REPORT 19.b); empty = the default text. */
  supportReplyPromise: Partial<Record<string, string>>;
};

export type EmergencyContactForm = { label: LocalizedForm; phone: string; url: string };

type ShabbatNow = { settingOn: boolean; shabbatNow: boolean; kind: "shabbat" | "holiday" | null; endsAt: string | null };

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  error?: string;
}) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(props) => (
        <div className="flex items-center gap-2">
          <Input {...props} type="number" dir="ltr" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(e.target.value)} className="w-32" />
          {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
        </div>
      )}
    </FormField>
  );
}

function SaveRow({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end">{children}</div>;
}

export function SettingsForm({
  settings,
  currencies,
  paidFeatureKeys,
  shabbat,
  demoCounts,
  demoLocked = false,
  emergency,
}: {
  settings: SettingsData;
  currencies: CurrencyCode[];
  paidFeatureKeys: string[];
  shabbat: ShabbatNow;
  demoCounts: { listings: number; users: number; places: number; alerts: number };
  /** The real site (SITE_ENV=production): demo data is always hidden, the switch does nothing. */
  demoLocked?: boolean;
  emergency: EmergencyContactForm[];
}) {
  const t = useTranslations("adminContent.settings");
  const tForm = useTranslations("adminContent.form");
  const locale = useLocale();
  const { run, pending } = useContentAction();
  const listingErrors = useFieldErrors();
  const safetyErrors = useFieldErrors();
  const priceErrors = useFieldErrors();
  const emergencyErrors = useFieldErrors();
  const supportErrors = useFieldErrors();
  const [replyPromise, setReplyPromise] = useState<LocalizedForm>(() => toLocalizedForm(settings.supportReplyPromise));

  const [expiry, setExpiry] = useState(String(settings.listingExpiryDays));
  const [risk, setRisk] = useState(String(settings.reviewRiskThreshold));
  const [reports, setReports] = useState(String(settings.reportsToAutoHide));
  const [currency, setCurrency] = useState<CurrencyCode>(settings.defaultCurrency);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(paidFeatureKeys.map((k) => [k, String(settings.paidFeaturePrices[k] ?? 0)])),
  );
  const [contacts, setContacts] = useState<EmergencyContactForm[]>(emergency);
  const [confirmText, setConfirmText] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);

  const save = (patch: Record<string, unknown>, errors: ReturnType<typeof useFieldErrors>) =>
    run(() => saveSettings(patch), { success: t("saved"), onError: errors.fromServer });

  const totalDemo = demoCounts.listings + demoCounts.users + demoCounts.places + demoCounts.alerts;
  const shabbatLine = shabbat.shabbatNow
    ? t(shabbat.kind === "holiday" ? "shabbat.nowHoliday" : "shabbat.nowShabbat", {
        time: shabbat.endsAt ? `${formatDate(shabbat.endsAt, locale, { weekday: "long", timeZone: "Asia/Jerusalem" })} ${formatTime(shabbat.endsAt, locale, "Asia/Jerusalem")}` : "—",
      })
    : t("shabbat.notNow");

  return (
    <div className="flex flex-col gap-5">
      <AdminSection title={t("listings.title")} description={t("listings.description")}>
        <NumberField
          label={t("listings.expiryDays")}
          hint={t("listings.expiryHint")}
          value={expiry}
          onChange={setExpiry}
          min={7}
          max={365}
          suffix={t("days")}
          error={errorAt(listingErrors.errors, "listingExpiryDays")}
        />
        <SaveRow>
          <Button type="button" disabled={pending} onClick={() => save({ listingExpiryDays: parseNumber(expiry) }, listingErrors)}>
            <Save aria-hidden />
            {t("save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection title={t("support.title")} description={t("support.description")}>
        <LocalizedInputs
          label={t("support.replyPromise")}
          value={replyPromise}
          required={[]}
          maxLength={300}
          errors={supportErrors.errors}
          path="supportReplyPromise"
          onChange={setReplyPromise}
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("support.replyPromiseHint")}</p>
        <SaveRow>
          <Button type="button" disabled={pending} onClick={() => save({ supportReplyPromise: replyPromise }, supportErrors)}>
            <Save aria-hidden />
            {t("save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection title={t("safety.title")} description={t("safety.description")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t("safety.riskThreshold")}
            hint={t("safety.riskThresholdHint")}
            value={risk}
            onChange={setRisk}
            min={0}
            max={100}
            error={errorAt(safetyErrors.errors, "reviewRiskThreshold")}
          />
          <NumberField
            label={t("safety.reportsToHide")}
            hint={t("safety.reportsToHideHint")}
            value={reports}
            onChange={setReports}
            min={1}
            max={50}
            error={errorAt(safetyErrors.errors, "reportsToAutoHide")}
          />
        </div>
        <SwitchRow
          className="mt-4"
          label={t("safety.scamBanner")}
          description={t("safety.scamBannerHint")}
          checked={settings.scamBannerEnabled}
          disabled={pending}
          onCheckedChange={(v) => save({ scamBannerEnabled: v }, safetyErrors)}
        />
        <SaveRow>
          <Button
            type="button"
            disabled={pending}
            onClick={() => save({ reviewRiskThreshold: parseNumber(risk), reportsToAutoHide: parseNumber(reports) }, safetyErrors)}
          >
            <Save aria-hidden />
            {t("save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <Moon aria-hidden className="size-4" />
            {t("shabbat.title")}
          </span>
        }
        description={t("shabbat.description")}
      >
        <SwitchRow
          label={t("shabbat.switch")}
          description={t("shabbat.switchHint")}
          checked={settings.shabbatModeEnabled}
          disabled={pending}
          onCheckedChange={(v) => save({ shabbatModeEnabled: v }, safetyErrors)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          {settings.shabbatModeEnabled && shabbat.shabbatNow ? (
            <Pill tone="warning">{t("shabbat.pausedNow")}</Pill>
          ) : settings.shabbatModeEnabled ? (
            <Pill tone="success">{t("shabbat.onWaiting")}</Pill>
          ) : (
            <Pill tone="muted">{t("shabbat.off")}</Pill>
          )}
          <span className="text-muted-foreground">{shabbatLine}</span>
        </div>
      </AdminSection>

      <AdminSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <Coins aria-hidden className="size-4" />
            {t("display.title")}
          </span>
        }
        description={t("display.description")}
      >
        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label htmlFor="default-currency">{t("display.currency")}</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
            <SelectTrigger id="default-currency" className="w-full" dir="ltr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c} dir="ltr">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("display.currencyHint")}</p>
        </div>
        <SaveRow>
          <Button type="button" disabled={pending || currency === settings.defaultCurrency} onClick={() => save({ defaultCurrency: currency }, safetyErrors)}>
            <Save aria-hidden />
            {t("save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <CandlestickChart aria-hidden className="size-4" />
            {t("prices.title")}
          </span>
        }
        description={t("prices.description")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {paidFeatureKeys.map((key) => (
            <NumberField
              key={key}
              label={t(`prices.features.${key}`)}
              value={prices[key]}
              onChange={(v) => setPrices((p) => ({ ...p, [key]: v }))}
              min={0}
              max={10000}
              step={0.5}
              suffix="USD"
              error={errorAt(priceErrors.errors, `paidFeaturePrices.${key}`)}
            />
          ))}
        </div>
        <SaveRow>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              save({ paidFeaturePrices: Object.fromEntries(paidFeatureKeys.map((k) => [k, parseNumber(prices[k])])) }, priceErrors)
            }
          >
            <Save aria-hidden />
            {t("save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <Phone aria-hidden className="size-4" />
            {t("emergency.title")}
          </span>
        }
        description={t("emergency.description")}
      >
        <div className="flex flex-col gap-3">
          {contacts.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("emergency.empty")}</p> : null}
          {contacts.map((c, index) => (
            <fieldset key={index} className="flex flex-col gap-3 rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-semibold">{t("emergency.entry", { number: index + 1 })}</legend>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={t("emergency.moveUp", { number: index + 1 })}
                    onClick={() => setContacts((list) => moveItem(list, index, -1))}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === contacts.length - 1}
                    aria-label={t("emergency.moveDown", { number: index + 1 })}
                    onClick={() => setContacts((list) => moveItem(list, index, 1))}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("emergency.remove", { number: index + 1 })}
                    onClick={() => setContacts((list) => list.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
              <LocalizedInputs
                label={t("emergency.label")}
                value={c.label}
                required={["en"]}
                maxLength={LIMITS.emergencyLabel}
                errors={emergencyErrors.errors}
                path={`contacts.${index}.label`}
                onChange={(label) => setContacts((list) => list.map((x, i) => (i === index ? { ...x, label } : x)))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("emergency.phone")} hint={t("emergency.phoneHint")} error={errorAt(emergencyErrors.errors, `contacts.${index}.phone`)}>
                  {(props) => (
                    <Input
                      {...props}
                      dir="ltr"
                      type="tel"
                      value={c.phone}
                      maxLength={LIMITS.emergencyPhone}
                      onChange={(e) => setContacts((list) => list.map((x, i) => (i === index ? { ...x, phone: e.target.value } : x)))}
                    />
                  )}
                </FormField>
                <FormField label={t("emergency.url")} error={errorAt(emergencyErrors.errors, `contacts.${index}.url`)}>
                  {(props) => (
                    <Input
                      {...props}
                      dir="ltr"
                      type="url"
                      placeholder="https://"
                      value={c.url}
                      maxLength={LIMITS.url}
                      onChange={(e) => setContacts((list) => list.map((x, i) => (i === index ? { ...x, url: e.target.value } : x)))}
                    />
                  )}
                </FormField>
              </div>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={contacts.length >= 50}
            onClick={() => setContacts((list) => [...list, { label: emptyLocalized(), phone: "", url: "" }])}
          >
            <Plus aria-hidden />
            {t("emergency.add")}
          </Button>
        </div>
        <SaveRow>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!emergencyErrors.validate(emergencyContactsInputSchema, { contacts })) {
                toast.error(tForm("checkFields"));
                return;
              }
              run(() => saveEmergencyContacts({ contacts }), { success: t("emergency.saved"), onError: emergencyErrors.fromServer });
            }}
          >
            <Save aria-hidden />
            {t("emergency.save")}
          </Button>
        </SaveRow>
      </AdminSection>

      <AdminSection
        title={
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical aria-hidden className="size-4" />
            {t("demo.title")}
          </span>
        }
        description={t("demo.description")}
      >
        <SwitchRow
          label={t("demo.visible")}
          description={demoLocked ? t("demo.lockedOnRealSite") : t("demo.visibleHint")}
          checked={settings.demoDataVisible && !demoLocked}
          disabled={pending || demoLocked}
          onCheckedChange={(v) => save({ demoDataVisible: v }, safetyErrors)}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("demo.counts", {
            listings: formatNumber(demoCounts.listings, locale),
            users: formatNumber(demoCounts.users, locale),
            places: formatNumber(demoCounts.places, locale),
            alerts: formatNumber(demoCounts.alerts, locale),
          })}
        </p>

        <div className={cn("mt-4 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4")}>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <TriangleAlert aria-hidden className="size-4" />
            {t("demo.dangerTitle")}
          </h3>
          <p className="mt-1 text-sm">{t("demo.dangerDescription")}</p>
          <AlertDialog
            open={demoOpen}
            onOpenChange={(open) => {
              if (pending) return;
              setDemoOpen(open);
              if (!open) setConfirmText("");
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" className="mt-3" disabled={totalDemo === 0}>
                <ShieldAlert aria-hidden />
                {t("demo.deleteButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("demo.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("demo.confirmDescription", { phrase: DELETE_DEMO_CONFIRMATION })}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="demo-confirm">{t("demo.typeToConfirm", { phrase: DELETE_DEMO_CONFIRMATION })}</Label>
                <Input id="demo-confirm" dir="ltr" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || confirmText.trim() !== DELETE_DEMO_CONFIRMATION}
                  onClick={() =>
                    run(() => deleteAllDemoData({ confirmation: confirmText }), {
                      success: (d) =>
                        t("demo.deleted", { listings: d.listings, users: d.users, places: d.places, alerts: d.alerts }),
                      onSuccess: () => {
                        setDemoOpen(false);
                        setConfirmText("");
                      },
                    })
                  }
                >
                  <Trash2 aria-hidden />
                  {t("demo.confirmButton")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AdminSection>
    </div>
  );
}
