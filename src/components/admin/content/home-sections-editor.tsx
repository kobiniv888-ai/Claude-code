"use client";

import { ArrowDown, ArrowUp, ExternalLink, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { moveItem } from "@/lib/admin/content/order";
import { saveHomeSections } from "@/lib/admin/content/actions/home";
import type { HomeSectionKey } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useContentAction } from "./use-content-action";

type Section = { key: HomeSectionKey; enabled: boolean };

/** Toggle and reorder the home page sections (settings.homeSections). */
export function HomeSectionsEditor({ initial, defaults }: { initial: Section[]; defaults: Section[] }) {
  const t = useTranslations("adminContent.home");
  const { run, pending } = useContentAction();
  const [sections, setSections] = useState<Section[]>(initial);
  const [announce, setAnnounce] = useState("");
  const dirty = JSON.stringify(sections) !== JSON.stringify(initial);
  const enabledCount = sections.filter((s) => s.enabled).length;

  const move = (index: number, delta: -1 | 1) => {
    const next = moveItem(sections, index, delta);
    if (next === sections) return;
    setSections(next);
    setAnnounce(t("moved", { section: t(`sections.${sections[index].key}.title`), position: index + delta + 1 }));
  };

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ol className="flex flex-col gap-2">
        {sections.map((section, index) => {
          const title = t(`sections.${section.key}.title`);
          return (
            <li
              key={section.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs transition-opacity",
                !section.enabled && "bg-muted/50",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                {index + 1}
              </span>
              <div className={cn("min-w-0 flex-1", !section.enabled && "opacity-60")}>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{t(`sections.${section.key}.description`)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("moveUp", { section: title })}
                  title={t("moveUp", { section: title })}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("moveDown", { section: title })}
                  title={t("moveDown", { section: title })}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Switch
                  className="ms-2"
                  checked={section.enabled}
                  onCheckedChange={(enabled) =>
                    setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, enabled } : s)))
                  }
                  aria-label={t("show", { section: title })}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {enabledCount === 0 ? <p className="text-sm text-warning">{t("allHidden")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setSections(defaults)} disabled={pending}>
            <RotateCcw aria-hidden />
            {t("reset")}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/" target="_blank" rel="noopener">
              <ExternalLink aria-hidden />
              {t("preview")}
            </Link>
          </Button>
        </div>
        <Button
          type="button"
          disabled={!dirty || pending}
          onClick={() => run(() => saveHomeSections({ sections }), { success: t("saved") })}
        >
          <Save aria-hidden />
          {t("save")}
        </Button>
      </div>
      {dirty ? <p className="text-xs text-muted-foreground">{t("unsaved")}</p> : null}
    </div>
  );
}
