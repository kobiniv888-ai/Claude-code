"use client";

import { ArrowDown, ArrowUp, EyeOff, MessageCircleQuestion, Pencil, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickLocalized } from "@/i18n/locale";
import { deleteFaqItem, reorderFaqItems, saveFaqItem } from "@/lib/admin/content/actions/editorial";
import { emptyLocalized, toLocalizedForm, type LocalizedForm } from "@/lib/admin/content/localized";
import { moveItem } from "@/lib/admin/content/order";
import { FAQ_CATEGORIES, LIMITS, faqSchema } from "@/lib/admin/content/schemas";
import { ConfirmButton } from "./bits";
import { Pill } from "./pill";
import { errorAt, FormField, LanguageTabs, LocaleText, SwitchRow, useFieldErrors } from "./form";
import { useContentAction } from "./use-content-action";

type Category = (typeof FAQ_CATEGORIES)[number];
export type FaqItemData = { id: string; category: Category; question: unknown; answer: unknown; published: boolean };
type FaqValues = { category: Category; question: LocalizedForm; answer: LocalizedForm; published: boolean };

function FaqDialog({
  open,
  onOpenChange,
  item,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FaqItemData | null;
  category: Category;
}) {
  const t = useTranslations("adminContent.faq");
  const tForm = useTranslations("adminContent.form");
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<FaqValues>(() =>
    item
      ? { category: item.category, question: toLocalizedForm(item.question), answer: toLocalizedForm(item.answer), published: item.published }
      : { category, question: emptyLocalized(), answer: emptyLocalized(), published: true },
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate(faqSchema, values)) {
              toast.error(tForm("checkFields"));
              return;
            }
            run(() => saveFaqItem({ id: item?.id ?? null, values }), {
              success: item ? t("saved") : t("created"),
              onError: fromServer,
              onSuccess: () => onOpenChange(false),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("category")} error={errorAt(errors, "category")}>
              {(props) => (
                <Select value={values.category} onValueChange={(v) => setValues((s) => ({ ...s, category: v as Category }))}>
                  <SelectTrigger {...props} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAQ_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`categories.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <SwitchRow
              label={t("published")}
              description={t("publishedHint")}
              checked={values.published}
              onCheckedChange={(published) => setValues((s) => ({ ...s, published }))}
            />
          </div>
          <LanguageTabs
            filled={(l) => Boolean(values.question[l].trim() && values.answer[l].trim())}
            invalid={(l) => Boolean(errors[`question.${l}`] || errors[`answer.${l}`])}
          >
            {(locale) => (
              <>
                <LocaleText
                  locale={locale}
                  label={t("question")}
                  required={locale === "he" || locale === "en"}
                  value={values.question[locale]}
                  maxLength={LIMITS.question}
                  error={errorAt(errors, `question.${locale}`)}
                  onChange={(v) => setValues((s) => ({ ...s, question: { ...s.question, [locale]: v } }))}
                />
                <LocaleText
                  locale={locale}
                  label={t("answer")}
                  required={locale === "he" || locale === "en"}
                  multiline
                  rows={6}
                  value={values.answer[locale]}
                  maxLength={LIMITS.answer}
                  error={errorAt(errors, `answer.${locale}`)}
                  onChange={(v) => setValues((s) => ({ ...s, answer: { ...s.answer, [locale]: v } }))}
                />
              </>
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

export function FaqManager({ groups }: { groups: { category: Category; items: FaqItemData[] }[] }) {
  const t = useTranslations("adminContent.faq");
  const locale = useLocale();
  const { run, pending } = useContentAction();
  const [dialog, setDialog] = useState<{ item: FaqItemData | null; category: Category; key: number } | null>(null);
  const [orders, setOrders] = useState<Record<string, string[]>>({});

  const ordered = (category: Category, items: FaqItemData[]) => {
    const ids = orders[category];
    if (!ids || ids.length !== items.length) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const list = ids.map((id) => byId.get(id)).filter((i): i is FaqItemData => Boolean(i));
    return list.length === items.length ? list : items;
  };

  const move = (category: Category, items: FaqItemData[], index: number, delta: -1 | 1) => {
    const next = moveItem(items, index, delta);
    if (next === items) return;
    const ids = next.map((i) => i.id);
    setOrders((o) => ({ ...o, [category]: ids }));
    run(() => reorderFaqItems({ category, ids }), {
      success: t("orderSaved"),
      onError: () => setOrders((o) => ({ ...o, [category]: items.map((i) => i.id) })),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ category, items: raw }) => {
        const items = ordered(category, raw);
        return (
          <section key={category} aria-labelledby={`faq-${category}`} className="rounded-xl border bg-card shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id={`faq-${category}`} className="text-sm font-semibold">
                {t(`categories.${category}`)}
                <span className="ms-2 text-xs font-normal text-muted-foreground">{t("count", { count: items.length })}</span>
              </h2>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ item: null, category, key: Date.now() })}>
                <Plus aria-hidden />
                {t("add")}
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <MessageCircleQuestion aria-hidden className="size-4" />
                {t("emptyCategory")}
              </p>
            ) : (
              <ol className="divide-y">
                {items.map((item, index) => {
                  const question = pickLocalized(item.question, locale);
                  return (
                    <li key={item.id} className="flex items-start gap-2 p-3 sm:px-4">
                      <div className="flex shrink-0 flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0 || pending}
                          aria-label={t("moveUp", { question })}
                          onClick={() => move(category, items, index, -1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === items.length - 1 || pending}
                          aria-label={t("moveDown", { question })}
                          onClick={() => move(category, items, index, 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{question}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{pickLocalized(item.answer, locale)}</p>
                        {!item.published ? (
                          <Pill tone="muted" icon={EyeOff} className="mt-1.5">
                            {t("unpublished")}
                          </Pill>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("edit")}
                          title={t("edit")}
                          onClick={() => setDialog({ item, category, key: Date.now() })}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <ConfirmButton
                          label={t("delete")}
                          iconOnly
                          size="icon-sm"
                          variant="ghost"
                          title={t("deleteTitle")}
                          description={question}
                          onConfirm={() => run(() => deleteFaqItem({ id: item.id }), { success: t("deleted") })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
      {dialog ? (
        <FaqDialog
          key={dialog.key}
          open
          item={dialog.item}
          category={dialog.category}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
