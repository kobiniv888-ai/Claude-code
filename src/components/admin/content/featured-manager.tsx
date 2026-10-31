"use client";

import { CalendarClock, ImageOff, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { addFeaturedListing, removeEndedFeatured, removeFeaturedListing, searchListingsToFeature, type FeaturedCandidate } from "@/lib/admin/content/actions/home";
import { addDays, georgiaToday } from "@/lib/admin/content/schemas";
import { formatDate } from "@/lib/format";
import { listingPath } from "@/lib/listing/urls";
import { ConfirmButton } from "./bits";
import { Pill } from "./pill";
import { useContentAction } from "./use-content-action";

export type FeaturedItem = {
  id: string;
  publicId: number;
  title: string;
  city: string;
  status: string;
  photo: string | null;
  featuredUntil: string | null;
  isDemo: boolean;
  ended: boolean;
};

function Thumb({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail (local or external URL)
    <img src={src} alt="" className="size-14 shrink-0 rounded-lg bg-muted object-cover" loading="lazy" />
  ) : (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <ImageOff aria-hidden className="size-5" />
    </span>
  );
}

export function FeaturedManager({ items }: { items: FeaturedItem[] }) {
  const t = useTranslations("adminContent.featured");
  const tStatus = useTranslations("adminContent.listingStatus");
  const locale = useLocale();
  const { run, pending } = useContentAction();
  const today = georgiaToday();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FeaturedCandidate[] | null>(null);
  const [until, setUntil] = useState(addDays(today, 14));
  const [searching, setSearching] = useState(false);
  const hasEnded = items.some((i) => i.ended);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    await run(() => searchListingsToFeature({ query, locale }), { onSuccess: setResults, refresh: false });
    setSearching(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="featured-add" className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 id="featured-add" className="text-sm font-semibold">
          {t("addTitle")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("addDescription")}</p>
        <form onSubmit={search} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="featured-query">{t("searchLabel")}</Label>
            <Input
              id="featured-query"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-44">
            <Label htmlFor="featured-until">{t("until")}</Label>
            <Input
              id="featured-until"
              type="date"
              dir="ltr"
              min={today}
              max={addDays(today, 365)}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={searching || !query.trim()}>
            <Search aria-hidden />
            {t("search")}
          </Button>
        </form>

        {results !== null ? (
          <div className="mt-4" aria-live="polite">
            {results.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {results.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                    <Thumb src={r.photo} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <span dir="auto">{r.title}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Ltr>ID {r.publicId}</Ltr>
                        {r.city ? <span>{r.city}</span> : null}
                        <Pill tone={r.status === "LIVE" ? "success" : "muted"}>{tStatus.has(r.status) ? tStatus(r.status) : r.status}</Pill>
                        {r.isDemo ? <Pill tone="demo">{t("demo")}</Pill> : null}
                        {r.featured ? <Pill tone="primary" icon={Sparkles}>{t("alreadyFeatured")}</Pill> : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || r.status !== "LIVE"}
                      title={r.status !== "LIVE" ? t("onlyLive") : undefined}
                      onClick={() =>
                        run(() => addFeaturedListing({ listingId: r.id, until }), {
                          success: t("added"),
                          onSuccess: () => setResults((prev) => prev?.map((x) => (x.id === r.id ? { ...x, featured: true } : x)) ?? null),
                        })
                      }
                    >
                      <Plus aria-hidden />
                      {r.featured ? t("extend") : t("add")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="featured-current" className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="featured-current" className="text-sm font-semibold">
            {t("currentTitle", { count: items.length })}
          </h2>
          {hasEnded ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => removeEndedFeatured(), { success: (d) => t("endedRemoved", { count: d.removed }) })}
            >
              <Trash2 aria-hidden />
              {t("removeEnded")}
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Sparkles aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
                <Thumb src={item.photo} />
                <div className="min-w-0 flex-1">
                  <Link href={listingPath(item.publicId, item.title)} target="_blank" className="block truncate font-medium hover:underline">
                    <span dir="auto">{item.title}</span>
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Ltr>ID {item.publicId}</Ltr>
                    {item.city ? <span>{item.city}</span> : null}
                    {item.isDemo ? <Pill tone="demo">{t("demo")}</Pill> : null}
                    {item.ended ? (
                      <Pill tone="warning" icon={CalendarClock}>
                        {item.status !== "LIVE" ? t("notLive") : t("ended")}
                      </Pill>
                    ) : item.featuredUntil ? (
                      <Pill tone="success" icon={CalendarClock}>
                        {t("untilDate", { date: formatDate(item.featuredUntil, locale) })}
                      </Pill>
                    ) : null}
                  </p>
                </div>
                <ConfirmButton
                  label={t("remove")}
                  title={t("removeTitle")}
                  description={t("removeDescription")}
                  size="sm"
                  variant="outline"
                  onConfirm={() => run(() => removeFeaturedListing({ listingId: item.id }), { success: t("removed") })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
