"use client";

import { useEffect } from "react";
import type { ToasterProps } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { takeLoggedOutFlag } from "@/lib/auth/device-data";
import { toast, toasterMounted } from "@/lib/toast";

/**
 * sonner's <Toaster>, loaded by <AppToaster>; tells @/lib/toast once it is listening. Right after a
 * logout (src/lib/auth/logout.ts) the page it lands on says `loggedOutMessage` ("התנתקתם") once.
 */
export default function SonnerToaster({ loggedOutMessage, ...props }: ToasterProps & { loggedOutMessage?: string }) {
  useEffect(() => {
    // Runs after the <Toaster> inside has subscribed to new toasts.
    toasterMounted();
    if (loggedOutMessage && takeLoggedOutFlag()) toast.success(loggedOutMessage);
  }, [loggedOutMessage]);
  return <Toaster {...props} />;
}
