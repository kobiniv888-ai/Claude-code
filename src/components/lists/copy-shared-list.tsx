"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CopyPlusIcon, LoaderIcon } from "lucide-react";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { Button } from "@/components/ds/button";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { copySharedListAction } from "@/lib/lists/actions";
import { accountListPath } from "@/lib/lists/paths";
import { toast } from "@/lib/toast";
import { isListErrorCode } from "./list-text";

/**
 * "Copy to my lists" on a shared list (round 3, brief 7.2): signed out, the login dialog opens
 * first (sign up or log in) and the copy runs right after. The copy is a new list in the viewer's
 * account; places they had already saved stay in their own lists.
 */
export function CopySharedListButton({ token }: { token: string }) {
  const t = useTranslations("lists.shared");
  const tl = useTranslations("lists.saving");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const requireLogin = useRequireLogin();
  const [pending, setPending] = useState(false);

  const copy = () =>
    void requireLogin(async () => {
      setPending(true);
      try {
        const result = await copySharedListAction({ token });
        if (!result.ok) {
          toast.error(isListErrorCode(result.error) ? tl(`errors.${result.error}`) : te(errorMessageKey(result.error)));
          return;
        }
        const kept = result.data.alreadySaved;
        toast.success(t("copied"), kept > 0 ? { description: t("copiedKept", { count: kept, countText: formatNumber(kept, locale) }) } : undefined);
        router.push(accountListPath(result.data.listId));
      } catch {
        toast.error(tl("errors.failed"));
      } finally {
        setPending(false);
      }
    });

  return (
    <div className="grid gap-2 sm:max-w-md">
      <Button onClick={copy} disabled={pending} aria-busy={pending || undefined} className="justify-self-start">
        {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <CopyPlusIcon aria-hidden />}
        {pending ? t("copying") : t("copy")}
      </Button>
      <p className="text-small text-pretty text-muted-foreground">{t("copyHint")}</p>
    </div>
  );
}
