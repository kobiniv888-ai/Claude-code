"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { useLocale } from "next-intl";
import { Turnstile as CloudflareTurnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { cn } from "@/lib/utils";

/**
 * Invisible CAPTCHA (Cloudflare Turnstile) for public forms.
 *
 *   const [token, setToken] = useState<string | null>(null);
 *   const captcha = useRef<TurnstileHandle>(null);
 *   <Turnstile ref={captcha} action="login" onToken={setToken} onExpire={() => setToken(null)} />
 *   // send `token` with the form; after a failed submit call captcha.current?.reset()
 *
 * Shown only when Cloudflare needs the visitor to click. Without
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (development) it renders nothing and reports the token "dev".
 */

export const DEV_TURNSTILE_TOKEN = "dev";

export type TurnstileHandle = {
  /** Get a fresh token (tokens are single-use). */
  reset: () => void;
};

type TurnstileProps = {
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  /** Ties the token to one form, checked on the server with verifyTurnstile(token, { expectedAction }). */
  action?: string;
  className?: string;
  ref?: Ref<TurnstileHandle>;
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
/** Languages Turnstile itself supports; others follow the browser. */
const TURNSTILE_LANGUAGES = new Set(["he", "en", "ru", "ar"]);

export function Turnstile({ onToken, onExpire, onError, action, className, ref }: TurnstileProps) {
  const locale = useLocale();
  const widget = useRef<TurnstileInstance | undefined>(undefined);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (!SITE_KEY) onTokenRef.current(DEV_TURNSTILE_TOKEN);
        else widget.current?.reset();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!SITE_KEY) onTokenRef.current(DEV_TURNSTILE_TOKEN);
  }, []);

  if (!SITE_KEY) return null;

  return (
    <CloudflareTurnstile
      ref={widget}
      siteKey={SITE_KEY}
      className={cn("empty:hidden", className)}
      options={{
        action,
        appearance: "interaction-only",
        size: "flexible",
        theme: "auto",
        language: TURNSTILE_LANGUAGES.has(locale) ? locale : "auto",
        refreshExpired: "auto",
      }}
      onSuccess={(token) => onTokenRef.current(token)}
      onExpire={() => onExpire?.()}
      onError={() => onError?.()}
    />
  );
}
