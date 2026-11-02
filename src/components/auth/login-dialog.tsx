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
import { LogInIcon } from "lucide-react";
import { useIsDesktop } from "@/components/ds/use-is-desktop";
import { Button } from "@/components/ui/button";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link, useRouter } from "@/i18n/navigation";
import type { LoginConfig } from "@/lib/auth/config";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { afterLoadIdle } from "@/lib/idle";
import { loginSubtitleKey } from "@/lib/auth/login-subtitle";
import { cn } from "@/lib/utils";
import type { LoginStage } from "./login-panel";

// The dialog (Radix Dialog / vaul, the welcome illustration, then the form) is not part of the
// first load of every page: it loads once the page is idle, or at the first "Log in".
const loadLoginDialogSheet = () => import("./login-dialog-sheet");
const LoginDialogSheet = dynamic(() => loadLoginDialogSheet().then((m) => m.LoginDialogSheet), { ssr: false });

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
  /** Mount the (lazy) dialog: after the page is idle, or at the first open. */
  const [sheetWanted, setSheetWanted] = useState(false);
  useEffect(() => afterLoadIdle(() => setSheetWanted(true)), []);
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
    setSheetWanted(true);
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
  const description = t(loginSubtitleKey(config));

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
  return (
    <LoginDialogContext.Provider value={value}>
      {children}
      {sheetWanted && (
        <LoginDialogSheet
          open={open}
          onOpenChange={onOpenChange}
          onCloseAutoFocus={onCloseAutoFocus}
          isDesktop={isDesktop}
          hasSocial={hasSocial}
          title={title}
          description={description}
          stage={stage}
          onStageChange={setStage}
          config={config}
          next={next}
          onSuccess={onSuccess}
        />
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
    <Button asChild variant={variant} size={size} className={cn("rounded-button", className)}>
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
