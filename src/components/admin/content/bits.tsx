"use client";

import type { LucideIcon } from "lucide-react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** A button that asks "Are you sure?" before running `onConfirm` (which resolves to success). */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  icon: Icon = Trash2,
  variant = "destructive",
  size = "default",
  iconOnly = false,
  disabled,
  className,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<boolean>;
  icon?: LucideIcon;
  variant?: "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "icon" | "icon-sm";
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("adminContent.common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled}
          className={className}
          aria-label={iconOnly ? label : undefined}
          title={iconOnly ? label : undefined}
        >
          <Icon aria-hidden />
          {iconOnly ? null : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const done = await onConfirm();
              setBusy(false);
              if (done) setOpen(false);
            }}
          >
            {confirmLabel ?? label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
