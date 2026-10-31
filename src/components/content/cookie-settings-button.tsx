"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Clears the saved cookie choice and reloads, so the consent banner asks again. */
export function CookieSettingsButton({ label }: { label: string }) {
  function reset() {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `bayit_consent=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    window.location.reload();
  }
  return (
    <Button type="button" variant="outline" size="lg" onClick={reset} className="h-11 rounded-xl px-4">
      <SlidersHorizontal aria-hidden="true" />
      {label}
    </Button>
  );
}
