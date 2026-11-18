"use client";

import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { toast } from "@/lib/toast";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/action";
import { errorMessageKey, type FieldErrors } from "@/lib/errors";
import { useStaffProof, withStaffProof } from "../staff-proof";

/**
 * Runs a content / settings / roles server action: toast on success or failure, refresh the
 * page data on success. Error codes: adminContent.errors.<code>, then the shared "errors".
 * Deleting asks for a fresh authenticator code first (SECURITY_REPORT 3.6.c, ../staff-proof.tsx).
 */
export function useContentAction() {
  const t = useTranslations("adminContent");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const proof = useStaffProof();
  const [pending, startTransition] = useTransition();

  const errorText = useCallback(
    (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : tErrors(errorMessageKey(code))),
    [t, tErrors],
  );

  const run = useCallback(
    <T,>(
      fn: () => Promise<ActionResult<T>>,
      opts: {
        success?: string | ((data: T) => string);
        onSuccess?: (data: T) => void;
        onError?: (code: string, fieldErrors?: FieldErrors) => void;
        refresh?: boolean;
      } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          try {
            const result = await withStaffProof(proof, fn);
            if (result.ok) {
              const message = typeof opts.success === "function" ? opts.success(result.data) : opts.success;
              if (message) toast.success(message);
              opts.onSuccess?.(result.data);
              if (opts.refresh !== false) router.refresh();
              resolve(true);
            } else {
              toast.error(result.error === "invalid_input" ? t("form.checkFields") : errorText(result.error));
              opts.onError?.(result.error, result.fieldErrors);
              resolve(false);
            }
          } catch {
            toast.error(tErrors("network"));
            resolve(false);
          }
        });
      }),
    [errorText, proof, router, t, tErrors],
  );

  return { run, pending, errorText };
}
