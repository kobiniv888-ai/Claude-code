"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit, auditOrThrow } from "@/lib/audit";
import { db } from "@/lib/db";
import { cleanLocalized } from "../localized";
import { savedReplySchema } from "../schemas";
import { ContentActionError, parseInput, runContentAction } from "../server/common";

/** Saved replies for support tickets ("tickets" permission: admins and support agents). */

const idInput = z.object({ id: z.string().min(1).max(64) });

export async function saveSavedReply(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("tickets", "saved_replies", async (staff) => {
    const raw = (input ?? {}) as { id?: unknown; values?: unknown };
    const id = typeof raw.id === "string" && raw.id ? raw.id : null;
    const parsed = parseInput(savedReplySchema, raw.values);
    if (!parsed.ok) return parsed.result;
    const data = { title: parsed.data.title, body: cleanLocalized(parsed.data.body) };

    if (id) {
      const before = await db.savedReply.findUnique({ where: { id }, select: { id: true } });
      if (!before) throw new ContentActionError("item_not_found", 404);
      await db.savedReply.update({ where: { id }, data });
      await audit({ actorId: staff.id, action: "saved_reply.update", targetType: "SavedReply", targetId: id, details: { title: data.title } });
      return ok({ id });
    }
    const created = await db.savedReply.create({ data, select: { id: true } });
    await audit({ actorId: staff.id, action: "saved_reply.create", targetType: "SavedReply", targetId: created.id, details: { title: data.title } });
    return ok({ id: created.id });
  });
}

export async function deleteSavedReply(input: unknown): Promise<ActionResult> {
  return runContentAction("tickets", "saved_replies", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const reply = await db.savedReply.findUnique({ where: { id: parsed.data.id }, select: { id: true, title: true } });
    if (!reply) throw new ContentActionError("item_not_found", 404);
    // Q13: the delete and its audit row commit together, or not at all.
    await db.$transaction(async (tx) => {
      await tx.savedReply.delete({ where: { id: reply.id } });
      await auditOrThrow({ actorId: staff.id, action: "saved_reply.delete", targetType: "SavedReply", targetId: reply.id, details: { title: reply.title } }, tx);
    });
    return ok();
  });
}
