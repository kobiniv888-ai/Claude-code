"use client";

import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addAdminNote } from "@/lib/admin/actions/users";
import { ADMIN_TEXT_LIMITS } from "@/lib/admin/reasons";
import { useAdminAction } from "./use-admin-action";

/** Adds an internal note about a user (staff only, never shown to the user). */
export function AdminNoteForm({ userId }: { userId: string }) {
  const t = useTranslations("admin.users.notes");
  const [body, setBody] = useState("");
  const { run, pending } = useAdminAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (body.trim().length < 2) return;
        const done = await run(() => addAdminNote({ userId, body }), { success: t("added") });
        if (done) setBody("");
      }}
    >
      <Label htmlFor="admin-note" className="sr-only">
        {t("label")}
      </Label>
      <Textarea
        id="admin-note"
        dir="auto"
        rows={3}
        maxLength={ADMIN_TEXT_LIMITS.adminNote}
        placeholder={t("placeholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="bg-warning-soft/40"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
          <StickyNote aria-hidden />
          {t("add")}
        </Button>
      </div>
    </form>
  );
}
