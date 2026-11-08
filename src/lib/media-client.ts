import { isHeicFile } from "@/lib/media";

/**
 * HEIC photos in the browser (SECURITY_REPORT 9.a, founder's answer (e), 8 November 2026): an
 * iPhone photo must keep working. The upload fields offer only JPEG, PNG and WebP, so an iPhone
 * converts its photos itself; a .heic file that still arrives (dragged in on a Mac, shared from
 * Files) is converted here wherever the browser can decode HEIC (Safari on macOS and iOS): it is
 * decoded (createImageBitmap, else an <img>), drawn on a canvas and exported as JPEG. Re-encoding
 * keeps only the pixels, so EXIF, GPS and every other metadata block are gone before the upload
 * (the server strips metadata from every stored image too). Where the browser cannot decode HEIC
 * (Chrome on Windows) this throws HeicConversionError and the field uploads the HEIC itself
 * (readyForUpload): the server decodes it (prepareUploadImage in @/lib/images, heic-decode) and
 * answers "heic_not_supported" only for a file it cannot read either.
 */

/** Longest side of the converted JPEG (the same limit the photo compressor uses). */
export const HEIC_MAX_SIDE = 2400;
const JPEG_QUALITY = 0.86;

export class HeicConversionError extends Error {
  constructor(message = "This browser cannot convert HEIC photos") {
    super(message);
    this.name = "HeicConversionError";
  }
}

type Drawable = { width: number; height: number; source: CanvasImageSource; close: () => void };

async function decodeWithBitmap(file: File): Promise<Drawable> {
  // "from-image" applies the photo's EXIF orientation, so the JPEG comes out upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
}

async function decodeWithImage(file: File): Promise<Drawable> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new HeicConversionError("empty image");
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await decodeWithBitmap(file);
    } catch {
      // Some Safari versions decode HEIC in <img> but not in createImageBitmap.
    }
  }
  if (typeof Image === "undefined") throw new HeicConversionError("no image decoder");
  return decodeWithImage(file);
}

function canvasToJpeg(drawable: Drawable, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(drawable.width, drawable.height));
  const width = Math.max(1, Math.round(drawable.width * scale));
  const height = Math.max(1, Math.round(drawable.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new HeicConversionError("no canvas"));
  context.drawImage(drawable.source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob && blob.size > 0 && blob.type === "image/jpeg" ? resolve(blob) : reject(new HeicConversionError("no JPEG output"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** "IMG_0001.HEIC" → "IMG_0001.jpg" (any other name gets ".jpg" added). */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.(heic|heif)$/i, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Returns the file itself when it is not HEIC/HEIF, else a JPEG File with the same picture (no
 * metadata). Throws HeicConversionError when the browser cannot decode it; never returns HEIC.
 */
export async function toJpegIfHeic(file: File, maxSide: number = HEIC_MAX_SIDE): Promise<File> {
  if (!isHeicFile(file)) return file;
  let drawable: Drawable;
  try {
    drawable = await decode(file);
  } catch (error) {
    throw error instanceof HeicConversionError ? error : new HeicConversionError();
  }
  try {
    const blob = await canvasToJpeg(drawable, maxSide);
    return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch (error) {
    throw error instanceof HeicConversionError ? error : new HeicConversionError();
  } finally {
    drawable.close();
  }
}

/**
 * For the upload fields: the file to send and whether this browser can show it as a preview. A
 * HEIC photo is converted to JPEG where the browser can (preview shown); otherwise the HEIC itself
 * is sent (no preview: a broken-image icon would show) and the server converts it.
 */
export async function readyForUpload(file: File): Promise<{ file: File; canPreview: boolean }> {
  if (!isHeicFile(file)) return { file, canPreview: true };
  try {
    return { file: await toJpegIfHeic(file), canPreview: true };
  } catch {
    return { file, canPreview: false };
  }
}
