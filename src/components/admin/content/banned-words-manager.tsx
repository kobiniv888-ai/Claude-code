"use client";

import { FlaskConical, ListPlus, Pencil, Plus, Save, ShieldBan, TextSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { locales, siteConfig } from "@/config/site";
import {
  addBannedWordsBulk,
  deleteBannedWord,
  saveBannedWord,
  testBannedWords,
  type BannedWordTestHit,
} from "@/lib/admin/content/actions/banned-words";
import {
  BANNED_WORD_ACTIONS,
  BANNED_WORD_CATEGORIES,
  BANNED_WORD_LOCALES,
  LIMITS,
  bannedWordBulkSchema,
  bannedWordSchema,
  parseBulkPhrases,
} from "@/lib/admin/content/schemas";
import { ConfirmButton } from "./bits";
import { Pill } from "./pill";
import { errorAt, FormField, parseNumber, useFieldErrors, type Errors } from "./form";
import { useContentAction } from "./use-content-action";

type WordLocale = (typeof BANNED_WORD_LOCALES)[number];
type WordAction = (typeof BANNED_WORD_ACTIONS)[number];
type WordCategory = (typeof BANNED_WORD_CATEGORIES)[number];
export type BannedWordData = { id: string; phrase: string; locale: string | null; action: WordAction; category: WordCategory; weight: number };

type Shared = { locale: WordLocale; action: WordAction; category: WordCategory; weight: string };

function SharedFields({ values, onChange, errors }: { values: Shared; onChange: (next: Shared) => void; errors: Errors }) {
  const t = useTranslations("adminContent.bannedWords");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={t("language")}>
        {(props) => (
          <Select value={values.locale} onValueChange={(v) => onChange({ ...values, locale: v as WordLocale })}>
            <SelectTrigger {...props} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allLanguages")}</SelectItem>
              {locales.map((l) => (
                <SelectItem key={l} value={l}>
                  {siteConfig.i18n.nativeNames[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={t("category")}>
        {(props) => (
          <Select value={values.category} onValueChange={(v) => onChange({ ...values, category: v as WordCategory })}>
            <SelectTrigger {...props} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANNED_WORD_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`categories.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={t("action")} hint={t(`actionHints.${values.action}`)}>
        {(props) => (
          <Select value={values.action} onValueChange={(v) => onChange({ ...values, action: v as WordAction })}>
            <SelectTrigger {...props} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANNED_WORD_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`actions.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField label={t("weight")} hint={t("weightHint")} error={errorAt(errors, "weight")}>
        {(props) => (
          <Input {...props} type="number" min={0} max={100} dir="ltr" value={values.weight} onChange={(e) => onChange({ ...values, weight: e.target.value })} />
        )}
      </FormField>
    </div>
  );
}

function WordDialog({ item, onClose }: { item: BannedWordData | null; onClose: () => void }) {
  const t = useTranslations("adminContent.bannedWords");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [phrase, setPhrase] = useState(item?.phrase ?? "");
  const [shared, setShared] = useState<Shared>({
    locale: (item?.locale ?? "all") as WordLocale,
    action: item?.action ?? "FLAG",
    category: item?.category ?? "SCAM",
    weight: String(item?.weight ?? 25),
  });
  const payload = () => ({ phrase, locale: shared.locale, action: shared.action, category: shared.category, weight: parseNumber(shared.weight) });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(bannedWordSchema, payload())) {
              toast.error(tForm("checkFields"));
              return;
            }
            run(() => saveBannedWord({ id: item?.id ?? null, values: payload() }), {
              success: item ? t("saved") : t("created"),
              onError: fromServer,
              onSuccess: onClose,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("phraseHelp")}</DialogDescription>
          </DialogHeader>
          <FormField label={t("phrase")} required error={errorAt(errors, "phrase")}>
            {(props) => <Input {...props} dir="auto" value={phrase} maxLength={LIMITS.phrase} onChange={(e) => setPhrase(e.target.value)} />}
          </FormField>
          <SharedFields values={shared} onChange={setShared} errors={errors} />
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

function BulkDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("adminContent.bannedWords");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [lines, setLines] = useState("");
  const [shared, setShared] = useState<Shared>({ locale: "all", action: "FLAG", category: "SCAM", weight: "25" });
  const { phrases, skipped } = parseBulkPhrases(lines);
  const payload = () => ({ lines, locale: shared.locale, action: shared.action, category: shared.category, weight: parseNumber(shared.weight) });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(bannedWordBulkSchema, payload())) {
              toast.error(tForm("checkFields"));
              return;
            }
            run(() => addBannedWordsBulk(payload()), {
              success: (d) => t("bulkDone", { added: d.added, skipped: d.skipped }),
              onError: fromServer,
              onSuccess: onClose,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("bulkTitle")}</DialogTitle>
            <DialogDescription>{t("bulkDescription")}</DialogDescription>
          </DialogHeader>
          <FormField label={t("bulkLines")} hint={t("bulkCount", { count: phrases.length, skipped })} error={errorAt(errors, "lines")}>
            {(props) => <Textarea {...props} dir="auto" rows={8} value={lines} onChange={(e) => setLines(e.target.value)} />}
          </FormField>
          <SharedFields values={shared} onChange={setShared} errors={errors} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || phrases.length === 0}>
              <ListPlus aria-hidden />
              {t("bulkAdd", { count: phrases.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestBox() {
  const t = useTranslations("adminContent.bannedWords");
  const tCat = useTranslations("adminContent.bannedWords.categories");
  const { run, pending } = useContentAction();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ hits: BannedWordTestHit[]; blocked: boolean; points: number } | null>(null);

  let summary: ReactNode = null;
  if (result) {
    summary =
      result.hits.length === 0 ? (
        <p className="text-sm text-verified">{t("testClean")}</p>
      ) : (
        <p className="text-sm font-medium">
          {result.blocked ? t("testBlocked") : t("testFlagged", { points: result.points })}
        </p>
      );
  }

  return (
    <section aria-labelledby="bw-test" className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 id="bw-test" className="flex items-center gap-1.5 text-sm font-semibold">
        <FlaskConical aria-hidden className="size-4 text-muted-foreground" />
        {t("testTitle")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("testDescription")}</p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          run(() => testBannedWords({ text }), { onSuccess: setResult, refresh: false });
        }}
      >
        <label htmlFor="bw-test-text" className="sr-only">
          {t("testLabel")}
        </label>
        <Textarea id="bw-test-text" dir="auto" rows={4} maxLength={10_000} value={text} placeholder={t("testPlaceholder")} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="outline" className="w-fit" disabled={pending || !text.trim()}>
          <TextSearch aria-hidden />
          {t("testRun")}
        </Button>
      </form>
      <div aria-live="polite" className="mt-3 flex flex-col gap-2">
        {summary}
        {result && result.hits.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {result.hits.map((hit, i) => (
              <li key={`${hit.rule}-${i}`} className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="rounded bg-warning-soft px-1.5 font-medium" dir="auto">
                  {hit.phrase}
                </span>
                <Pill tone={hit.action === "BLOCK" ? "danger" : "warning"}>{t(`actions.${hit.action}`)}</Pill>
                <Pill tone="muted">{tCat.has(hit.category) ? tCat(hit.category) : hit.category}</Pill>
                <span className="text-xs text-muted-foreground">
                  {hit.source === "builtin" ? t("sourceBuiltin") : t("sourceList")}
                  {hit.action === "FLAG" ? ` · ${t("pointsShort", { points: hit.weight })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function BannedWordsManager({ items }: { items: BannedWordData[] }) {
  const t = useTranslations("adminContent.bannedWords");
  const { run } = useContentAction();
  const [dialog, setDialog] = useState<{ kind: "word"; item: BannedWordData | null; key: number } | { kind: "bulk"; key: number } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setDialog({ kind: "bulk", key: Date.now() })}>
          <ListPlus aria-hidden />
          {t("bulkTitle")}
        </Button>
        <Button type="button" onClick={() => setDialog({ kind: "word", item: null, key: Date.now() })}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <ShieldBan aria-hidden className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {items.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 p-3 sm:px-4">
              <span className="min-w-0 flex-1 font-medium break-words" dir="auto">
                {w.phrase}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="muted">{w.locale ? siteConfig.i18n.nativeNames[w.locale as (typeof locales)[number]] : t("allLanguages")}</Pill>
                <Pill tone="muted">{t(`categories.${w.category}`)}</Pill>
                <Pill tone={w.action === "BLOCK" ? "danger" : "warning"}>
                  {w.action === "FLAG" ? t("flagWithPoints", { points: w.weight }) : t("actions.BLOCK")}
                </Pill>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("edit")}
                  title={t("edit")}
                  onClick={() => setDialog({ kind: "word", item: w, key: Date.now() })}
                >
                  <Pencil aria-hidden />
                </Button>
                <ConfirmButton
                  label={t("delete")}
                  iconOnly
                  size="icon-sm"
                  variant="ghost"
                  title={t("deleteTitle")}
                  description={w.phrase}
                  onConfirm={() => run(() => deleteBannedWord({ id: w.id }), { success: t("deleted") })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "word" ? <WordDialog key={dialog.key} item={dialog.item} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "bulk" ? <BulkDialog key={dialog.key} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

export { TestBox as BannedWordsTestBox };
