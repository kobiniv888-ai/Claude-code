"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CloudOffIcon, FolderInputIcon, HeartIcon, HeartOffIcon, LogInIcon, MapPinIcon, PencilIcon, PlusIcon, SearchIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { PageHeader } from "@/components/common/page-header";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Chip, chipStyles } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import { OverflowMenu } from "@/components/ds/overflow-menu";
import { ListingCardSkeleton } from "@/components/ds/skeleton";
import { ListingCard } from "@/components/listing/listing-card";
import { siteConfig, type AppLocale } from "@/config/site";
import { useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { ListingCardData } from "@/lib/listing/types";
import { getDeviceCardsAction } from "@/lib/lists/actions";
import {
  DEVICE_DEFAULT_KEY,
  SHARED_LIST_MAX_PLACES,
  deviceCounts,
  deviceCreateList,
  deviceDeleteList,
  deviceRemove,
  deviceRenameList,
  reservedNameKeys,
  type DeviceLists,
} from "@/lib/lists/core";
import { newDeviceListKey, readDeviceLists, useDeviceLists, writeDeviceLists } from "@/lib/lists/device";
import { mergeDeviceListsIntoAccount } from "@/lib/lists/merge-client";
import { ACCOUNT_LISTS_PATH } from "@/lib/lists/paths";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ListNameSheet } from "./list-name-sheet";
import { displayListName, listNameArg, SAVED_LIST_HEADING_ID } from "./list-text";
import { useMoveSheet } from "./move-sheet";

const noSubscribe = () => () => {};
type Cards = { ids: string; status: "loading" | "ready" | "error"; cards: ListingCardData[] };

/**
 * /saved — "שמורים" for a signed-out visitor (round 3, brief 7.2): the lists this device keeps,
 * the same tabs, cards and actions as the account page, and a prompt to log in (the lists then go
 * into the account, and only then can a list be shared). Cards come from getDeviceCardsAction
 * (public listings only); places that are gone are counted and can be removed.
 */
export function DeviceListsView() {
  const ts = useTranslations("lists.saving");
  const td = useTranslations("lists.device");
  const tp = useTranslations("lists.page");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const requireLogin = useRequireLogin();
  const device = useDeviceLists();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [selectedKey, setSelectedKey] = useState(DEVICE_DEFAULT_KEY);
  const [sheet, setSheet] = useState<"create" | "rename" | "delete" | null>(null);
  const [cards, setCards] = useState<Cards>({ ids: "", status: "loading", cards: [] });
  const defaultName = ts("defaultName");

  const key = device.lists.some((list) => list.key === selectedKey) ? selectedKey : DEVICE_DEFAULT_KEY;
  const counts = deviceCounts(device);
  const ids = useMemo(
    () => device.items.filter((item) => item.listKey === key).slice(0, SHARED_LIST_MAX_PLACES).map((item) => item.listingId),
    [device, key],
  );
  const idsKey = ids.join(",");
  const selected = key === DEVICE_DEFAULT_KEY ? { name: "", isDefault: true } : { name: device.lists.find((l) => l.key === key)?.name ?? "", isDefault: false };
  const selectedName = displayListName(selected, defaultName);

  // Fetch only when the list shows a place whose card is not here yet (removing one does not refetch).
  const fetched = useMemo(() => new Set(cards.ids ? cards.ids.split(",") : []), [cards.ids]);
  const fetchKey = ids.some((id) => !fetched.has(id)) ? idsKey : null;
  useEffect(() => {
    if (!fetchKey) return;
    let live = true;
    void getDeviceCardsAction(fetchKey.split(","))
      .then((result) => {
        if (live) setCards(result.ok ? { ids: fetchKey, status: "ready", cards: result.data } : { ids: fetchKey, status: "error", cards: [] });
      })
      .catch(() => {
        if (live) setCards({ ids: fetchKey, status: "error", cards: [] });
      });
    return () => {
      live = false;
    };
  }, [fetchKey]);

  const ready = fetchKey === null && cards.status === "ready";
  const failed = fetchKey === null && cards.status === "error";
  // Cards of places still in the list (an un-saved heart removes its card at once).
  const shown = ready ? cards.cards.filter((card) => ids.includes(card.id)) : [];
  const gone = ready ? ids.filter((id) => !cards.cards.some((card) => card.id === id)) : [];
  // The cards follow the device copy: a moved or removed place leaves the list by itself.
  const { openMove, moveSheet } = useMoveSheet({ order: shown.map((card) => card.id) });
  /** The default list's names the visitor's lists may not take (lists-alerts-10). */
  const reserved = reservedNameKeys([defaultName]);

  const write = (next: DeviceLists) => {
    if (!writeDeviceLists(next)) toast.error(ts("errors.storage_blocked"));
  };
  const logIn = () =>
    void requireLogin(async () => {
      await mergeDeviceListsIntoAccount();
      router.replace(ACCOUNT_LISTS_PATH);
    });

  const empty = hydrated && device.items.length === 0 && device.lists.length === 0;

  return (
    <div className="pb-10">
      <PageHeader title={td("title")} description={tp("lead")} />

      <section aria-labelledby="device-lists-banner" className="mb-5 flex flex-col gap-3 rounded-card border border-primary-tint-border bg-primary-tint px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CloudOffIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          <div className="grid gap-0.5">
            <h2 id="device-lists-banner" className="text-body font-semibold">
              {td("bannerTitle")}
            </h2>
            <p className="text-small text-pretty">{td("bannerBody")}</p>
          </div>
        </div>
        <Button className="shrink-0 self-start sm:self-center" onClick={logIn}>
          <LogInIcon aria-hidden className="rtl:-scale-x-100" />
          {td("login")}
        </Button>
      </section>

      {!hydrated ? (
        <div role="status" className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">{ts("sheet.loading")}</span>
          {[0, 1, 2].map((i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : empty ? (
        <EmptyState
          icon={HeartIcon}
          title={td("emptyTitle")}
          description={td("emptyBody")}
          action={{ label: td("startSearching"), href: "/search", icon: SearchIcon }}
          quickFixes={siteConfig.cities
            .filter((city) => city.popular)
            .slice(0, 3)
            .map((city) => ({ label: city.names[locale], href: `/search?city=${city.slug}`, icon: MapPinIcon }))}
          className="rounded-card bg-card px-6 shadow-raised ring-1 ring-foreground/5"
        />
      ) : (
        <>
          <nav aria-label={tp("tabsLabel")} className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <ul className="flex w-max items-center gap-2 py-1.5">
              {[{ key: DEVICE_DEFAULT_KEY, name: "", isDefault: true }, ...device.lists.map((list) => ({ key: list.key, name: list.name, isDefault: false }))].map((list) => {
                const current = list.key === key;
                return (
                  <li key={list.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(list.key)}
                      aria-pressed={current}
                      className={cn(chipStyles({ active: current }), "max-w-64 gap-2")}
                    >
                      <span dir="auto" className="truncate">
                        {displayListName(list, defaultName)}
                      </span>
                      <span className={cn("text-xs tabular-nums", current ? "text-primary-text" : "text-muted-foreground")}>
                        {formatNumber(counts[list.key] ?? 0, locale)}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <Chip icon={PlusIcon} onClick={() => setSheet("create")} aria-haspopup="dialog">
                  {tp("newList")}
                </Chip>
              </li>
            </ul>
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-border bg-card px-4 py-3">
            <div className="grid min-w-0 gap-0.5">
              <h2 id={SAVED_LIST_HEADING_ID} tabIndex={-1} className="truncate text-h3 font-semibold outline-none">
                <span dir="auto">{selectedName}</span>
              </h2>
              <p className="text-small text-muted-foreground">{ts("count", { count: counts[key] ?? 0, countText: formatNumber(counts[key] ?? 0, locale) })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="h-11" onClick={logIn} aria-haspopup="dialog">
                <Share2Icon aria-hidden />
                {td("share")}
              </Button>
              {selected.isDefault ? null : (
                // The menu's code loads at the first tap (speed-1).
                <OverflowMenu
                  key={key}
                  label={tp("more", { name: listNameArg(selectedName) })}
                  variant="ghost"
                  icon="vertical"
                  side="bottom"
                  contentClassName="min-w-48"
                  items={[
                    { key: "rename", icon: <PencilIcon className="size-4" aria-hidden />, label: tp("rename"), onSelect: () => setSheet("rename") },
                    { key: "delete", icon: <Trash2Icon className="size-4" aria-hidden />, label: tp("delete"), onSelect: () => setSheet("delete"), tone: "destructive" },
                  ]}
                />
              )}
            </div>
          </div>

          <div className="mt-6">
            {ids.length === 0 ? (
              <EmptyState
                icon={HeartIcon}
                title={tp("emptyTitle")}
                description={tp("emptyBody")}
                action={{ label: td("startSearching"), href: "/search", icon: SearchIcon }}
                className="rounded-card bg-card px-6 shadow-raised ring-1 ring-foreground/5"
              />
            ) : failed ? (
              <div className="grid justify-items-start gap-3 rounded-card bg-surface-muted p-4">
                <p role="alert" className="text-small">
                  {td("loadError")}
                </p>
                <Button variant="secondary" onClick={() => setCards({ ids: "", status: "loading", cards: [] })}>
                  {ts("sheet.retry")}
                </Button>
              </div>
            ) : !ready ? (
              <div role="status" className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                <span className="sr-only">{ts("sheet.loading")}</span>
                {ids.slice(0, 3).map((id) => (
                  <ListingCardSkeleton key={id} />
                ))}
              </div>
            ) : (
              <>
                <ul className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((card) => (
                    <li key={card.id} className="flex min-w-0 flex-col gap-2">
                      <ListingCard listing={card} />
                      <div className="flex flex-wrap justify-end gap-1">
                        <DeviceMoveButton listingId={card.id} title={card.title} onMove={openMove} />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 rounded-full px-3 text-muted-foreground"
                          onClick={() => {
                            write(deviceRemove(readDeviceLists(), card.id));
                            toast(td("removed"));
                          }}
                        >
                          <HeartOffIcon aria-hidden />
                          {ts("sheet.remove")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                {gone.length > 0 ? (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed bg-muted/40 px-4 py-3">
                    <p className="text-small text-muted-foreground">{td("unavailable", { count: gone.length, countText: formatNumber(gone.length, locale) })}</p>
                    <Button
                      variant="secondary"
                      onClick={() => write(gone.reduce((state, id) => deviceRemove(state, id), readDeviceLists()))}
                    >
                      {td("clearUnavailable")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
      {moveSheet}

      <ListNameSheet
        open={sheet === "create"}
        onOpenChange={(open) => setSheet(open ? "create" : null)}
        title={tp("createTitle")}
        action={tp("createAction")}
        onSubmit={async (name) => {
          const made = deviceCreateList(readDeviceLists(), name, newDeviceListKey(), undefined, reserved);
          if (!made.ok) return ts(`errors.${made.error === "not_found" ? "failed" : made.error}`);
          if (!writeDeviceLists(made.state)) return ts("errors.storage_blocked");
          setSheet(null);
          setSelectedKey(made.key);
          toast.success(tp("created", { name: listNameArg(made.state.lists.find((list) => list.key === made.key)?.name ?? name.trim()) }));
          return null;
        }}
      />
      {selected.isDefault ? null : (
        <>
          <ListNameSheet
            key={key}
            open={sheet === "rename"}
            onOpenChange={(open) => setSheet(open ? "rename" : null)}
            title={tp("renameTitle")}
            action={tp("renameAction")}
            initial={selected.name}
            onSubmit={async (name) => {
              const renamed = deviceRenameList(readDeviceLists(), key, name, reserved);
              if (!renamed.ok) return ts(`errors.${renamed.error === "not_found" ? "failed" : renamed.error}`);
              if (!writeDeviceLists(renamed.state)) return ts("errors.storage_blocked");
              setSheet(null);
              toast.success(tp("renamed"));
              return null;
            }}
          />
          <BottomSheet
            open={sheet === "delete"}
            onOpenChange={(open) => setSheet(open ? "delete" : null)}
            title={tp("deleteTitle", { name: listNameArg(selectedName) })}
            footer={
              <div className="flex gap-2">
                <Button variant="outline" className="min-w-0 flex-1" onClick={() => setSheet(null)}>
                  <span className="truncate">{ts("sheet.cancel")}</span>
                </Button>
                <Button
                  className="min-w-0 flex-1 bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    write(deviceDeleteList(readDeviceLists(), key));
                    setSheet(null);
                    setSelectedKey(DEVICE_DEFAULT_KEY);
                    toast.success(tp("deleted"));
                  }}
                >
                  <Trash2Icon aria-hidden />
                  <span className="truncate">{tp("deleteConfirm")}</span>
                </Button>
              </div>
            }
          >
            <p className="text-body text-pretty">
              {tp("deleteBody", { count: counts[key] ?? 0, countText: formatNumber(counts[key] ?? 0, locale), defaultName })}
            </p>
          </BottomSheet>
        </>
      )}
    </div>
  );
}

/** "Move": opens the view's one list sheet (useMoveSheet). */
function DeviceMoveButton({ listingId, title, onMove }: { listingId: string; title: string; onMove: (listingId: string, title: string) => void }) {
  const t = useTranslations("lists.page");
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 rounded-full px-3 text-muted-foreground"
      onClick={() => onMove(listingId, title)}
      aria-label={t("moveFor", { title })}
      aria-haspopup="dialog"
      data-move-for={listingId}
    >
      <FolderInputIcon aria-hidden className="rtl:-scale-x-100" />
      {t("move")}
    </Button>
  );
}
