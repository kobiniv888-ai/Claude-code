"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  CircleCheckIcon,
  CircleIcon,
  FileCheckIcon,
  FootprintsIcon,
  HotelIcon,
  LoaderCircleIcon,
  MoonStarIcon,
  UploadIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { BayitBadge } from "@/components/ds/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BIG_FAMILY_MIN_GUESTS,
  computeShabbatFriendly,
  HOTEL_JEWISH_FEATURES,
  JEWISH_FEATURES,
  KITCHEN_KOSHER,
  SHABBAT_FEATURES,
} from "@/lib/listing/fields";
import { cn } from "@/lib/utils";
import { applies } from "@/lib/wizard/steps";
import { CheckCards, ChoiceCards, Field, FieldError, Section } from "../fields";
import { HOTEL_JEWISH_ICONS, JEWISH_ICONS, SHABBAT_ICONS } from "../icons";
import { useOptionLabel } from "../labels";
import type { StepProps } from "../step-props";

const HOST_FEATURES = new Set(["host_keeps_shabbat", "host_speaks_hebrew"]);

/** Live preview of the "Shabbat-friendly" badge with what is still missing. */
function ShabbatBadgePreview({ features }: { features: string[] }) {
  const t = useTranslations("wizard.jewish");
  const on = computeShabbatFriendly(features);
  const rules = [
    { key: "ruleKey", met: features.includes("mechanical_key") },
    { key: "ruleSensors", met: features.includes("no_motion_sensors") },
    { key: "ruleHeat", met: features.includes("hot_plate") || features.includes("hot_water_urn") },
  ];
  return (
    <div
      className={cn(
        "grid gap-3 rounded-card border p-4 transition-colors",
        on ? "border-verified/30 bg-verified-soft dark:bg-verified/15" : "border-dashed border-border bg-muted/40",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-small font-semibold">{t("badgePreview")}</span>
        {/* The real badge guests will see on the card (ds/badges), greyed out until earned. */}
        <BayitBadge kind="shabbatFriendly" size="md" variant={on ? "solid" : "soft"} className={on ? undefined : "grayscale"} />
      </div>
      <p className="text-sm text-pretty">{on ? t("badgeOn") : t("badgeOff")}</p>
      <ul className="grid gap-1.5 text-sm">
        {rules.map((rule) => (
          <li key={rule.key} className="flex items-center gap-2">
            {rule.met ? (
              <CircleCheckIcon className="size-4 text-verified" aria-hidden />
            ) : (
              <CircleIcon className="size-4 text-muted-foreground" aria-hidden />
            )}
            <span className={rule.met ? "" : "text-muted-foreground"}>{t(rule.key)}</span>
            <span className="sr-only">{rule.met ? t("ruleMet") : t("ruleMissing")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kosher certificate photo → POST /api/uploads/private (purpose "verification"), key in the listing. */
function KosherCertificateUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const t = useTranslations("wizard.jewish");
  const tErrors = useTranslations("wizard.uploadErrors");
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = async (file: File) => {
    setState("uploading");
    setError(null);
    try {
      const form = new FormData();
      form.set("purpose", "verification");
      form.set("file", file);
      const response = await fetch("/api/uploads/private", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { key?: string; name?: string; error?: string };
      if (!response.ok || !data.key) {
        const code = data.error ?? "server_error";
        setError(tErrors.has(code) ? tErrors(code) : tErrors("server_error"));
        setState("error");
        return;
      }
      setFileName(data.name ?? file.name);
      onChange(data.key);
      setState("idle");
    } catch {
      setError(tErrors("network"));
      setState("error");
    }
  };

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{t("certPhoto")}</span>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3">
        {value ? (
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-verified">
            <FileCheckIcon className="size-5 shrink-0" aria-hidden />
            <span className="truncate" dir="auto">
              {fileName ?? t("certUploaded")}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("certNone")}</span>
        )}
        <div className="ms-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
            disabled={state === "uploading"}
          >
            {state === "uploading" ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <UploadIcon aria-hidden />}
            {value ? t("certReplace") : t("certUpload")}
          </Button>
          {value && (
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              {t("certRemove")}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {error && <FieldError id="cert-error">{error}</FieldError>}
      <p className="text-xs text-muted-foreground">{t("certHelp")}</p>
    </div>
  );
}

/** Step 6 — kosher kitchen, Shabbat checklist, other Jewish-friendly details, hotels' kosher certificate. */
export function JewishStep({ values, set, errors, kind }: StepProps) {
  const t = useTranslations("wizard.jewish");
  const label = useOptionLabel();
  const showHost = applies("hostFeatures", kind);
  const jewishOptions = JEWISH_FEATURES.filter((f) => showHost || !HOST_FEATURES.has(f));
  const bigFamily = (values.maxGuests ?? 0) >= BIG_FAMILY_MIN_GUESTS;

  return (
    <div className="grid gap-6">
      <Section title={t("kitchenTitle")} icon={UtensilsCrossedIcon}>
        <ChoiceCards
          legend={t("kitchenLegend")}
          legendHidden
          name="kitchenKosher"
          value={values.kitchenKosher}
          onChange={(kitchenKosher) => set({ kitchenKosher })}
          size="md"
          columns="grid-cols-1 md:grid-cols-3"
          options={KITCHEN_KOSHER.map((k) => ({
            value: k,
            title: label("kitchen", k),
            description: t(`kitchenHelp.${k}`),
          }))}
        />
      </Section>

      {applies("shabbatFeatures", kind) && (
        <Section title={t("shabbatTitle")} description={t("shabbatDescription")} icon={MoonStarIcon}>
          <CheckCards
            legend={t("shabbatLegend")}
            values={values.shabbatFeatures}
            onChange={(shabbatFeatures) => set({ shabbatFeatures })}
            layout="tiles"
            columns="grid-cols-2 lg:grid-cols-3"
            options={SHABBAT_FEATURES.map((f) => ({
              value: f,
              label: label("shabbat", f),
              help: t(`shabbatHelp.${f}`),
              icon: SHABBAT_ICONS[f],
            }))}
          />
          <ShabbatBadgePreview features={values.shabbatFeatures} />
        </Section>
      )}

      <Section title={t("moreTitle")} icon={BadgeCheckIcon}>
        <CheckCards
          legend={t("moreLegend")}
          values={values.jewishFeatures}
          onChange={(jewishFeatures) => set({ jewishFeatures })}
          layout="tiles"
          columns="grid-cols-2 lg:grid-cols-3"
          options={jewishOptions.map((f) => ({
            value: f,
            label: label("jewish", f),
            help: t.has(`jewishHelp.${f}`) ? t(`jewishHelp.${f}`) : undefined,
            icon: JEWISH_ICONS[f],
          }))}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="flex items-start gap-2.5 rounded-card bg-navy-soft/60 p-3 text-small">
            <FootprintsIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{t("walkingNote")}</span>
          </p>
          <p className="flex items-start gap-2.5 rounded-card bg-navy-soft/60 p-3 text-small">
            <UsersIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{bigFamily ? t("bigFamilyOn") : t("bigFamilyNote", { count: BIG_FAMILY_MIN_GUESTS })}</span>
          </p>
        </div>
      </Section>

      {applies("hotelJewishFeatures", kind) && (
        <Section title={t("hotelTitle")} description={t("hotelDescription")} icon={HotelIcon}>
          <CheckCards
            legend={t("hotelLegend")}
            values={values.hotelJewishFeatures}
            onChange={(hotelJewishFeatures) => set({ hotelJewishFeatures })}
            layout="tiles"
            columns="grid-cols-2 lg:grid-cols-4"
            options={HOTEL_JEWISH_FEATURES.map((f) => ({
              value: f,
              label: label("hotelJewish", f),
              icon: HOTEL_JEWISH_ICONS[f],
            }))}
          />
          <Field label={t("certName")} description={t("certNameHelp")} error={errors.kosherCertName} optional>
            {(props) => (
              <Input
                {...props}
                dir="auto"
                value={values.kosherCertName}
                maxLength={120}
                onChange={(e) => set({ kosherCertName: e.target.value })}
                className="h-11 text-base"
              />
            )}
          </Field>
          <KosherCertificateUpload
            value={values.kosherCertPhotoKey}
            onChange={(kosherCertPhotoKey) => set({ kosherCertPhotoKey })}
          />
          {errors.kosherCertPhotoKey && <FieldError id="cert-key-error">{errors.kosherCertPhotoKey}</FieldError>}
        </Section>
      )}

      <p className="text-xs text-pretty text-muted-foreground">{t("fairHousing")}</p>
    </div>
  );
}
