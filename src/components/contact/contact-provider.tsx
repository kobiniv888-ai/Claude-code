"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRequireLogin } from "@/components/auth/login-dialog";
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
 * "Show contact" (login → revealContact), the first-contact safety tip, the ready message,
 * opening each app, and the email form.
 */

export type ContactListing = {
  id: string;
  publicId: number;
  /** In the guest's language. */
  title: string;
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
  /** Login if needed, then load the contact methods. */
  reveal: () => void;
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
      dates,
      guests: stay.guests ?? 0,
    });
  }, [listing.dealType, listing.title, listing.publicId, stay, locale, t]);

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
        const result = await revealContact(listing.id);
        if (!result.ok) {
          if (result.error === "blocked") setBlocked(true);
          showError(result.error);
          return null;
        }
        safetySeen.current = result.data.safetyTipSeen || storedSafetySeen();
        setSender(result.data.sender);
        setMethods(result.data.methods);
        return result.data.methods;
      } catch {
        showError("network");
        return null;
      } finally {
        setRevealing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [methods, listing.id, showError]);

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

  const reveal = useCallback(() => {
    if (!enabled || methods) return;
    void requireLogin(() => load());
  }, [enabled, methods, requireLogin, load]);

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
