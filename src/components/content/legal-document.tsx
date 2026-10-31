import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CookieSettingsButton } from "./cookie-settings-button";
import { CookieTable } from "./cookie-table";
import { ContentContainer } from "./content-container";
import { formatContentDate } from "./format";
import { LawyerReviewNotice } from "./lawyer-review-notice";
import { legalDocKeys, legalDocs, sectionAnchor, type LegalDocKey } from "./legal-docs";
import { PageHero } from "./page-hero";
import { contentTags, contentValues } from "./rich";
import { Toc } from "./toc";

type SectionData = Record<string, unknown>;

/**
 * A full legal page built from messages/<locale>/legal.json → <doc>.sections.
 * Each section is { title, p1, p2, list: {a, b…}, steps: {…}, note, sub…, table, consentButton }
 * and the blocks render in the order they appear in the file.
 */
export async function LegalDocument({ locale, doc }: { locale: string; doc: LegalDocKey }) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const meta = legalDocs[doc];
  const updated = formatContentDate(meta.lastUpdated, locale);
  const plain = { ...contentValues(locale), date: updated };
  const values = { ...plain, ...contentTags };
  const sections = t.raw(`${doc}.sections`) as Record<string, SectionData>;
  const sectionKeys = Object.keys(sections);
  const toc = sectionKeys.map((key) => ({ id: sectionAnchor(key), label: t(`${doc}.sections.${key}.title`, plain) }));

  function renderBlock(sectionKey: string, blockKey: string, value: unknown) {
    const path = `${doc}.sections.${sectionKey}.${blockKey}`;
    if (blockKey === "title") return null;
    if (blockKey === "table") return <CookieTable key={blockKey} locale={locale} base={path} />;
    if (blockKey === "consentButton") {
      return (
        <div key={blockKey} className="mt-5">
          <CookieSettingsButton label={t(path)} />
        </div>
      );
    }
    if ((blockKey.startsWith("list") || blockKey.startsWith("steps")) && value && typeof value === "object") {
      const ordered = blockKey.startsWith("steps");
      const ListTag = ordered ? "ol" : "ul";
      return (
        <ListTag
          key={blockKey}
          className={
            ordered
              ? "mt-4 list-decimal space-y-2.5 ps-6 marker:font-semibold marker:text-primary"
              : "mt-4 list-disc space-y-2.5 ps-6 marker:text-primary/70"
          }
        >
          {Object.keys(value).map((item) => (
            <li key={item} className="ps-1 leading-7">
              {t.rich(`${path}.${item}`, values)}
            </li>
          ))}
        </ListTag>
      );
    }
    if (blockKey.startsWith("note")) {
      return (
        <p
          key={blockKey}
          className="mt-5 rounded-xl border-s-4 border-primary bg-secondary/70 px-4 py-3 leading-7 text-secondary-foreground"
        >
          {t.rich(path, values)}
        </p>
      );
    }
    if (blockKey.startsWith("sub")) {
      return (
        <h3 key={blockKey} className="mt-6 text-lg font-semibold">
          {t(path, plain)}
        </h3>
      );
    }
    return (
      <p key={blockKey} className="mt-4 leading-7">
        {t.rich(path, values)}
      </p>
    );
  }

  const otherDocs = legalDocKeys.filter((key) => key !== doc);

  return (
    <>
      <PageHero
        icon={meta.icon}
        eyebrow={t("common.eyebrow")}
        title={t(`${doc}.title`)}
        lead={t(`${doc}.lead`, plain)}
        size="compact"
      >
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4" />
          <span>
            {t("common.lastUpdated")}: <time dateTime={meta.lastUpdated}>{updated}</time>
          </span>
        </p>
        <LawyerReviewNotice title={t("common.draftTitle")} className="mt-5">
          {t("common.draftBody", plain)}
        </LawyerReviewNotice>
      </PageHero>

      <ContentContainer className="py-8 sm:py-12">
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-16">
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
            <Toc title={t("common.toc")} items={toc} />
          </div>

          <div className="mt-8 min-w-0 max-w-3xl lg:mt-0">
            <article className="text-[0.975rem] text-foreground/90 sm:text-base">
              {sectionKeys.map((key, index) => (
                <section key={key} className="border-b py-8 first:pt-0 last:border-b-0">
                  <h2
                    id={sectionAnchor(key)}
                    className="flex scroll-mt-24 gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  >
                    <span aria-hidden="true" className="tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="text-balance">{t(`${doc}.sections.${key}.title`, plain)}</span>
                  </h2>
                  {Object.entries(sections[key]).map(([blockKey, value]) => renderBlock(key, blockKey, value))}
                </section>
              ))}
            </article>

            <nav aria-labelledby="other-legal-pages" className="mt-10">
              <h2 id="other-legal-pages" className="text-lg font-semibold">
                {t("common.otherDocs")}
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {otherDocs.map((key) => {
                  const Icon = legalDocs[key].icon;
                  return (
                    <li key={key}>
                      <Link
                        href={legalDocs[key].path}
                        className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        >
                          <Icon className="size-5" strokeWidth={1.75} />
                        </span>
                        <span className="font-medium group-hover:text-primary">{t(`nav.${key}`)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      </ContentContainer>
    </>
  );
}
