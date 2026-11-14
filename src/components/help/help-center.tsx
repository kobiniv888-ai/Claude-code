"use client";

import { Check, ChevronDown, Link2, LifeBuoy, MessageSquarePlus, Search, SearchX, X } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { useLocale, useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import { IconCircle } from "@/components/ds/icon-circle";
import { Button } from "@/components/ui/button";
import type { FaqCategory } from "@/generated/prisma/enums";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES, faqCategoryIcons, faqCategoryTones } from "./faq-icons";
import { highlightParts, searchFaq, searchTokens, type FaqEntry } from "./faq-search";

export type HelpFaqItem = FaqEntry & { category: FaqCategory };

type Filter = FaqCategory | "ALL";

const HASH_PREFIX = "#faq-";

/**
 * The help page's address on the permanent site address (SITE_URL, built on the server with
 * @/lib/site-url), so a copied question link keeps working (round 3 brief 2.1). Null: this page.
 */
const ShareBaseContext = createContext<string | null>(null);

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const parts = useMemo(() => highlightParts(text, tokens), [text, tokens]);
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-surface-muted px-0.5 text-foreground ring-1 ring-border-strong/30">
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
  const shareBase = useContext(ShareBaseContext);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const url = `${shareBase ?? `${window.location.origin}${window.location.pathname}`}${HASH_PREFIX}${id}`;
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
      {copied ? <Check aria-hidden="true" className="text-success" /> : <Link2 aria-hidden="true" />}
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
            className="scroll-mt-28 rounded-card border bg-card"
          >
            <AccordionPrimitive.Header asChild>
              <Heading className="m-0">
                <AccordionPrimitive.Trigger className="group flex min-h-14 w-full items-center gap-3 rounded-card px-4 py-3.5 text-start text-body font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5">
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
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-data-[state=open]:bg-primary-tint group-data-[state=open]:text-primary-text"
                  >
                    <ChevronDown className="size-4.5 transition-transform duration-(--motion-base) group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                  </span>
                </AccordionPrimitive.Trigger>
              </Heading>
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-(--motion-base)">
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

const emptyCard = "rounded-card border border-dashed bg-card/60 px-6";

/**
 * The help center: big instant search, six topics and the FAQ accordion.
 * Questions have deep links (#faq-<id>) that open and scroll to the answer.
 */
export function HelpCenter({ items, pageUrl = null }: { items: HelpFaqItem[]; /** This page on the permanent address. */ pageUrl?: string | null }) {
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
    <ShareBaseContext.Provider value={pageUrl}>
      {/* Hero with the search box */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-3xl px-gutter pt-8 pb-8 text-center sm:pt-14 sm:pb-10">
          <IconCircle icon={LifeBuoy} tone="navy" size="md" className="mx-auto mb-4" />
          <h1 className="text-h1 text-balance text-foreground">{t("hero.title")}</h1>
          <p className="mx-auto mt-2 max-w-xl text-body text-pretty text-muted-foreground">{t("hero.lead")}</p>
          <form role="search" onSubmit={(e) => e.preventDefault()} className="relative mx-auto mt-6 max-w-2xl">
            <label htmlFor={searchId} className="sr-only">
              {t("search.label")}
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 start-5 size-5 -translate-y-1/2 text-muted-foreground"
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
              className="h-13 w-full rounded-full border border-input bg-card ps-13 pe-13 text-body outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 sm:h-14 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label={t("search.clear")}
                className="absolute top-1/2 end-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            ) : null}
          </form>
          <p id={`${searchId}-status`} aria-live="polite" className="mt-3 min-h-5 text-small text-muted-foreground">
            {searching
              ? t("search.results", { count: results.length, countText: n(results.length) })
              : t("search.hint")}
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-gutter pt-6 sm:pt-10">
        {items.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title={t("empty.title")}
            description={t("empty.body")}
            action={{ label: t("empty.ticket"), href: "/help/new-ticket", icon: MessageSquarePlus }}
            className={emptyCard}
          />
        ) : searching ? (
          <section aria-labelledby="faq-results-title">
            <h2 id="faq-results-title" className="mb-4 text-h2 text-balance">
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
              <EmptyState
                icon={SearchX}
                tone="neutral"
                headingLevel={3}
                title={t.rich("search.noResultsTitle", {
                  query: query.trim(),
                  q: (chunks) => <bdi dir="auto">{chunks}</bdi>,
                })}
                description={t("search.noResultsBody")}
                action={{ label: t("search.openTicket"), href: "/help/new-ticket", icon: MessageSquarePlus }}
                quickFixes={[
                  <Button key="clear" type="button" variant="outline" className="h-11 rounded-full px-5" onClick={() => onQueryChange("")}>
                    <X aria-hidden="true" />
                    {t("search.clear")}
                  </Button>,
                ]}
                className={emptyCard}
              />
            )}
          </section>
        ) : (
          <>
            {/* Topics */}
            <section aria-labelledby="faq-topics-title">
              <h2 id="faq-topics-title" className="text-h2 text-balance">
                {t("topics.title")}
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                          "flex w-full flex-col items-center gap-2 rounded-card border bg-card px-3 py-4 text-center transition-transform duration-(--motion-fast) hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                          active && "border-primary bg-primary-tint",
                        )}
                      >
                        <IconCircle icon={Icon} tone={active ? "navy-solid" : faqCategoryTones[c]} size="lg" />
                        <span className="text-small leading-snug font-semibold text-balance">{tCat(`${c}.title`)}</span>
                        <span className="text-caption text-muted-foreground">
                          {t("topics.count", { count, countText: n(count) })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Questions */}
            <section ref={questionsRef} aria-labelledby="faq-questions-title" className="mt-10 scroll-mt-24 sm:mt-12">
              <div className="flex flex-col gap-4">
                <h2 id="faq-questions-title" className="text-h2 text-balance">
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
                      <Chip
                        key={value}
                        size="sm"
                        pressed={active}
                        count={count}
                        onClick={() => chooseTopic(value, false)}
                      >
                        {value === "ALL" ? t("faq.all") : tCat(`${value}.title`)}
                      </Chip>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                {filter === "ALL" ? (
                  <div className="flex flex-col gap-8">
                    {groups.map((group) => {
                      const Icon = faqCategoryIcons[group.category];
                      return (
                        <div key={group.category}>
                          <h3 className="mb-3 flex items-center gap-2 text-h3 text-foreground">
                            <IconCircle icon={Icon} tone={faqCategoryTones[group.category]} size="xs" />
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
                  <EmptyState
                    icon={SearchX}
                    tone="neutral"
                    headingLevel={3}
                    title={t("faq.emptyTopic")}
                    description={t("faq.emptyTopicBody")}
                    action={{ label: t("search.openTicket"), href: "/help/new-ticket", icon: MessageSquarePlus }}
                    className={emptyCard}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </ShareBaseContext.Provider>
  );
}
