"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, DownloadIcon, LifeBuoyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recoveryCodesFile } from "@/lib/auth/recovery-code-format";

/**
 * The 10 recovery codes, shown ONCE (SECURITY_REPORT 3.7.c): copy them all, or download a text
 * file, and keep them somewhere safe (not on the same phone as the authenticator app).
 */
export function RecoveryCodesView({ codes, onDone, doneLabel }: { codes: string[]; onDone?: () => void; doneLabel?: string }) {
  const t = useTranslations("security.recovery");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const lines = { title: t("fileTitle"), intro: t("fileIntro"), footer: t("fileFooter") };

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setSaved(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([recoveryCodesFile(codes, lines)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bayit-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 rounded-xl bg-surface-muted px-3.5 py-3 text-sm">
        <LifeBuoyIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="grid gap-1">
          <p className="font-semibold">{t("title")}</p>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
      </div>
      <ol dir="ltr" aria-label={t("listLabel")} className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-3 font-mono text-sm tracking-wider">
        {codes.map((code) => (
          <li key={code} className="rounded-md bg-muted px-2 py-1.5 text-center select-all">
            {code}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t("once")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void copy()}>
          {copied ? <CheckIcon className="text-success" aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={download}>
          <DownloadIcon aria-hidden />
          {t("download")}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
      {onDone ? (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>{t("savedCheck")}</span>
        </label>
      ) : null}
      {onDone ? (
        <Button type="button" size="lg" className="h-12 w-full rounded-xl text-base" disabled={!saved} onClick={onDone}>
          {doneLabel ?? t("done")}
        </Button>
      ) : null}
    </div>
  );
}
