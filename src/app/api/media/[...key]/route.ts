import { storageDriver, publicUrl } from "@/lib/storage";
import { isValidStorageKey, publicContentTypeFor } from "@/lib/storage/keys";
import { readLocal } from "@/lib/storage/local";

/**
 * Serves PUBLIC files from local storage: /api/media/listings/<id>/<photo>.webp
 * Private files (ID documents) are never served here. With STORAGE_DRIVER=s3 the
 * files live on the bucket's public URL, so this route redirects there.
 */

type Context = { params: Promise<{ key: string[] }> };

const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" };

async function serve(context: Context, withBody: boolean): Promise<Response> {
  const { key: segments } = await context.params;
  const key = (segments ?? []).join("/");
  const contentType = isValidStorageKey(key) ? publicContentTypeFor(key) : null;
  if (!contentType) return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });

  if (storageDriver() === "s3") {
    return Response.redirect(publicUrl(key), 308);
  }

  const body = await readLocal("public", key);
  if (!body) return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });

  return new Response(withBody ? new Uint8Array(body) : null, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

export async function GET(_request: Request, context: Context) {
  return serve(context, true);
}

export async function HEAD(_request: Request, context: Context) {
  return serve(context, false);
}
