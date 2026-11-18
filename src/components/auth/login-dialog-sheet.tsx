"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Drawer } from "vaul";
import { Skeleton } from "@/components/ui/skeleton";
import type { LoginConfig } from "@/lib/auth/config";
import type { LoginStage } from "./login-panel";
import { LoginWelcome } from "./login-welcome";

// The login form (phone input with the country list and number rules) loads when the dialog
// opens, not with every page. The welcome block above it (door, headline, benefits) is light and
// shows at once.
const LoginPanel = dynamic(
  () => import("./login-panel").then((m) => m.LoginPanel),
  {
    loading: () => (
      <div aria-hidden className="grid gap-3">
        <Skeleton className="h-12 rounded-input" />
        <Skeleton className="h-12 rounded-full" />
      </div>
    ),
  },
);

/**
 * The login dialog itself (a centered dialog from 768px, a bottom sheet below), split from
 * <LoginDialogProviderClient> so Radix Dialog, vaul and the welcome illustration are not in the
 * first load of every page: the provider loads this module once the page is idle, or when the
 * dialog first opens. Same markup and behaviour as before the split.
 */
export function LoginDialogSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
  isDesktop,
  hasSocial,
  title,
  description,
  stage,
  onStageChange,
  config,
  next,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  isDesktop: boolean;
  hasSocial: boolean;
  title: string;
  description: string;
  stage: LoginStage;
  onStageChange: (stage: LoginStage) => void;
  config: LoginConfig;
  next: string;
  onSuccess: () => Promise<void>;
}) {
  const t = useTranslations("auth.login");
  const content = (
    Title: typeof Drawer.Title | typeof DialogPrimitive.Title,
    Description: typeof Drawer.Description | typeof DialogPrimitive.Description,
    Close: typeof Drawer.Close | typeof DialogPrimitive.Close,
  ) => (
    <>
      {/* First in the dialog, so it takes the initial focus on phones (no keyboard pops up). */}
      <Close asChild>
        <button
          type="button"
          aria-label={t("close")}
          className="absolute end-2 top-2 z-10 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-5" aria-hidden />
        </button>
      </Close>
      <LoginWelcome
        title={title}
        description={description}
        compact={stage !== "start"}
        Title={Title}
        Description={Description}
      />
      <div className="mt-5">
        {open && (
          <LoginPanel
            variant="dialog"
            config={config}
            next={next}
            onSuccess={onSuccess}
            onStageChange={onStageChange}
            // Desktop: straight into the phone field. Phones: no keyboard over the sheet at once.
            autoFocus={isDesktop && !hasSocial}
          />
        )}
      </div>
    </>
  );

  return isDesktop ? (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-sheet) bg-(--scrim) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          data-slot="login-dialog"
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed start-1/2 top-1/2 z-(--z-sheet) max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-sheet bg-card p-6 pt-5 text-card-foreground shadow-float outline-none duration-(--motion-base) rtl:translate-x-1/2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:p-7 sm:pt-6"
        >
          {content(
            DialogPrimitive.Title,
            DialogPrimitive.Description,
            DialogPrimitive.Close,
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  ) : (
    <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
      <Drawer.Portal>
        <Drawer.Overlay
          data-bayit-sheet=""
          className="fixed inset-0 z-(--z-sheet) bg-(--scrim)"
        />
        <Drawer.Content
          data-slot="login-dialog"
          data-bayit-sheet=""
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[94dvh] flex-col rounded-t-sheet bg-card text-card-foreground shadow-sheet outline-none"
        >
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-border"
          />
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {content(Drawer.Title, Drawer.Description, Drawer.Close)}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
