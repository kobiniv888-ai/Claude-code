"use client";

import { Check, ChevronDown, Link2, LifeBuoy, Search, SearchX, X } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FaqCategory } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES, faqCategoryIcons } from "./faq-icons";
import { highlightParts, searchFaq, searchTokens, type FaqEntry } from "./faq-search";

export type HelpFaqItem = FaqEntry & { category: FaqCategory };

type Filter = FaqCategory | "ALL";

const HASH_PREFIX = "#faq-";

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const parts = useMemo(() => highlightParts(text, tokens), [text, tokens]);
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-warning-soft px-0.5 text-foreground ring-1 ring-warning/30">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function CopyLinkButton({ id }: { id: string }) {
  const t = useTranslations("help.faq");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const url = `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${id}`;
    window.history.replaceState(window.history.state, "", `${HASH_PREFIX}${id}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address bar now holds the link.
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} className="text-muted-foreground">
      {copied ? <Check aria-hidden="true" className="text-verified" /> : <Link2 aria-hidden="true" />}
      <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
    </Button>
  );
}

function FaqAccordion({
  items,
  open,
  onOpenChange,
  tokens,
  headingLevel,
  showCategory,
}: {
  items: HelpFaqItem[];
  open: string[];
  onOpenChange: (value: string[]) => void;
  tokens: string[];
  headingLevel: "h3" | "h4";
  showCategory: boolean;
}) {
  const tCat = useTranslations("help.categories");
  const Heading = headingLevel;
  return (
    <AccordionPrimitive.Root type="multiple" value={open} onValueChange={onOpenChange} className="flex flex-col gap-3">
      {items.map((item) => {
        const Icon = faqCategoryIcons[item.category];
        return (
          <AccordionPrimitive.Item
            key={item.id}
            value={item.id}
            id={`faq-${item.id}`}
            className="scroll-mt-28 rounded-2xl border bg-card shadow-card transition-shadow data-[state=open]:shadow-card-hover"
          >
            <AccordionPrimitive.Header asChild>
              <Heading className="m-0">
                <AccordionPrimitive.Trigger className="group flex w-full items-start gap-3 rounded-2xl px-4 py-4 text-start text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5">
                  <span className="min-w-0 flex-1">
                    {showCategory ? (
                      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Icon aria-hidden="true" className="size-3.5" />
                        {tCat(`${item.category}.title`)}
                      </span>
                    ) : null}
                    <span dir="auto" className="block leading-snug text-pretty">
                      <Highlighted text={item.question} tokens={tokens} />
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                  />
                </AccordionPrimitive.Trigger>
              </Heading>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="border-t px-4 pt-3 pb-3 sm:px-5">
                <div
                  dir="auto"
                  className="text-[0.95rem] leading-relaxed whitespace-pre-line text-pretty text-muted-foreground"
                >
                  <Highlighted text={item.answer} tokens={tokens} />
                </div>
                <div className="mt-2 -ms-2 flex flex-wrap items-center gap-1">
                  <CopyLinkButton id={item.id} />
                </div>
              </div>
            </AccordionPrimitive.Content>
          </AccordionPrimitive.Item>
        );
      })}
    </AccordionPrimitive.Root>
  );
}

function EmptyBlock({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary [&_svg]:size-7"
      >
        {icon}
      </span>
      <p className="max-w-md text-lg font-semibold text-balance">{title}</p>
      <p className="max-w-md text-sm text-pretty text-muted-foreground">{body}</p>
      {children ? <div className="mt-2 flex flex-col gap-2 sm:flex-row">{children}</div> : null}
    </div>
  );
}

const primaryLink =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4";

/**
 * The help center: big instant search, six topics and the FAQ accordion.
 * Questions have deep links (#faq-<id>) that open and scroll to the answer.
 */
export function HelpCenter({ items }: { items: HelpFaqItem[] }) {
  const t = useTranslations("help");
  const tCat = useTranslations("help.categories");
  const locale = useLocale();
  const searchId = useId();
  const questionsRef = useRef<HTMLElement>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [open, setOpen] = useState<string[]>([]);

  const tokens = useMemo(() => searchTokens(query), [query]);
  const searching = tokens.length > 0;
  const results = useMemo(() => (searching ? searchFaq(items, query) : []), [items, query, searching]);

  const counts = useMemo(() => {
    const map = new Map<FaqCategory, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);

  // Deep links: #faq-<id> opens that answer and scrolls to it (on load and on hash changes).
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    function openFromHash() {
      const hash = decodeURIComponent(window.location.hash);
      if (!hash.startsWith(HASH_PREFIX)) return;
      const id = hash.slice(HASH_PREFIX.length);
      if (!ids.has(id)) return;
      setQuery("");
      setFilter("ALL");
      setOpen((current) => (current.includes(id) ? current : [...current, id]));
      scrollTimer = setTimeout(() => {
        const el = document.getElementById(`faq-${id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
      }, 60);
    }
    const frame = requestAnimationFrame(openFromHash);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      cancelAnimationFrame(frame);
      if (scrollTimer) clearTimeout(scrollTimer);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, [items]);

  function onQueryChange(value: string) {
    setQuery(value);
    const next = searchTokens(value).length ? searchFaq(items, value) : [];
    // Open the best answers right away while searching.
    setOpen(next.length && next.length <= 3 ? next.slice(0, 1).map((r) => r.id) : []);
  }

  function chooseTopic(value: Filter, scroll: boolean) {
    setFilter(value);
    setQuery("");
    setOpen([]);
    if (scroll) {
      requestAnimationFrame(() =>
        questionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  const filtered = filter === "ALL" ? items : items.filter((i) => i.category === filter);
  const groups =
    filter === "ALL"
      ? FAQ_CATEGORIES.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter(
          (g) => g.items.length,
        )
      : [];
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      {/* Hero with the search box */}
      <section className="relative isolate overflow-hidden border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-terracotta/10 blur-3xl sm:size-96"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -start-16 -z-10 size-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-card text-primary shadow-card"
            >
              <LifeBuoy className="size-7" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">{t("hero.title")}</h1>
            <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("hero.lead")}</p>
            <form role="search" onSubmit={(e) => e.preventDefault()} className="relative mx-auto mt-8 max-w-2xl">
              <label htmlFor={searchId} className="sr-only">
                {t("search.label")}
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 start-4 size-5 -translate-y-1/2 text-muted-foreground sm:start-5 sm:size-6"
              />
              <input
                id={searchId}
                type="search"
                dir={query ? "auto" : undefined}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    onQueryChange("");
                  }
                }}
                placeholder={t("search.placeholder")}
                autoComplete="off"
                enterKeyHint="search"
                aria-describedby={`${searchId}-status`}
                className="h-14 w-full rounded-2xl border border-input bg-card ps-12 pe-12 text-base shadow-card-hover outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 sm:h-16 sm:ps-14 sm:text-lg [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label={t("search.clear")}
                  className="absolute top-1/2 end-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              ) : null}
            </form>
            <p id={`${searchId}-status`} aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
              {searching
                ? t("search.results", { count: results.length, countText: n(results.length) })
                : t("search.hint")}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
        {items.length === 0 ? (
          <EmptyBlock icon={<LifeBuoy />} title={t("empty.title")} body={t("empty.body")}>
            <Link href="/help/new-ticket" className={primaryLink}>
              {t("empty.ticket")}
            </Link>
          </EmptyBlock>
        ) : searching ? (
          <section aria-labelledby="faq-results-title">
            <h2 id="faq-results-title" className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
              {t.rich("search.resultsTitle", {
                query: query.trim(),
                q: (chunks) => <bdi dir="auto">{chunks}</bdi>,
              })}
            </h2>
            {results.length ? (
              <FaqAccordion
                items={results as HelpFaqItem[]}
                open={open}
                onOpenChange={setOpen}
                tokens={tokens}
                headingLevel="h3"
                showCategory
              />
            ) : (
              <EmptyBlock
                icon={<SearchX />}
                title={t.rich("search.noResultsTitle", {
                  query: query.trim(),
                  q: (chunks) => <bdi dir="auto">{chunks}</bdi>,
                })}
                body={t("search.noResultsBody")}
              >
                <Link href="/help/new-ticket" className={primaryLink}>
                  {t("search.openTicket")}
                </Link>
                <Button type="button" variant="outline" className="h-11 rounded-xl px-5" onClick={() => onQueryChange("")}>
                  {t("search.clear")}
                </Button>
              </EmptyBlock>
            )}
          </section>
        ) : (
          <>
            {/* Topics */}
            <section aria-labelledby="faq-topics-title">
              <h2 id="faq-topics-title" className="text-xl font-bold tracking-tight sm:text-2xl">
                {t("topics.title")}
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {FAQ_CATEGORIES.map((c) => {
                  const Icon = faqCategoryIcons[c];
                  const count = counts.get(c) ?? 0;
                  const active = filter === c;
                  return (
                    <li key={c} className="flex">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseTopic(active ? "ALL" : c, !active)}
                        className={cn(
                          "flex w-full flex-col items-start gap-3 rounded-2xl border bg-card p-4 text-start shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:p-5",
                          active && "border-primary bg-secondary ring-1 ring-primary",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-xl",
                            c === "SAFETY" ? "bg-verified-soft text-verified" : "bg-secondary text-primary",
                            active && "bg-primary text-primary-foreground",
                          )}
                        >
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm leading-snug font-semibold text-balance sm:text-base">
                            {tCat(`${c}.title`)}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">
                            {t("topics.count", { count, countText: n(count) })}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Questions */}
            <section ref={questionsRef} aria-labelledby="faq-questions-title" className="mt-12 scroll-mt-24">
              <div className="flex flex-col gap-4">
                <h2 id="faq-questions-title" className="text-xl font-bold tracking-tight sm:text-2xl">
                  {filter === "ALL" ? t("faq.title") : tCat(`${filter}.title`)}
                </h2>
                <div
                  role="group"
                  aria-label={t("faq.filterLabel")}
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
                >
                  {(["ALL", ...FAQ_CATEGORIES] as Filter[]).map((value) => {
                    const active = filter === value;
                    const count = value === "ALL" ? items.length : (counts.get(value) ?? 0);
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => chooseTopic(value, false)}
                        className={cn(
                          "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card text-foreground hover:bg-muted",
                        )}
                      >
                        {value === "ALL" ? t("faq.all") : tCat(`${value}.title`)}
                        <span className={cn("text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {n(count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                {filter === "ALL" ? (
                  <div className="flex flex-col gap-10">
                    {groups.map((group) => {
                      const Icon = faqCategoryIcons[group.category];
                      return (
                        <div key={group.category}>
                          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-muted-foreground">
                            <Icon aria-hidden="true" className="size-4" />
                            {tCat(`${group.category}.title`)}
                          </h3>
                          <FaqAccordion
                            items={group.items}
                            open={open}
                            onOpenChange={setOpen}
                            tokens={tokens}
                            headingLevel="h4"
                            showCategory={false}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : filtered.length ? (
                  <FaqAccordion
                    items={filtered}
                    open={open}
                    onOpenChange={setOpen}
                    tokens={tokens}
                    headingLevel="h3"
                    showCategory={false}
                  />
                ) : (
                  <EmptyBlock icon={<SearchX />} title={t("faq.emptyTopic")} body={t("faq.emptyTopicBody")}>
                    <Link href="/help/new-ticket" className={primaryLink}>
                      {t("search.openTicket")}
                    </Link>
                  </EmptyBlock>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
