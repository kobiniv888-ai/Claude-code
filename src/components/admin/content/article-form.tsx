"use client";

import { Save, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { deleteArticle, saveArticle } from "@/lib/admin/content/actions/editorial";
import { emptyLocalized, type LocalizedForm } from "@/lib/admin/content/localized";
import { ARTICLE_CATEGORIES, ARTICLE_STATUSES, LIMITS, articleSchema } from "@/lib/admin/content/schemas";
import { slugify } from "@/lib/listing/urls";
import { ConfirmButton } from "./bits";
import { errorAt, FormField, FormFooter, LanguageTabs, LocaleText, SwitchRow, useFieldErrors } from "./form";
import { useContentAction } from "./use-content-action";

export type ArticleFormValues = {
  slug: string;
  category: string;
  title: LocalizedForm;
  excerpt: LocalizedForm;
  body: LocalizedForm;
  coverUrl: string;
  status: (typeof ARTICLE_STATUSES)[number];
  reviewedByLawyer: boolean;
};

function newArticleValues(): ArticleFormValues {
  return {
    slug: "",
    category: ARTICLE_CATEGORIES[0],
    title: emptyLocalized(),
    excerpt: emptyLocalized(),
    body: emptyLocalized(),
    coverUrl: "",
    status: "DRAFT",
    reviewedByLawyer: false,
  };
}

export function ArticleForm({ id, initial }: { id: string | null; initial?: ArticleFormValues }) {
  const t = useTranslations("adminContent.articles");
  const tForm = useTranslations("adminContent.form");
  const router = useRouter();
  const { run, pending } = useContentAction();
  const { errors, validate, fromServer } = useFieldErrors();
  const [values, setValues] = useState<ArticleFormValues>(() => initial ?? newArticleValues());
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const set = <K extends keyof ArticleFormValues>(key: K, value: ArticleFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const categories: string[] = (ARTICLE_CATEGORIES as readonly string[]).includes(values.category)
    ? [...ARTICLE_CATEGORIES]
    : [...ARTICLE_CATEGORIES, values.category];

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate(articleSchema, values)) {
          toast.error(tForm("checkFields"));
          return;
        }
        run(() => saveArticle({ id, values }), {
          success: id ? t("saved") : t("created"),
          onError: fromServer,
          onSuccess: (d) => {
            if (!id) router.push(`/admin/content/articles/${d.id}`);
          },
        });
      }}
    >
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2">
        <FormField label={t("slug")} required hint={t("slugHint")} error={errorAt(errors, "slug")}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              value={values.slug}
              maxLength={LIMITS.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
            />
          )}
        </FormField>
        <FormField label={t("category")} required error={errorAt(errors, "category")}>
          {(props) => (
            <Select value={values.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t.has(`categories.${c}`) ? t(`categories.${c}`) : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("status")} error={errorAt(errors, "status")}>
          {(props) => (
            <Select value={values.status} onValueChange={(v) => set("status", v as ArticleFormValues["status"])}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARTICLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label={t("coverUrl")} hint={t("coverHint")} error={errorAt(errors, "coverUrl")}>
          {(props) => (
            <Input {...props} dir="ltr" placeholder="https://" value={values.coverUrl} maxLength={LIMITS.url} onChange={(e) => set("coverUrl", e.target.value)} />
          )}
        </FormField>
      </section>

      <SwitchRow
        label={
          <span className="inline-flex items-center gap-1.5">
            <Scale aria-hidden className="size-4 text-muted-foreground" />
            {t("reviewedByLawyer")}
          </span>
        }
        description={t("reviewedByLawyerHint")}
        checked={values.reviewedByLawyer}
        onCheckedChange={(v) => set("reviewedByLawyer", v)}
      />

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <LanguageTabs
          filled={(locale) => Boolean(values.title[locale].trim() && values.body[locale].trim())}
          invalid={(locale) => ["title", "excerpt", "body"].some((f) => Boolean(errors[`${f}.${locale}`]))}
        >
          {(locale) => (
            <>
              <LocaleText
                locale={locale}
                label={t("titleField")}
                required={locale === "he" || locale === "en"}
                value={values.title[locale]}
                maxLength={LIMITS.title}
                error={errorAt(errors, `title.${locale}`)}
                onChange={(v) => {
                  const title = { ...values.title, [locale]: v };
                  setValues((prev) => ({ ...prev, title, slug: !slugTouched && locale === "en" ? slugify(v) : prev.slug }));
                }}
              />
              <LocaleText
                locale={locale}
                label={t("excerpt")}
                multiline
                rows={2}
                value={values.excerpt[locale]}
                maxLength={LIMITS.excerpt}
                error={errorAt(errors, `excerpt.${locale}`)}
                onChange={(v) => set("excerpt", { ...values.excerpt, [locale]: v })}
              />
              <LocaleText
                locale={locale}
                label={t("body")}
                hint={t("bodyHint")}
                required={locale === "he" || locale === "en"}
                multiline
                rows={16}
                className="[&_textarea]:font-mono [&_textarea]:text-sm"
                value={values.body[locale]}
                maxLength={LIMITS.articleBody}
                error={errorAt(errors, `body.${locale}`)}
                onChange={(v) => set("body", { ...values.body, [locale]: v })}
              />
            </>
          )}
        </LanguageTabs>
      </section>

      <FormFooter>
        {id ? (
          <ConfirmButton
            label={t("delete")}
            title={t("deleteTitle")}
            description={t("deleteDescription")}
            variant="outline"
            className="me-auto"
            onConfirm={() =>
              run(() => deleteArticle({ id }), { success: t("deleted"), refresh: false, onSuccess: () => router.push("/admin/content/articles") })
            }
          />
        ) : null}
        <Button type="submit" disabled={pending}>
          <Save aria-hidden />
          {id ? t("save") : t("create")}
        </Button>
      </FormFooter>
    </form>
  );
}
