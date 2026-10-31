"use client";

import { MessageSquareText, Pencil, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pickLocalized } from "@/i18n/locale";
import { deleteSavedReply, saveSavedReply } from "@/lib/admin/content/actions/saved-replies";
import { emptyLocalized, toLocalizedForm, type LocalizedForm } from "@/lib/admin/content/localized";
import { LIMITS, savedReplySchema } from "@/lib/admin/content/schemas";
import { ConfirmButton } from "./bits";
import { errorAt, FormField, LanguageTabs, LocaleText, useFieldErrors } from "./form";
import { useContentAction } from "./use-content-action";

export type SavedReplyData = { id: string; title: string; body: unknown };
type ReplyValues = { title: string; body: LocalizedForm };

function SavedReplyDialog({ item, onOpenChange }: { item: SavedReplyData | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("adminContent.savedReplies");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<ReplyValues>(() =>
    item ? { title: item.title, body: toLocalizedForm(item.body) } : { title: "", body: emptyLocalized() },
  );

  return (
    <Dialog open onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(savedReplySchema, values)) {
              toast.error(tForm("checkFields"));
              return;
            }
            run(() => saveSavedReply({ id: item?.id ?? null, values }), {
              success: item ? t("saved") : t("created"),
              onError: fromServer,
              onSuccess: () => onOpenChange(false),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription", { placeholder: "{name}" })}</DialogDescription>
          </DialogHeader>
          <FormField label={t("name")} hint={t("nameHint")} required error={errorAt(errors, "title")}>
            {(props) => (
              <Input
                {...props}
                dir="auto"
                value={values.title}
                maxLength={LIMITS.savedReplyTitle}
                onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
              />
            )}
          </FormField>
          <LanguageTabs filled={(l) => Boolean(values.body[l].trim())} invalid={(l) => Boolean(errors[`body.${l}`])}>
            {(locale) => (
              <LocaleText
                locale={locale}
                label={t("body")}
                required={locale === "he" || locale === "en"}
                multiline
                rows={7}
                value={values.body[locale]}
                maxLength={LIMITS.savedReplyBody}
                error={errorAt(errors, `body.${locale}`)}
                onChange={(v) => setValues((s) => ({ ...s, body: { ...s.body, [locale]: v } }))}
              />
            )}
          </LanguageTabs>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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

/** Admin list of saved replies (support tickets): add, edit and delete. */
export function SavedRepliesManager({ items }: { items: SavedReplyData[] }) {
  const t = useTranslations("adminContent.savedReplies");
  const locale = useLocale();
  const { run } = useContentAction();
  const [dialog, setDialog] = useState<{ item: SavedReplyData | null; key: number } | null>(null);

  return (
    <section aria-labelledby="saved-replies-heading" className="rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="saved-replies-heading" className="text-sm font-semibold">
          {t("listTitle")}
          <span className="ms-2 text-xs font-normal text-muted-foreground">{t("count", { count: items.length })}</span>
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ item: null, key: Date.now() })}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <MessageSquareText aria-hidden className="size-4" />
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 p-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <p dir="auto" className="font-medium">
                  {item.title}
                </p>
                <p dir="auto" className="line-clamp-2 text-sm text-muted-foreground">
                  {pickLocalized(item.body, locale)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("editNamed", { name: item.title })}
                  title={t("edit")}
                  onClick={() => setDialog({ item, key: Date.now() })}
                >
                  <Pencil aria-hidden />
                </Button>
                <ConfirmButton
                  label={t("deleteNamed", { name: item.title })}
                  iconOnly
                  size="icon-sm"
                  variant="ghost"
                  title={t("deleteTitle")}
                  description={item.title}
                  onConfirm={() => run(() => deleteSavedReply({ id: item.id }), { success: t("deleted") })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog ? (
        <SavedReplyDialog
          key={dialog.key}
          item={dialog.item}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}
