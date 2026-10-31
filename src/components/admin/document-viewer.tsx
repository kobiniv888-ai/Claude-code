"use client";

import { FileText, ImageOff, Maximize2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { documentUrl, isPdf, isViewableImage, type VerificationDocument } from "@/lib/admin/documents";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Verification documents, streamed from /api/admin/documents (staff only, never cached).
 * Images are shown large with zoom and rotate; PDFs open in a new tab.
 */
export function DocumentViewer({ requestId, documents }: { requestId: string; documents: VerificationDocument[] }) {
  const t = useTranslations("admin.verifications.documents");
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const current = documents[index];
  if (!current) return null;
  const url = documentUrl(requestId, index);
  const size = (bytes: number) =>
    bytes >= 1024 * 1024
      ? t("sizeMb", { size: formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 }) })
      : t("sizeKb", { size: formatNumber(Math.max(1, Math.round(bytes / 1024)), locale) });

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={t("label")} className="flex flex-wrap gap-2">
        {documents.map((doc, i) => (
          <button
            key={doc.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setZoom(1);
              setRotation(0);
            }}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              i === index ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted",
            )}
          >
            {isPdf(doc.mime) ? <FileText aria-hidden className="size-4" /> : null}
            {t(`kinds.${doc.kind}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {current.name ? <bdi dir="auto">{current.name}</bdi> : t(`kinds.${current.kind}`)} · {size(current.bytes)}
        </span>
        <div className="flex items-center gap-1">
          {isViewableImage(current.mime) ? (
            <>
              <Button type="button" variant="ghost" size="icon" aria-label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                <ZoomIn aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t("rotate")} onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw aria-hidden />
              </Button>
            </>
          ) : null}
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Maximize2 aria-hidden />
              {t("open")}
            </a>
          </Button>
        </div>
      </div>

      <div className="flex min-h-64 items-center justify-center overflow-auto rounded-lg border bg-muted/50 p-2">
        {isViewableImage(current.mime) && !failed[index] ? (
          // Staff-only, no-store document stream: not for the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={t(`kinds.${current.kind}`)}
            onError={() => setFailed((f) => ({ ...f, [index]: true }))}
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            className="max-h-[70vh] max-w-full origin-center object-contain transition-transform"
          />
        ) : isPdf(current.mime) ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <FileText aria-hidden className="size-10" />
            <p>{t("pdfHint")}</p>
            <Button asChild size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                {t("openPdf")}
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <ImageOff aria-hidden className="size-10" />
            <p>{failed[index] ? t("loadFailed") : t("noPreview")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
