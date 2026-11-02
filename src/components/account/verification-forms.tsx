"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, FileCheck2Icon, FileUpIcon, LoaderIcon, SendIcon, XIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { submitBusinessVerification, submitIdVerification, submitOwnershipVerification } from "@/lib/account/actions";
import { acceptsPdf, isValidCadastralCode, type DocumentSlot, type UploadedFile } from "@/lib/account/verification";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionError } from "./use-action-error";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";

function sizeLabel(bytes: number, locale: string): string {
  if (bytes >= 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 })} MB`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)), locale)} KB`;
}

/** One document slot: uploads to POST /api/uploads/private (purpose "verification"). */
function DocumentUpload({
  slot,
  value,
  onChange,
  optional = false,
}: {
  slot: DocumentSlot;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  optional?: boolean;
}) {
  const t = useTranslations("account.verification.upload");
  const locale = useLocale();
  const errorText = useActionError();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdf = acceptsPdf(slot);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("purpose", "verification");
      form.set("file", file);
      const response = await fetch("/api/uploads/private", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as Partial<UploadedFile> & { error?: string };
      if (!response.ok || !body.key || !body.mime || !body.bytes) {
        setError(errorText(body.error ?? "server_error"));
        return;
      }
      onChange({ key: body.key, mime: body.mime as UploadedFile["mime"], bytes: body.bytes, name: body.name ?? file.name });
    } catch {
      setError(errorText("network"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t(`slots.${slot}.label`)}
        {optional ? <span className="ms-1 font-normal text-muted-foreground">({t("optional")})</span> : null}
      </label>
      <p className="text-xs text-muted-foreground">{t(`slots.${slot}.hint`)}</p>
      <input
        ref={input}
        id={inputId}
        type="file"
        className="sr-only"
        accept={pdf ? `${IMAGE_ACCEPT},application/pdf` : IMAGE_ACCEPT}
        capture={slot === "SELFIE" ? "user" : undefined}
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border bg-primary-tint/60 px-3 py-2">
          <FileCheck2Icon className="size-5 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" dir="auto">
              {value.name || t("uploaded")}
            </p>
            <p className="text-xs text-muted-foreground">{sizeLabel(value.bytes, locale)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-lg" aria-label={t("remove")} onClick={() => onChange(null)}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-12 justify-start rounded-xl border-dashed px-4"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <LoaderIcon className="animate-spin" aria-hidden="true" />
          ) : slot === "SELFIE" ? (
            <CameraIcon aria-hidden="true" />
          ) : (
            <FileUpIcon aria-hidden="true" />
          )}
          {busy ? t("uploading") : pdf ? t("choose") : t("choosePhoto")}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("account.verification");
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("note")} <span className="font-normal text-muted-foreground">({t("upload.optional")})</span>
      </label>
      <Textarea id={id} dir="auto" rows={2} maxLength={1000} value={value} onChange={(e) => onChange(e.target.value)} className="bg-background" />
    </div>
  );
}

function useSubmit() {
  const t = useTranslations("account.verification");
  const router = useRouter();
  const errorText = useActionError();
  const [pending, startTransition] = useTransition();
  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      toast.success(t("submitted"));
      onDone?.();
      router.refresh();
    });
  return { pending, submit };
}

function SubmitButton({ pending, disabled }: { pending: boolean; disabled: boolean }) {
  const t = useTranslations("account.verification");
  return (
    <Button type="submit" className="h-11 rounded-xl px-5" disabled={pending || disabled}>
      {pending ? <LoaderIcon className="animate-spin" aria-hidden="true" /> : <SendIcon className="rtl:-scale-x-100" aria-hidden="true" />}
      {pending ? t("sending") : t("send")}
    </Button>
  );
}

export function IdVerificationForm() {
  const [front, setFront] = useState<UploadedFile | null>(null);
  const [back, setBack] = useState<UploadedFile | null>(null);
  const [selfie, setSelfie] = useState<UploadedFile | null>(null);
  const [note, setNote] = useState("");
  const { pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!front || !selfie) return;
        submit(() => submitIdVerification({ front, back, selfie, note }));
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <DocumentUpload slot="ID_FRONT" value={front} onChange={setFront} />
        <DocumentUpload slot="ID_BACK" value={back} onChange={setBack} optional />
        <DocumentUpload slot="SELFIE" value={selfie} onChange={setSelfie} />
      </div>
      <NoteField value={note} onChange={setNote} />
      <div>
        <SubmitButton pending={pending} disabled={!front || !selfie} />
      </div>
    </form>
  );
}

export function OwnershipForm({ listingId, cadastralCode }: { listingId: string; cadastralCode: string | null }) {
  const t = useTranslations("account.verification.owner");
  const codeId = useId();
  const [extract, setExtract] = useState<UploadedFile | null>(null);
  const [code, setCode] = useState(cadastralCode ?? "");
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState("");
  const { pending, submit } = useSubmit();
  const codeOk = isValidCadastralCode(code);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!extract || !codeOk) return;
        submit(() => submitOwnershipVerification({ listingId, extract, cadastralCode: code, note }));
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <DocumentUpload slot="NAPR_EXTRACT" value={extract} onChange={setExtract} />
        <div className="grid content-start gap-1.5">
          <label htmlFor={codeId} className="text-sm font-medium">
            {t("cadastral")}
          </label>
          <p className="text-xs text-muted-foreground">{t("cadastralHint")}</p>
          <Input
            id={codeId}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            placeholder="01.10.14.003.012"
            value={code}
            maxLength={60}
            aria-invalid={touched && !codeOk}
            aria-describedby={touched && !codeOk ? `${codeId}-error` : undefined}
            onBlur={() => setTouched(true)}
            onChange={(e) => setCode(e.target.value)}
            className={cn("h-12 rounded-xl bg-background font-mono text-start")}
          />
          {touched && !codeOk ? (
            <p id={`${codeId}-error`} className="text-sm text-destructive">
              {t("cadastralInvalid")}
            </p>
          ) : null}
        </div>
      </div>
      <NoteField value={note} onChange={setNote} />
      <div>
        <SubmitButton pending={pending} disabled={!extract} />
      </div>
    </form>
  );
}

export function BusinessForm() {
  const [registration, setRegistration] = useState<UploadedFile | null>(null);
  const [note, setNote] = useState("");
  const { pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!registration) return;
        submit(() => submitBusinessVerification({ registration, note }));
      }}
    >
      <div className="max-w-md">
        <DocumentUpload slot="BUSINESS_REGISTRATION" value={registration} onChange={setRegistration} />
      </div>
      <NoteField value={note} onChange={setNote} />
      <div>
        <SubmitButton pending={pending} disabled={!registration} />
      </div>
    </form>
  );
}
