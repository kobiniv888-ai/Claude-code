"use client";

import { useEffect } from "react";
import type { ToasterProps } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { toasterMounted } from "@/lib/toast";

/** sonner's <Toaster>, loaded by <AppToaster>; tells @/lib/toast once it is listening. */
export default function SonnerToaster(props: ToasterProps) {
  useEffect(() => {
    // Runs after the <Toaster> inside has subscribed to new toasts.
    toasterMounted();
  }, []);
  return <Toaster {...props} />;
}
