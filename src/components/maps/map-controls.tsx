"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ListIcon, LoaderCircleIcon, LocateFixedIcon } from "lucide-react";
import { Chip } from "@/components/ds/chip";
import { SynagogueIcon } from "@/components/ds/jewish-icons";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COMMUNITY_LEGEND, PlaceTypeBadge } from "./community-layer";

/** Floating look shared by the map's pills: white (card) on the map, soft shadow, no outline. */
const FLOATING = "pointer-events-auto border-transparent shadow-raised";

export type MapStatus = { loading: boolean; count: number };

export type CommunityToggle = { on: boolean; loading: boolean; onToggle: () => void };

/**
 * The controls over the search map, in the page's reading direction:
 *
 *   [24 homes in this area]                 [Re-center]
 *   [Search as I move the map  ◯]   [Jewish community]
 *                                     legend (when on)
 *                    …map…
 *                   [List]            (phones)
 */
export function MapControls({
  status,
  searchAsMove,
  community,
  onRecenter,
}: {
  /** The "Loading…" / "24 homes in this area" chip (hidden when null). */
  status: MapStatus | null;
  /** "Search as I move the map" (hidden when the page does not offer it). */
  searchAsMove?: { checked: boolean; onChange: (on: boolean) => void };
  community: CommunityToggle;
  onRecenter: () => void;
}) {
  const t = useTranslations("map");
  const locale = useLocale();
  const switchId = useId();

  return (
    <div className="bayit-map-controls pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2" role="group" aria-label={t("controls.label")}>
      <div className="flex items-start justify-between gap-2">
        {status ? (
          <p
            aria-live="polite"
            className="pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground/90 px-3.5 text-small font-semibold text-background shadow-raised"
          >
            {status.loading ? (
              <>
                <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("status.loading")}
              </>
            ) : (
              t("status.inArea", { count: status.count, formatted: formatNumber(status.count, locale) })
            )}
          </p>
        ) : (
          <span />
        )}
        <Chip icon={LocateFixedIcon} onClick={onRecenter} title={t("controls.recenterLabel")} className={FLOATING}>
          {t("controls.recenter")}
        </Chip>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        {searchAsMove ? (
          <label
            htmlFor={switchId}
            className="pointer-events-auto flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full bg-card px-4 text-sm font-medium text-foreground shadow-raised"
          >
            {t("controls.searchAsMove")}
            <Switch id={switchId} checked={searchAsMove.checked} onCheckedChange={(on) => searchAsMove.onChange(on === true)} />
          </label>
        ) : (
          <span />
        )}
        <Chip
          pressed={community.on}
          icon={community.loading ? LoaderSpin : SynagogueIcon}
          onClick={community.onToggle}
          title={t("controls.communityHint")}
          aria-busy={community.loading || undefined}
          className={cn(FLOATING, "ms-auto", community.on && "border-navy")}
        >
          {t("controls.community")}
        </Chip>
      </div>
      {community.on && !community.loading ? <CommunityLegend /> : null}
      {community.loading ? (
        <span className="sr-only" role="status">
          {t("controls.communityLoading")}
        </span>
      ) : null}
    </div>
  );
}

function LoaderSpin({ className }: { className?: string }) {
  return <LoaderCircleIcon className={cn(className, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />;
}

function CommunityLegend() {
  const t = useTranslations("map.community.legend");
  return (
    <ul
      aria-label={t("label")}
      className="pointer-events-auto ms-auto flex w-fit flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full bg-card/95 py-1 ps-1.5 pe-3 text-caption font-medium text-foreground shadow-raised"
    >
      {COMMUNITY_LEGEND.map(({ key, type }) => (
        <li key={key} className="inline-flex items-center gap-1">
          <PlaceTypeBadge type={type} className="size-6! [&_svg]:size-3.5!" />
          {t(key)}
        </li>
      ))}
    </ul>
  );
}

/** Phones: back to the list of results (bottom center, like the "Map" pill on the list). */
export function ListPill({ onClick }: { onClick: () => void }) {
  const t = useTranslations("map.controls");
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("listLabel")}
      className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-navy-foreground shadow-raised outline-none transition-transform duration-(--motion-fast) ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100"
    >
      <ListIcon className="size-4.5" aria-hidden="true" />
      {t("list")}
    </button>
  );
}
