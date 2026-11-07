import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { InlineScript } from "@/components/common/inline-script";
import type { AppLocale } from "@/config/site";
import { getCityNames, getContinueData } from "@/lib/home/continue";
import { HOME_HISTORY_SCRIPT } from "@/lib/home/history-hint";
import type { ContinueLabels } from "./continue-block";
import { CONTINUE_ACCOUNT_ATTR, ContinueBlockIsland } from "./continue-block-island";

/**
 * "המשך מאיפה שעצרתם" (round 3, brief 4), placed right under the search card and its promise
 * line. The block itself is built in the browser (guests' history is on their device); the inline
 * hint runs first so a returning visitor's block has its space before the page hydrates, and a
 * first visit gets nothing at all. Its code loads at once when the block will show (device history,
 * or a signed-in account: the wrapper's marker), otherwise after the first interaction or idle
 * (./continue-block-island.tsx).
 */
export async function ContinueSection({
  locale,
  userId,
  deals,
  guestCounts,
}: {
  locale: AppLocale;
  userId: string | null;
  deals: Record<string, string>;
  guestCounts: string[];
}) {
  const [t, tCommon, nonce, data, cityNames] = await Promise.all([
    getTranslations({ locale, namespace: "home.continue" }),
    getTranslations({ locale, namespace: "common" }),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    getContinueData(userId).catch((error: unknown) => {
      console.error("[home] could not load the account's history:", error);
      return { recent: null, savedCount: 0 };
    }),
    getCityNames(locale).catch(() => ({})),
  ]);

  const labels: ContinueLabels = {
    title: t("title"),
    lastSearch: t("lastSearch"),
    saved: data.savedCount > 0 ? t("saved", { count: data.savedCount }) : null,
    recent: t("recent"),
    clear: t("clear"),
    clearLabel: t("clearLabel"),
    cleared: t("cleared"),
    undo: t("undo"),
    error: t("error"),
    retry: tCommon("retry"),
    loading: tCommon("loading"),
    deals,
    guestCounts,
  };

  const block = <ContinueBlockIsland labels={labels} account={data.recent} savedCount={data.savedCount} cityNames={cityNames} />;
  return (
    <>
      <InlineScript nonce={nonce} html={HOME_HISTORY_SCRIPT} />
      {/* Signed in: the account's places (and merging this device's into it) need the code now. */}
      {data.recent !== null ? (
        <div {...{ [CONTINUE_ACCOUNT_ATTR]: "" }} className="contents">
          {block}
        </div>
      ) : (
        block
      )}
    </>
  );
}
