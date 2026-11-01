"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import type { DealType } from "@/generated/prisma/enums";
import { revealContact, recordContactTap, markSafetyTipSeen } from "@/lib/contact/actions";
import { buildChannelHref, channelCopiesMessage, channelOpensNewTab, type RevealedContact } from "@/lib/contact/links";
import { messageVariant, type StayRequest } from "@/lib/contact/message";
import { errorMessageKey } from "@/lib/errors";
import { formatDate, formatDateRange } from "@/lib/format";
import type { ContactChannelKey } from "@/lib/listing/fields";
import { siteName } from "@/lib/seo";
import { EmailContactDialog } from "./email-contact-dialog";
import { SafetyTipDialog } from "./safety-tip-dialog";

/**
 * Contact state shared by the sidebar box and the phone bottom bar of one listing page:
 * "Show contact" (login → invisible CAPTCHA → revealContact), the first-contact safety tip,
 * the ready message, opening each app, and the email form.
 *
 * The CAPTCHA (Turnstile, action "reveal_contact") is mounted on the first "Show contact", so
 * listing pages do not load it for visitors who never ask; without a site key it answers at once.
 */

/** How long "Show contact" waits for the CAPTCHA (the visitor may have to tick a box). */
const CAPTCHA_TIMEOUT_MS = 60_000;

export type ContactListing = {
  id: string;
  publicId: number;
  /** In the guest's language. */
  title: string;
  /** The listing's full address (https://…/he/listing/1234-…), put into the ready message. */
  url: string;
  dealType: DealType;
  /** Channel types in the owner's order (no values). */
  channels: ContactChannelKey[];
};

export type ContactAvailability = "ok" | "preview" | "own" | "blocked";

type ContactContextValue = {
  listing: ContactListing;
  availability: ContactAvailability;
  methods: RevealedContact[] | null;
  revealing: boolean;
  /** Login if needed, then load the contact methods (then `onDone` with them, e.g. open a sheet). */
  reveal: (onDone?: (methods: RevealedContact[]) => void) => void;
  /** Tap on a channel button: login → reveal → safety tip (first time) → count → open the app. */
  contact: (channel: ContactChannelKey) => void;
  message: string;
};

const ContactContext = createContext<ContactContextValue | null>(null);

export function useContact(): ContactContextValue {
  const value = useContext(ContactContext);
  if (!value) throw new Error("useContact must be used inside <ContactProvider>");
  return value;
}

const SAFETY_STORAGE_KEY = "bayit:safety-tip-seen";

function storedSafetySeen(): boolean {
  try {
    return window.localStorage.getItem(SAFETY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeSafetySeen() {
  try {
    window.localStorage.setItem(SAFETY_STORAGE_KEY, "1");
  } catch {
    // Private mode — the account flag is enough.
  }
}

/** Opens a link from code. Popup blockers may refuse a new tab after an await: then use this tab. */
function openHref(href: string, newTab: boolean) {
  if (newTab) {
    const win = window.open(href, "_blank");
    if (win) {
      win.opener = null;
      return;
    }
  }
  window.location.assign(href);
}

export function ContactProvider({
  listing,
  availability,
  stay,
  shabbatModeActive,
  children,
}: {
  listing: ContactListing;
  availability: ContactAvailability;
  stay: StayRequest;
  /** Site-wide Shabbat mode: the email form is paused. */
  shabbatModeActive: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("contact");
  const te = useTranslations("errors");
  const locale = useLocale();
  const requireLogin = useRequireLogin();
  const [methods, setMethods] = useState<RevealedContact[] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sender, setSender] = useState<{ name: string; email: string | null }>({ name: "", email: null });
  const safetySeen = useRef(false);
  const [safetyFor, setSafetyFor] = useState<RevealedContact | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const inFlight = useRef<Promise<RevealedContact[] | null> | null>(null);
  const [captchaOn, setCaptchaOn] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);
  const captchaToken = useRef<string | null>(null);
  const captchaWaiters = useRef<((token: string | null) => void)[]>([]);

  const onCaptchaToken = useCallback((token: string | null) => {
    const waiters = captchaWaiters.current;
    captchaWaiters.current = [];
    // Tokens are single-use: hand a fresh one to whoever waits, keep it otherwise.
    if (waiters.length > 0) {
      captchaToken.current = null;
      waiters.forEach((resolve) => resolve(token));
    } else {
      captchaToken.current = token;
    }
  }, []);

  /** A Turnstile token for one reveal (null when the check failed or timed out). */
  const nextCaptchaToken = useCallback((): Promise<string | null> => {
    const ready = captchaToken.current;
    if (ready) {
      captchaToken.current = null;
      return Promise.resolve(ready);
    }
    setCaptchaOn(true);
    return new Promise((resolve) => {
      const done = (token: string | null) => {
        clearTimeout(timer);
        resolve(token);
      };
      const timer = setTimeout(() => {
        captchaWaiters.current = captchaWaiters.current.filter((waiter) => waiter !== done);
        resolve(null);
      }, CAPTCHA_TIMEOUT_MS);
      captchaWaiters.current.push(done);
    });
  }, []);

  const message = useMemo(() => {
    const variant = messageVariant(listing.dealType, stay);
    const dates =
      stay.checkIn && stay.checkOut
        ? formatDateRange(stay.checkIn, stay.checkOut, locale)
        : stay.checkIn
          ? formatDate(stay.checkIn, locale, { day: "numeric", month: "long" })
          : "";
    return t(`message.${variant}`, {
      title: listing.title,
      id: listing.publicId,
      siteName: siteName(locale),
      url: listing.url,
      dates,
      guests: stay.guests ?? 0,
    });
  }, [listing.dealType, listing.title, listing.publicId, listing.url, stay, locale, t]);

  const showError = useCallback(
    (code: string) => {
      toast.error(t.has(`errors.${code}`) ? t(`errors.${code}` as never) : te(errorMessageKey(code)));
    },
    [t, te],
  );

  const load = useCallback(async (): Promise<RevealedContact[] | null> => {
    if (methods) return methods;
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRevealing(true);
      try {
        const token = await nextCaptchaToken();
        if (!token) {
          captcha.current?.reset();
          showError("captcha_failed");
          return null;
        }
        const result = await revealContact(listing.id, token);
        if (!result.ok) {
          captcha.current?.reset();
          if (result.error === "blocked") setBlocked(true);
          showError(result.error);
          return null;
        }
        safetySeen.current = result.data.safetyTipSeen || storedSafetySeen();
        setSender(result.data.sender);
        setMethods(result.data.methods);
        return result.data.methods;
      } catch {
        captcha.current?.reset();
        showError("network");
        return null;
      } finally {
        setRevealing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [methods, listing.id, showError, nextCaptchaToken]);

  const open = useCallback(
    (method: RevealedContact) => {
      void recordContactTap(listing.id, method.channel).catch(() => undefined);
      if (method.channel === "EMAIL") {
        setEmailOpen(true);
        return;
      }
      const href = buildChannelHref(method.channel, method.value, message);
      if (!href) {
        showError("unavailable");
        return;
      }
      const app = t(`channel.${method.channel}`);
      if (channelCopiesMessage(method.channel)) {
        navigator.clipboard
          ?.writeText(message)
          .then(() => toast.success(t("copied", { app })))
          .catch(() => toast.message(t("copyFailed", { app })));
      }
      openHref(href, channelOpensNewTab(method.channel));
    },
    [listing.id, message, showError, t],
  );

  const proceed = useCallback(
    (list: RevealedContact[], channel: ContactChannelKey) => {
      const method = list.find((m) => m.channel === channel);
      if (!method) {
        showError("unavailable");
        return;
      }
      if (!safetySeen.current && !storedSafetySeen()) {
        setSafetyFor(method);
        return;
      }
      open(method);
    },
    [open, showError],
  );

  const enabled = availability === "ok" && !blocked;

  const reveal = useCallback(
    (onDone?: (list: RevealedContact[]) => void) => {
      if (!enabled) return;
      if (methods) {
        onDone?.(methods);
        return;
      }
      void requireLogin(async () => {
        const list = await load();
        if (list) onDone?.(list);
      });
    },
    [enabled, methods, requireLogin, load],
  );

  const contact = useCallback(
    (channel: ContactChannelKey) => {
      if (!enabled) return;
      // Already revealed: stay inside the click, so the app opens without a popup warning.
      if (methods) {
        proceed(methods, channel);
        return;
      }
      void requireLogin(async () => {
        const list = await load();
        if (list) proceed(list, channel);
      });
    },
    [enabled, methods, proceed, requireLogin, load],
  );

  const acceptSafety = useCallback(() => {
    const method = safetyFor;
    safetySeen.current = true;
    storeSafetySeen();
    setSafetyFor(null);
    void markSafetyTipSeen().catch(() => undefined);
    if (method) open(method);
  }, [safetyFor, open]);

  const value = useMemo<ContactContextValue>(
    () => ({
      listing,
      availability: blocked ? "blocked" : availability,
      methods,
      revealing,
      reveal,
      contact,
      message,
    }),
    [listing, blocked, availability, methods, revealing, reveal, contact, message],
  );

  return (
    <ContactContext.Provider value={value}>
      {children}
      {captchaOn ? (
        // Turnstile shows itself only when Cloudflare needs the visitor to tick a box.
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 empty:hidden">
          <Turnstile
            ref={captcha}
            action="reveal_contact"
            onToken={onCaptchaToken}
            onExpire={() => {
              captchaToken.current = null;
            }}
            onError={() => onCaptchaToken(null)}
            className="pointer-events-auto"
          />
        </div>
      ) : null}
      <SafetyTipDialog
        open={safetyFor !== null}
        publicId={listing.publicId}
        onAccept={acceptSafety}
        onOpenChange={(next) => {
          if (!next) setSafetyFor(null);
        }}
      />
      <EmailContactDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        listingId={listing.id}
        defaultName={sender.name}
        defaultEmail={sender.email ?? ""}
        defaultMessage={message}
        stay={stay}
        paused={shabbatModeActive}
      />
    </ContactContext.Provider>
  );
}
