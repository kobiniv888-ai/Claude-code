"use client";

import { SupportError } from "@/components/tickets/support-error";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <SupportError error={error} retry={retry} />;
}
