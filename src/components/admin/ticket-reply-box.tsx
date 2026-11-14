"use client";

import { Lock, MessageSquareText, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { TicketStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { assignTicketAction, setTicketStatusAction, staffReplyAction } from "@/lib/admin/actions/tickets";
import { TICKET_LIMITS, TICKET_STATUSES } from "@/lib/tickets/constants";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

const KEEP = "__keep__";

/**
 * Reply to the user or write an internal note. Saved replies (in the staff member's language)
 * are inserted at the cursor. Ctrl/Cmd+Enter sends.
 */
export function TicketReplyBox({
  ticketId,
  savedReplies,
  requesterName,
}: {
  ticketId: string;
  savedReplies: { id: string; title: string; body: string }[];
  requesterName: string | null;
}) {
  const t = useTranslations("admin.tickets.reply");
  const tStatus = useTranslations("tickets.statusStaff");
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>(KEEP);
  const [savedKey, setSavedKey] = useState(0);
  const { run, pending } = useAdminAction();

  function insert(text: string) {
    const el = ref.current;
    const personalized = requesterName ? text.replaceAll("{name}", requesterName) : text;
    if (!el) {
      setBody((b) => (b ? `${b}\n\n${personalized}` : personalized));
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + personalized + body.slice(end);
    setBody(next.slice(0, TICKET_LIMITS.messageMax));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + personalized.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    if (!body.trim() || pending) return;
    const ok = await run(
      () =>
        staffReplyAction({
          ticketId,
          body,
          internal,
          newStatus: newStatus === KEEP ? undefined : (newStatus as TicketStatus),
        }),
      { success: internal ? t("noteSaved") : t("sent") },
    );
    if (ok) {
      setBody("");
      setNewStatus(KEEP);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 shadow-xs",
        internal ? "border-border-strong/60 bg-surface-muted" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch id={`${id}-internal`} checked={internal} onCheckedChange={setInternal} />
          <Label htmlFor={`${id}-internal`} className="flex items-center gap-1.5 text-sm">
            <Lock aria-hidden className="size-3.5" />
            {t("internal")}
          </Label>
        </div>
        {savedReplies.length ? (
          <Select
            key={savedKey}
            onValueChange={(value) => {
              const reply = savedReplies.find((r) => r.id === value);
              if (reply) insert(reply.body);
              setSavedKey((k) => k + 1);
            }}
          >
            <SelectTrigger className="h-8 w-full sm:w-56" aria-label={t("savedReplies")}>
              <MessageSquareText aria-hidden className="size-4" />
              <SelectValue placeholder={t("savedReplies")} />
            </SelectTrigger>
            <SelectContent>
              {savedReplies.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <Label htmlFor={`${id}-body`} className="sr-only">
        {internal ? t("noteLabel") : t("replyLabel")}
      </Label>
      <Textarea
        id={`${id}-body`}
        ref={ref}
        dir="auto"
        rows={5}
        maxLength={TICKET_LIMITS.messageMax}
        placeholder={internal ? t("notePlaceholder") : t("replyPlaceholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        className="bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
            {t("statusAfter")}
          </Label>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger id={`${id}-status`} className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>{t("statusAuto")}</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {tStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {internal ? <Lock aria-hidden /> : <Send aria-hidden className="rtl:-scale-x-100" />}
          {internal ? t("saveNote") : t("send")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{internal ? t("internalHint") : t("replyHint")}</p>
    </form>
  );
}

/** Status and assignee of a ticket. */
export function TicketControls({
  ticketId,
  status,
  assignedToId,
  staffId,
  staffMembers,
}: {
  ticketId: string;
  status: TicketStatus;
  assignedToId: string | null;
  staffId: string;
  staffMembers: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.tickets.controls");
  const tStatus = useTranslations("tickets.statusStaff");
  const { run, pending } = useAdminAction();
  const NONE = "__none__";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-status" className="text-xs text-muted-foreground">
          {t("status")}
        </Label>
        <Select
          value={status}
          disabled={pending}
          onValueChange={(value) =>
            run(() => setTicketStatusAction({ ticketId, status: value }), { success: t("statusChanged") })
          }
        >
          <SelectTrigger id="ticket-status" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {tStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ticket-assignee" className="text-xs text-muted-foreground">
          {t("assignee")}
        </Label>
        <Select
          value={assignedToId ?? NONE}
          disabled={pending}
          onValueChange={(value) =>
            run(() => assignTicketAction({ ticketId, assigneeId: value === NONE ? null : value }), { success: t("assigned") })
          }
        >
          <SelectTrigger id="ticket-assignee" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
            {staffMembers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.id === staffId ? t("me", { name: s.name }) : s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignedToId !== staffId ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto w-fit p-0"
            disabled={pending}
            onClick={() => run(() => assignTicketAction({ ticketId, assigneeId: "me" }), { success: t("assigned") })}
          >
            {t("assignMe")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
