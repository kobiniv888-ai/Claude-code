"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { LogInIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Drawer } from "vaul";
import { useIsDesktop } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link, useRouter } from "@/i18n/navigation";
import type { LoginConfig } from "@/lib/auth/config";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";
import type { LoginStage } from "./login-panel";
import { LoginWelcome } from "./login-welcome";

// The login form (phone input with the country list and number rules) loads when the dialog
// opens, not with every page. The welcome block above it (door, headline, benefits) is light and
// shows at once.
const LoginPanel = dynamic(() => import("./login-panel").then((m) => m.LoginPanel), {
  loading: () => (
    <div aria-hidden className="grid gap-3">
      <Skeleton className="h-12 rounded-input" />
      <Skeleton className="h-12 rounded-full" />
    </div>
  ),
});

/**
 * Log in without leaving the page.
 *
 *   const requireLogin = useRequireLogin();
 *   <Button onClick={() => requireLogin(() => showContact())}>…</Button>
 *
 * Signed in: the action runs at once. Signed out: the login dialog opens, and the action runs
 * after a successful login (the page is refreshed first). Mount <LoginDialogProvider> (server
 * component, ./login-dialog-provider) once in the layout.
 */

type PendingAction = () => unknown;

type LoginDialogContextValue = {
  openLogin: (afterLogin?: PendingAction) => void;
  isSignedIn: () => Promise<boolean>;
};

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null);

/** Current locale-less path + query, to come back to after Google/Apple. */
function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return safeNextPath(`${window.location.pathname}${window.location.search}`, "/");
}

export function LoginDialogProviderClient({
  config,
  signedIn,
  children,
}: {
  config: LoginConfig;
  /** From the server's session (updated by router.refresh() after a login). */
  signedIn: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  // The server already knows whether the visitor is signed in, so no session request (and no
  // Better Auth client) is needed on page load; it is loaded only to double-check a "no".
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("/");
  const [stage, setStage] = useState<LoginStage>("start");
  /** Opened for an action ("Show contact"…): the headline says "Log in to continue". */
  const [forAction, setForAction] = useState(false);
  const pending = useRef<PendingAction | null>(null);
  // The button or link that opened the dialog. The phone field takes focus as soon as the dialog
  // mounts, so the dialog cannot tell on its own where to give focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);

  const openLogin = useCallback((afterLogin?: PendingAction) => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    pending.current = afterLogin ?? null;
    setForAction(!!afterLogin);
    setStage("start");
    setNext(currentPath());
    setOpen(true);
  }, []);

  const isSignedIn = useCallback(async () => {
    if (signedInRef.current) return true;
    const { authClient } = await import("@/lib/auth/client");
    const { data } = await authClient.getSession();
    return !!data;
  }, []);

  const value = useMemo(() => ({ openLogin, isSignedIn }), [openLogin, isSignedIn]);

  async function onSuccess() {
    const action = pending.current;
    pending.current = null;
    setOpen(false);
    router.refresh();
    if (action) await action();
  }

  const hasSocial = config.providers.google || config.providers.apple;
  const title = forAction
    ? t("dialogTitle")
    : t("title", { name: siteConfig.localizedName[locale as AppLocale] ?? siteConfig.name });
  const description = t(hasSocial ? "dialogSubtitle" : "dialogSubtitlePhoneOnly");

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) pending.current = null;
  };
  const onCloseAutoFocus = (event: Event) => {
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus({ preventScroll: true });
    }
  };
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
            onStageChange={setStage}
            // Desktop: straight into the phone field. Phones: no keyboard over the sheet at once.
            autoFocus={isDesktop && !hasSocial}
          />
        )}
      </div>
    </>
  );

  return (
    <LoginDialogContext.Provider value={value}>
      {children}
      {isDesktop ? (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-sheet) bg-(--scrim) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Content
              data-slot="login-dialog"
              onCloseAutoFocus={onCloseAutoFocus}
              className="fixed start-1/2 top-1/2 z-(--z-sheet) max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-sheet bg-card p-6 pt-5 text-card-foreground shadow-float outline-none duration-(--motion-base) rtl:translate-x-1/2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:p-7 sm:pt-6"
            >
              {content(DialogPrimitive.Title, DialogPrimitive.Description, DialogPrimitive.Close)}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ) : (
        <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
          <Drawer.Portal>
            <Drawer.Overlay data-bayit-sheet="" className="fixed inset-0 z-(--z-sheet) bg-(--scrim)" />
            <Drawer.Content
              data-slot="login-dialog"
              data-bayit-sheet=""
              onCloseAutoFocus={onCloseAutoFocus}
              className="fixed inset-x-0 bottom-0 z-(--z-sheet) flex max-h-[94dvh] flex-col rounded-t-sheet bg-card text-card-foreground shadow-sheet outline-none"
            >
              <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-border" />
              <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {content(Drawer.Title, Drawer.Description, Drawer.Close)}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </LoginDialogContext.Provider>
  );
}

/** Open the login dialog yourself (null outside <LoginDialogProvider>). */
export function useLoginDialog() {
  return useContext(LoginDialogContext);
}

/** Runs an action that needs a signed-in user — after logging in if necessary. */
export function useRequireLogin() {
  const context = useContext(LoginDialogContext);
  const router = useRouter();
  return useCallback(
    async (action: PendingAction) => {
      if (!context) {
        // No dialog on this page: use the login page and come back.
        router.push(withNext("/login", currentPath()));
        return;
      }
      if (await context.isSignedIn()) {
        await action();
        return;
      }
      context.openLogin(action);
    },
    [context, router],
  );
}

/** "Log in" button: opens the dialog when available, otherwise links to /login. */
export function LoginButton({
  className,
  variant = "outline",
  size = "default",
  children,
}: {
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  children?: ReactNode;
}) {
  const t = useTranslations("auth.menu");
  const context = useContext(LoginDialogContext);
  const router = useRouter();
  return (
    <Button asChild variant={variant} size={size} className={cn("rounded-full", className)}>
      <Link
        href="/login"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          if (context) context.openLogin();
          else router.push(withNext("/login", currentPath()));
        }}
      >
        <LogInIcon className="rtl:-scale-x-100" aria-hidden />
        {children ?? t("login")}
      </Link>
    </Button>
  );
}
