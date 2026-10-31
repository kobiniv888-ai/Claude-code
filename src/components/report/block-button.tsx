"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BanIcon, CircleCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { useRequireLogin } from "@/components/auth/login-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { blockUser, unblockUser } from "@/lib/reports/actions";

/** Block / Unblock a user. A blocked pair cannot see each other's contact details. */
export function BlockButton({ userId, name, initialBlocked }: { userId: string; name: string; initialBlocked: boolean }) {
  const t = useTranslations("report.block");
  const te = useTranslations("errors");
  const requireLogin = useRequireLogin();
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function apply(next: boolean) {
    setPending(true);
    try {
      const result = next ? await blockUser(userId) : await unblockUser(userId);
      if (!result.ok) {
        toast.error(te(errorMessageKey(result.error)));
        return;
      }
      setBlocked(result.data.blocked);
      toast.success(result.data.blocked ? t("blocked", { name }) : t("unblocked", { name }));
      router.refresh();
    } catch {
      toast.error(te("network"));
    } finally {
      setPending(false);
      setConfirm(false);
    }
  }

  const onClick = () => {
    void requireLogin(() => {
      if (blocked) void apply(false);
      else setConfirm(true);
    });
  };

  return (
    <>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onClick} disabled={pending} aria-pressed={blocked}>
        {blocked ? <CircleCheckIcon aria-hidden /> : <BanIcon aria-hidden />}
        {blocked ? t("unblock") : t("block")}
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>{t("confirmTitle", { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void apply(true);
              }}
              disabled={pending}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
