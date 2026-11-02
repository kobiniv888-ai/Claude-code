import { useTranslations } from "next-intl";
import { FlaskConicalIcon } from "lucide-react";
import type { CodeDisplayMode } from "@/lib/auth/code-display";

/**
 * A small strip on the login UI while login codes may be shown on screen: "development" (a local
 * dev server) or "test" (AUTH_TEST_MODE on localhost / a Codespaces preview). Never on the real site.
 */
export function TestModeStrip({ mode }: { mode: CodeDisplayMode | null }) {
  const t = useTranslations("auth.login");
  if (!mode) return null;
  return (
    <p
      role="note"
      className="flex items-center gap-2 rounded-input border border-dashed border-border-strong/60 bg-surface-muted px-3 py-2 text-xs font-medium text-foreground"
    >
      <FlaskConicalIcon className="size-4 shrink-0" aria-hidden />
      <span>{t(mode === "test" ? "testMode" : "devMode")}</span>
    </p>
  );
}
