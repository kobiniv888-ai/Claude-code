import { requireUserForAction } from "@/lib/auth/session";
import { AVATAR_MAX_BYTES, newAvatarKey, processAvatar } from "@/lib/account/avatar";
import { ownAvatarKey } from "@/lib/account/settings-schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { deletePublic, putPublic } from "@/lib/storage";
import {
  assertContentLength,
  assertSameOrigin,
  errorResponse,
  formFile,
  MULTIPART_OVERHEAD_BYTES,
  readForm,
} from "../../uploads/shared";

/**
 * POST /api/account/avatar   (multipart/form-data: file)
 * → 201 { url } — the new profile photo (400 px WebP, metadata removed), saved as User.image.
 *   JPEG, PNG and WebP; HEIC is converted on the server (prepareUploadImage in @/lib/images).
 * → { error: code } with the same codes as the other upload endpoints.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUserForAction();
    await assertRateLimit(`upload:avatar:${user.id}`, { limit: 10, windowSeconds: 3600 });
    assertContentLength(request, AVATAR_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
    const form = await readForm(request, AVATAR_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
    const file = formFile(form);
    if (file.size > AVATAR_MAX_BYTES) throw new AppError("file_too_large", "File too large", { status: 413 });

    const body = await processAvatar(Buffer.from(await file.arrayBuffer()), user.id);
    const { url } = await putPublic(newAvatarKey(user.id), body, "image/webp");
    const previous = await db.user.findUnique({ where: { id: user.id }, select: { image: true } });
    await db.user.update({ where: { id: user.id }, data: { image: url } });

    const oldKey = ownAvatarKey(previous?.image, user.id);
    if (oldKey) await deletePublic(oldKey).catch((error) => console.error("[avatar] could not delete the old photo:", error));

    return Response.json({ url }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "avatar");
  }
}
