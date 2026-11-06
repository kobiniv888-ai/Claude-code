"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TurnstileHandle } from "@/components/common/turnstile";
import { MISTAKE_CHECK_REFRESH, MISTAKE_CHECK_TITLE_ID } from "@/components/listing/mistake-check-panel";
import { scrollBehavior } from "@/lib/motion";
import { toast } from "@/lib/toast";
import { acceptRulesAndPublish } from "@/lib/wizard/actions";
import type { PublishOutcome } from "@/lib/wizard/types";
import type { PublishController } from "./step-props";

/** How long "פרסום" waits for the invisible CAPTCHA's token before asking the server anyway. */
const TOKEN_WAIT_MS = 10_000;

/** Scrolls an element of the step to the middle of the screen and focuses it. */
export function revealAndFocus(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  element.focus({ preventScroll: true });
}

/**
 * "פרסום" (bug 2.7): the big button in the bottom bar of the last step. The rules checkbox and the
 * invisible CAPTCHA stay in the step; this hook holds their state so both share it. A tap with
 * something missing shows the list of what is missing; without the rules accepted it focuses the
 * checkbox; otherwise it saves, waits for the CAPTCHA token and publishes.
 */
export function usePublish({
  listingId,
  initiallyAccepted,
  missingCount,
  flush,
  track,
  onPublished,
}: {
  listingId: string;
  initiallyAccepted: boolean;
  missingCount: number;
  flush: () => Promise<boolean>;
  track: <T>(promise: Promise<T>) => Promise<T>;
  onPublished: (outcome: PublishOutcome) => void;
}): PublishController {
  const t = useTranslations("wizard");
  const [accepted, setAcceptedState] = useState(initiallyAccepted);
  const [rulesError, setRulesError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const captcha = useRef<TurnstileHandle | null>(null);
  const captchaRef = useCallback((handle: TurnstileHandle | null) => {
    captcha.current = handle;
  }, []);
  const token = useRef<string | null>(null);
  const waiters = useRef<((token: string | null) => void)[]>([]);
  const running = useRef(false);

  const onToken = useCallback((value: string) => {
    token.current = value;
    const waiting = waiters.current;
    waiters.current = [];
    for (const resolve of waiting) resolve(value);
  }, []);
  const onExpire = useCallback(() => {
    token.current = null;
  }, []);

  const waitForToken = () =>
    token.current
      ? Promise.resolve(token.current)
      : new Promise<string | null>((resolve) => {
          const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined };
          const done = (value: string | null) => {
            clearTimeout(timer.id);
            waiters.current = waiters.current.filter((w) => w !== done);
            resolve(value);
          };
          timer.id = setTimeout(() => done(null), TOKEN_WAIT_MS);
          waiters.current.push(done);
        });

  const setAccepted = useCallback((value: boolean) => {
    setAcceptedState(value);
    if (value) setRulesError(false);
  }, []);

  // Errors the preview step's mistake check found (the server refuses to publish while any exist).
  const mistakeErrors = useRef(0);
  const setMistakeErrors = useCallback((count: number) => {
    mistakeErrors.current = count;
  }, []);
  // No toast here: it would sit over the bottom bar's button, and the panel itself says what to fix.
  const showMistakes = () => revealAndFocus(MISTAKE_CHECK_TITLE_ID);

  const publish = async () => {
    if (running.current) return;
    if (missingCount > 0) {
      revealAndFocus("missing-title");
      toast.error(t("publish.missingTitle"));
      return;
    }
    if (mistakeErrors.current > 0) {
      showMistakes();
      return;
    }
    if (!accepted) {
      setRulesError(true);
      revealAndFocus("rules-checkbox");
      return;
    }
    running.current = true;
    setPublishing(true);
    try {
      const saved = await flush();
      if (!saved) {
        toast.error(t("chrome.fixErrors"));
        return;
      }
      const captchaToken = await waitForToken();
      // Turnstile tokens are single-use.
      token.current = null;
      const result = await track(acceptRulesAndPublish(listingId, { rulesAccepted: true, turnstileToken: captchaToken })).catch(() => null);
      if (result?.ok) {
        onPublished(result.data);
        return;
      }
      captcha.current?.reset();
      const code = result ? result.error : "server_error";
      if (code === "listing_mistakes") {
        // Something changed since the check ran: run it again and show what blocks publishing.
        window.dispatchEvent(new Event(MISTAKE_CHECK_REFRESH));
        showMistakes();
        return;
      }
      toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.server_error"));
    } finally {
      running.current = false;
      setPublishing(false);
    }
  };

  return { accepted, setAccepted, rulesError, publishing, captchaRef, onToken, onExpire, publish, setMistakeErrors };
}
