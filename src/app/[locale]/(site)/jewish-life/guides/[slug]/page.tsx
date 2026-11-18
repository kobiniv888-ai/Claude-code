import { ArrowLeft, Scale } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { JlContainer } from "@/components/jewish-life/section";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { parseMarkdown, type MdInline } from "@/lib/jewish-life/markdown";
import { pageMetadata } from "@/lib/seo";
import { getPublishedGuide } from "@/lib/jewish-life/queries";

type Props = { params: Promise<{ locale: string; slug: string }> };

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

async function load(locale: string, slug: string) {
  if (!siteConfig.features.articles || !isAppLocale(locale) || !SLUG.test(slug)) return null;
  return getPublishedGuide(slug, locale);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = await load(locale, slug);
  if (!guide) return { robots: { index: false } };
  return pageMetadata({
    locale,
    path: `/jewish-life/guides/${slug}`,
    title: guide.title,
    description: guide.excerpt ?? guide.title,
    image: guide.coverUrl ?? undefined,
    type: "article",
  });
}

function Inline({ content }: { content: MdInline[] }) {
  return content.map((part, i): ReactNode => {
    if (part.type === "strong") return <strong key={i}>{part.text}</strong>;
    if (part.type === "link") {
      return (
        <a
          key={i}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-primary underline underline-offset-4"
        >
          {part.text}
        </a>
      );
    }
    return part.text;
  });
}

export default async function GuidePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const guide = await load(locale, slug);
  if (!guide) notFound();
  const t = await getTranslations({ locale, namespace: "jewishLife.guide" });

  return (
    <JlContainer size="prose" className="py-10 sm:py-14">
      <Link
        href="/jewish-life#guides"
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <article className="mt-6">
        <header>
          <h1 dir="auto" className="text-h1 text-balance">
            {guide.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {guide.publishedAt ? <span>{t("published", { date: formatDate(guide.publishedAt, locale) })}</span> : null}
            {guide.reviewedByLawyer ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Scale aria-hidden="true" className="size-4" />
                {t("reviewedByLawyer")}
              </span>
            ) : null}
          </div>
          {guide.excerpt ? (
            <p dir="auto" className="mt-5 text-lg text-pretty text-muted-foreground">
              {guide.excerpt}
            </p>
          ) : null}
        </header>
        <div dir="auto" className="mt-8 space-y-5 text-base leading-relaxed text-pretty sm:text-lg">
          {parseMarkdown(guide.body).map((block, i) => {
            if (block.type === "heading") {
              const Heading = `h${block.level}` as "h2" | "h3" | "h4";
              return (
                <Heading key={i} className={block.level === 2 ? "pt-4 text-2xl font-bold" : "pt-2 text-xl font-semibold"}>
                  <Inline content={block.content} />
                </Heading>
              );
            }
            if (block.type === "list") {
              const List = block.ordered ? "ol" : "ul";
              return (
                <List key={i} className={block.ordered ? "list-decimal space-y-2 ps-6" : "list-disc space-y-2 ps-6"}>
                  {block.items.map((item, j) => (
                    <li key={j}>
                      <Inline content={item} />
                    </li>
                  ))}
                </List>
              );
            }
            return (
              <p key={i}>
                <Inline content={block.content} />
              </p>
            );
          })}
        </div>
      </article>
    </JlContainer>
  );
}
