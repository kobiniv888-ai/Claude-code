"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import type { PledgeStatus } from "@/lib/pledge";
import { cn } from "@/lib/utils";
import { PledgeForm } from "./pledge-form";

type ReacceptBannerProps = {
  status: PledgeStatus;
  /** Wizard: go to the pledge step instead of opening the dialog. */
  onReview?: () => void;
  className?: string;
};

/**
 * Asks a host to accept the Bayit pledge: the new wording after a change (mustReaccept), or for
 * the first time. Renders nothing when the current version is accepted. Without `onReview`, the
 * button opens the pledge in a dialog and refreshes the page after accepting.
 */
export function ReacceptBanner({ status, onReview, className }: ReacceptBannerProps) {
  const t = useTranslations("pledge");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (status.isCurrent || done) return null;

  const title = status.mustReaccept ? t("reaccept.updatedTitle") : t("reaccept.firstTitle");
  const body = status.mustReaccept ? t("reaccept.updatedBody") : t("reaccept.firstBody");

  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-verified/30 bg-verified-soft p-4 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-background/80 text-verified dark:bg-background/40">
        <HeartHandshake className="size-6" aria-hidden />
      </span>
      <div className="grid flex-1 gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-pretty text-muted-foreground">{body}</p>
      </div>
      {onReview ? (
        <Button type="button" className="h-11 shrink-0" onClick={onReview}>
          {t("reaccept.action")}
        </Button>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <Button type="button" className="h-11 shrink-0" onClick={() => setOpen(true)}>
            {t("reaccept.action")}
          </Button>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{body}</DialogDescription>
            </DialogHeader>
            <PledgeForm
              status={{ ...status, mustReaccept: false }}
              onAccepted={() => {
                setOpen(false);
                setDone(true);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
