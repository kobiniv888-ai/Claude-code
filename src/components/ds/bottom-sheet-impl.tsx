"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Drawer } from "vaul";
import { useReturnFocus } from "@/components/ui/use-return-focus";
import { cn } from "@/lib/utils";
import type { BottomSheetProps } from "./bottom-sheet";
import { useIsDesktop } from "./use-is-desktop";

/*
 * The sheet itself (vaul on phones, a Radix dialog from 768px). Import BottomSheet from
 * "./bottom-sheet": it loads this module (≈ 25 KB of vaul + Radix) only when a sheet first opens,
 * or once the page is idle.
 */

function SheetHeader({
  title,
  onClear,
  clearLabel,
  Title,
  Close,
}: {
  title: React.ReactNode;
  onClear?: () => void;
  clearLabel?: string;
  Title: typeof Drawer.Title | typeof DialogPrimitive.Title;
  Close: typeof Drawer.Close | typeof DialogPrimitive.Close;
}) {
  const t = useTranslations("ds.sheet");
  return (
    <div className="grid shrink-0 grid-cols-[minmax(2.75rem,auto)_1fr_minmax(2.75rem,auto)] items-center gap-2 border-b border-border px-2 pb-2">
      <Close asChild>
        <button
          type="button"
          aria-label={t("close")}
          className="inline-flex size-11 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-5" aria-hidden="true" />
        </button>
      </Close>
      <Title className="truncate text-center text-body font-semibold text-foreground">{title}</Title>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {clearLabel ?? t("clear")}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

const bodyClass = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter py-4";
const footerClass = "shrink-0 border-t border-border bg-card px-gutter pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";

/**
 * A bottom sheet on phones (slides up in 250ms over a dimmed page, drag handle, swipe down to close) and
 * a centered dialog — or an end-side panel — from 768px. Header: ×, title, optional "Clear";
 * a scrolling body; an optional pinned footer. Focus moves in and returns to the opener.
 *
 *   <BottomSheet open={open} onOpenChange={setOpen} title="סינון" onClear={reset}
 *     footer={<Button block onClick={apply}>הצגת 24 נכסים</Button>}>…</BottomSheet>
 */
export function BottomSheetImpl({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  onClear,
  clearLabel,
  footer,
  size = "auto",
  desktop = "dialog",
  className,
  onCloseAutoFocus,
  children,
}: BottomSheetProps) {
  const isDesktop = useIsDesktop();
  const returnFocus = useReturnFocus({ onCloseAutoFocus });

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-sheet) bg-(--scrim) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Content
            data-slot="bottom-sheet"
            {...(description ? {} : { "aria-describedby": undefined })}
            {...returnFocus}
            className={cn(
              "fixed z-(--z-sheet) flex flex-col border border-border bg-card pt-3 text-card-foreground shadow-raised outline-none duration-(--motion-base)",
              desktop === "side"
                ? "inset-y-0 end-0 w-full max-w-md rounded-s-sheet data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-end-8 data-closed:animate-out data-closed:fade-out-0"
                : "start-1/2 top-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-sheet rtl:translate-x-1/2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              desktop !== "side" && size === "full" && "h-[85vh]",
              className,
            )}
          >
            <SheetHeader title={title} onClear={onClear} clearLabel={clearLabel} Title={DialogPrimitive.Title} Close={DialogPrimitive.Close} />
            {description ? (
              <DialogPrimitive.Description className="px-gutter pt-3 text-small text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : null}
            <div className={bodyClass}>{children}</div>
            {footer ? <div className={cn(footerClass, desktop === "side" ? "" : "rounded-b-sheet")}>{footer}</div> : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay data-bayit-sheet="" className="fixed inset-0 z-(--z-sheet) bg-(--scrim)" />
        <Drawer.Content
          data-slot="bottom-sheet"
          data-bayit-sheet=""
          {...(description ? {} : { "aria-describedby": undefined })}
          {...returnFocus}
          className={cn(
            "fixed inset-x-0 bottom-0 z-(--z-sheet) flex flex-col rounded-t-sheet bg-card text-card-foreground shadow-sheet outline-none",
            size === "full" ? "h-[calc(100dvh-1rem)]" : "max-h-[90dvh]",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 mb-1.5 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
          <SheetHeader title={title} onClear={onClear} clearLabel={clearLabel} Title={Drawer.Title} Close={Drawer.Close} />
          {description ? (
            <Drawer.Description className="px-gutter pt-3 text-small text-muted-foreground">{description}</Drawer.Description>
          ) : null}
          <div className={bodyClass}>{children}</div>
          {footer ? <div className={footerClass}>{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
