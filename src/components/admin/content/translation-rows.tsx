"use client";

import { RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { resetTranslationOverride, saveTranslationOverride } from "@/lib/admin/content/actions/translations";
import type { MessageRow } from "@/lib/admin/content/translations";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { useContentAction } from "./use-content-action";

function Row({ row, namespace, locale }: { row: MessageRow; namespace: string; locale: AppLocale }) {
  const t = useTranslations("adminContent.translations");
  const { run, pending } = useContentAction();
  const [value, setValue] = useState(row.override ?? "");
  const dirty = value.trim() !== (row.override ?? "") && value.trim() !== "";
  const id = `tr-${row.key}`;
  const multiline = row.source.length > 80 || row.source.includes("\n");

  return (
    <li className={cn("flex flex-col gap-2 p-3 sm:px-4", row.override !== null && "bg-primary/[0.03]")}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 break-all font-mono text-xs text-muted-foreground" dir="ltr">
          {row.key}
        </code>
        {row.override !== null ? <Pill tone="primary">{t("overridden")}</Pill> : null}
        {row.current === "" ? <Pill tone="warning">{t("missingInFile")}</Pill> : null}
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg bg-muted/60 p-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase">{t("english")}</p>
          <p className="text-sm break-words whitespace-pre-wrap" lang="en" dir="ltr">
            {row.source}
          </p>
        </div>
        <div className="min-w-0 rounded-lg bg-muted/60 p-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase">{t("fileValue")}</p>
          <p className="text-sm break-words whitespace-pre-wrap" lang={locale} dir={dirFor(locale)}>
            {row.current || <span className="text-muted-foreground italic">{t("emptyValue")}</span>}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground uppercase">
            {t("override")}
          </label>
          <Textarea
            id={id}
            lang={locale}
            dir={dirFor(locale)}
            rows={multiline ? 3 : 1}
            className="min-h-9 text-sm"
            value={value}
            maxLength={5000}
            placeholder={t("overridePlaceholder")}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-1.5">
            {row.override !== null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => resetTranslationOverride({ locale, namespace, key: row.key }), {
                    success: t("resetDone"),
                    onSuccess: () => setValue(""),
                  })
                }
              >
                <RotateCcw aria-hidden />
                {t("reset")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => run(() => saveTranslationOverride({ locale, namespace, key: row.key, value }), { success: t("savedOne") })}
            >
              <Save aria-hidden />
              {t("save")}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TranslationRows({ rows, namespace, locale }: { rows: MessageRow[]; namespace: string; locale: AppLocale }) {
  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs">
      {rows.map((row) => (
        <Row key={`${namespace}:${locale}:${row.key}:${row.override ?? ""}`} row={row} namespace={namespace} locale={locale} />
      ))}
    </ul>
  );
}
