"use client";

import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/action";
import { errorMessageKey } from "@/lib/errors";

/**
 * Runs an admin server action: shows a toast, refreshes the page data on success and turns
 * error codes into text (admin.errors.<code>, then the shared "errors" namespace).
 */
export function useAdminAction() {
  const t = useTranslations("admin");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const errorText = useCallback(
    (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : tErrors(errorMessageKey(code))),
    [t, tErrors],
  );

  const run = useCallback(
    <T,>(
      fn: () => Promise<ActionResult<T>>,
      opts: { success?: string; onSuccess?: (data: T) => void; onError?: (code: string) => void } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          try {
            const result = await fn();
            if (result.ok) {
              if (opts.success) toast.success(opts.success);
              opts.onSuccess?.(result.data);
              router.refresh();
              resolve(true);
            } else {
              toast.error(errorText(result.error));
              opts.onError?.(result.error);
              resolve(false);
            }
          } catch {
            toast.error(tErrors("network"));
            resolve(false);
          }
        });
      }),
    [errorText, router, tErrors],
  );

  return { run, pending, errorText };
}
