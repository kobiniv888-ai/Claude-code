"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { readDeviceRaw } from "@/lib/lists/device-store";
import { isAccountListsPath } from "@/lib/lists/paths";

/**
 * Places saved on this device while signed out go into the account as soon as a signed-in page
 * shows (round 3, brief 7.2: "merged into the account when they sign in"; lists-alerts-3),
 * whichever way the visitor signed in (the login window, /login, Google or Apple, the booking's
 * phone check). Without it they moved only at the next heart tap or on the saved page, and a
 * logout in between deleted them with the device's private data.
 *
 * Mounted once in the site frame. Nearly free on every page: one localStorage read; the merge code
 * loads only when the device holds something. Renders nothing; the page refreshes after a merge
 * so its hearts and counts come from the account.
 */
export function DeviceListsAutoMerge({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  useEffect(() => {
    // The saved page merges by itself and says so (DeviceListsMerge).
    if (!signedIn || !readDeviceRaw() || isAccountListsPath(window.location.pathname)) return;
    let live = true;
    void import("@/lib/lists/merge-client")
      .then(({ mergeDeviceListsIntoAccount }) => mergeDeviceListsIntoAccount())
      .then((outcome) => {
        if (live && outcome === "merged") router.refresh();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [signedIn, router]);
  return null;
}
