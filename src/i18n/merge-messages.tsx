"use client";

import { useMemo, type ReactNode } from "react";
import { NextIntlClientProvider, useLocale, useMessages, type AbstractIntlMessages } from "next-intl";
import { mergeMessages } from "./client-messages";

/**
 * Adds `messages` to the interface text of the provider above (next-intl's nested providers
 * replace it), so a route sends only what its own client components read on top of the shell's
 * set. Time zone, formats and error handling are inherited from the provider above.
 */
export function MergeMessages({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const locale = useLocale();
  const parent = useMessages();
  const merged = useMemo(() => mergeMessages(parent, messages), [parent, messages]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
