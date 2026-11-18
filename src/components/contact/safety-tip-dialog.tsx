"use client";

import { useLocale, useTranslations } from "next-intl";
import { BanknoteXIcon, LinkIcon, ShieldCheckIcon, VideoIcon, EyeIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { siteName } from "@/lib/seo";

/** The first-contact safety tip (BRIEF section 10), shown once per account and device. */
export function SafetyTipDialog({
  open,
  publicId,
  onAccept,
  onOpenChange,
}: {
  open: boolean;
  publicId: number;
  onAccept: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("contact.safety");
  const locale = useLocale();
  const points = [
    { icon: EyeIcon, text: t("point1") },
    { icon: BanknoteXIcon, text: t("point2") },
    { icon: LinkIcon, text: t("point3", { siteName: siteName(locale) }) },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <span className="mb-1 inline-flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary" aria-hidden>
            <ShieldCheckIcon className="size-6" />
          </span>
          <DialogTitle className="text-xl">{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-sm leading-relaxed">
              <Icon className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 rounded-xl bg-secondary/70 p-3 text-sm leading-relaxed">
          <VideoIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-semibold">{t("videoTitle")} </span>
            {t.rich("video", { id: publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button asChild variant="link" className="h-auto px-0">
            <Link href="/safety" target="_blank">
              {t("more")}
            </Link>
          </Button>
          <Button type="button" size="lg" className="h-11 rounded-xl px-6" onClick={onAccept} autoFocus>
            {t("understand")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
