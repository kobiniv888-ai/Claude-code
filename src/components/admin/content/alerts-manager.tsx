"use client";

import { BadgeAlert, Megaphone, Pencil, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickLocalized } from "@/i18n/locale";
import { setScamBannerEnabled } from "@/lib/admin/content/actions/banned-words";
import { deleteScamAlert, saveScamAlert } from "@/lib/admin/content/actions/editorial";
import { emptyLocalized, toLocalizedForm, type LocalizedForm } from "@/lib/admin/content/localized";
import { ALERT_SEVERITIES, LIMITS, alertSchema } from "@/lib/admin/content/schemas";
import { formatDate } from "@/lib/format";
import { ConfirmButton } from "./bits";
import { Pill, type PillTone } from "./pill";
import { errorAt, FormField, LanguageTabs, LocaleText, SwitchRow, useFieldErrors } from "./form";
import { useContentAction } from "./use-content-action";

type Severity = (typeof ALERT_SEVERITIES)[number];
export type AlertData = {
  id: string;
  title: unknown;
  body: unknown;
  severity: Severity;
  active: boolean;
  showAsBanner: boolean;
  startsAt: string;
  endsAt: string | null;
  isDemo: boolean;
  /** Worked out on the server at request time. */
  state: "off" | "scheduled" | "ended" | "live";
};

const STATE_TONE: Record<AlertData["state"], PillTone> = { off: "muted", scheduled: "primary", ended: "muted", live: "success" };

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → "YYYY-MM-DDTHH:mm" in the browser's time zone (for <input type="datetime-local">). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (browser time) → ISO; "" → "". */
function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

const SEVERITY_TONE: Record<Severity, PillTone> = { INFO: "primary", WARNING: "warning", CRITICAL: "danger" };

type AlertValues = {
  title: LocalizedForm;
  body: LocalizedForm;
  severity: Severity;
  active: boolean;
  showAsBanner: boolean;
  startsAt: string;
  endsAt: string;
};

function AlertDialog({ item, onClose }: { item: AlertData | null; onClose: () => void }) {
  const t = useTranslations("adminContent.alerts");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<AlertValues>(() =>
    item
      ? {
          title: toLocalizedForm(item.title),
          body: toLocalizedForm(item.body),
          severity: item.severity,
          active: item.active,
          showAsBanner: item.showAsBanner,
          startsAt: toLocalInput(item.startsAt),
          endsAt: toLocalInput(item.endsAt),
        }
      : {
          title: emptyLocalized(),
          body: emptyLocalized(),
          severity: "WARNING",
          active: true,
          showAsBanner: false,
          startsAt: toLocalInput(new Date().toISOString()),
          endsAt: "",
        },
  );
  const payload = () => ({ ...values, startsAt: fromLocalInput(values.startsAt), endsAt: values.endsAt ? fromLocalInput(values.endsAt) : null });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(alertSchema, payload())) {
              toast.error(tForm("checkFields"));
              return;
            }
            run(() => saveScamAlert({ id: item?.id ?? null, values: payload() }), {
              success: item ? t("saved") : t("created"),
              onError: fromServer,
              onSuccess: onClose,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t("severity")}>
              {(props) => (
                <Select value={values.severity} onValueChange={(v) => setValues((s) => ({ ...s, severity: v as Severity }))}>
                  <SelectTrigger {...props} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`severities.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label={t("startsAt")} error={errorAt(errors, "startsAt")}>
              {(props) => (
                <Input {...props} type="datetime-local" dir="ltr" value={values.startsAt} onChange={(e) => setValues((s) => ({ ...s, startsAt: e.target.value }))} />
              )}
            </FormField>
            <FormField label={t("endsAt")} hint={t("endsAtHint")} error={errorAt(errors, "endsAt")}>
              {(props) => (
                <Input {...props} type="datetime-local" dir="ltr" value={values.endsAt} onChange={(e) => setValues((s) => ({ ...s, endsAt: e.target.value }))} />
              )}
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SwitchRow label={t("active")} description={t("activeHint")} checked={values.active} onCheckedChange={(active) => setValues((s) => ({ ...s, active }))} />
            <SwitchRow
              label={t("showAsBanner")}
              description={t("showAsBannerHint")}
              checked={values.showAsBanner}
              onCheckedChange={(showAsBanner) => setValues((s) => ({ ...s, showAsBanner }))}
            />
          </div>
          <LanguageTabs
            filled={(l) => Boolean(values.title[l].trim() && values.body[l].trim())}
            invalid={(l) => Boolean(errors[`title.${l}`] || errors[`body.${l}`])}
          >
            {(locale) => (
              <>
                <LocaleText
                  locale={locale}
                  label={t("titleField")}
                  required={locale === "he" || locale === "en"}
                  value={values.title[locale]}
                  maxLength={LIMITS.alertTitle}
                  error={errorAt(errors, `title.${locale}`)}
                  onChange={(v) => setValues((s) => ({ ...s, title: { ...s.title, [locale]: v } }))}
                />
                <LocaleText
                  locale={locale}
                  label={t("body")}
                  required={locale === "he" || locale === "en"}
                  multiline
                  rows={4}
                  value={values.body[locale]}
                  maxLength={LIMITS.alertBody}
                  error={errorAt(errors, `body.${locale}`)}
                  onChange={(v) => setValues((s) => ({ ...s, body: { ...s.body, [locale]: v } }))}
                />
              </>
            )}
          </LanguageTabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              <Save aria-hidden />
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AlertsManager({ items, bannerEnabled }: { items: AlertData[]; bannerEnabled: boolean }) {
  const t = useTranslations("adminContent.alerts");
  const locale = useLocale();
  const { run, pending } = useContentAction();
  const [dialog, setDialog] = useState<{ item: AlertData | null; key: number } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        className="bg-card shadow-xs"
        label={
          <span className="inline-flex items-center gap-1.5">
            <Megaphone aria-hidden className="size-4 text-muted-foreground" />
            {t("masterSwitch")}
          </span>
        }
        description={t("masterSwitchHint")}
        checked={bannerEnabled}
        disabled={pending}
        onCheckedChange={(enabled) => run(() => setScamBannerEnabled({ enabled }), { success: enabled ? t("bannerOn") : t("bannerOff") })}
      />

      <div className="flex justify-end">
        <Button type="button" onClick={() => setDialog({ item: null, key: Date.now() })}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <BadgeAlert aria-hidden className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {items.map((a) => {
            const title = pickLocalized(a.title, locale);
            return (
              <li key={a.id} className="flex flex-wrap items-start gap-3 p-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{pickLocalized(a.body, locale)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Pill tone={SEVERITY_TONE[a.severity]}>{t(`severities.${a.severity}`)}</Pill>
                    <Pill tone={STATE_TONE[a.state]}>{t(`state.${a.state}`)}</Pill>
                    {a.showAsBanner ? (
                      <Pill tone="primary" icon={Megaphone}>
                        {t("bannerBadge")}
                      </Pill>
                    ) : null}
                    {a.isDemo ? <Pill tone="demo">{t("demoBadge")}</Pill> : null}
                    <span className="text-xs text-muted-foreground">
                      {a.endsAt
                        ? t("period", { from: formatDate(a.startsAt, locale), to: formatDate(a.endsAt, locale) })
                        : t("from", { from: formatDate(a.startsAt, locale) })}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ item: a, key: Date.now() })}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Button>
                  <ConfirmButton
                    label={t("delete")}
                    iconOnly
                    size="icon-sm"
                    variant="ghost"
                    title={t("deleteTitle")}
                    description={title}
                    onConfirm={() => run(() => deleteScamAlert({ id: a.id }), { success: t("deleted") })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog ? <AlertDialog key={dialog.key} item={dialog.item} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
