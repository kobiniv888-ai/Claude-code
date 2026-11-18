import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { BAYIT_MARK_ASPECT, BAYIT_MARK_PATH, BAYIT_MARK_VIEWBOX } from "@/components/brand/mark";
import { siteConfig } from "@/config/site";
import { readLocal } from "@/lib/storage/local";
import { isValidStorageKey } from "@/lib/storage/keys";
import { bidiWords, hasArabicScript, isRtlText } from "./bidi";

/**
 * Share images (Open Graph, 1200×630) drawn with next/og (Satori): the brand image for every page
 * (src/app/[locale]/opengraph-image.tsx) and the listing image (…/listing/[id]/opengraph-image.tsx).
 *
 * Satori has no bidi and cannot shape Arabic (it throws on Arabic letters): Hebrew is handed to it
 * in visual order (./bidi.ts), and Arabic text never reaches it — Arabic pages share the Latin name
 * "Bayit" with the English tagline (see `shareText`).
 *
 * Fonts: Rubik 400/600 (Latin, Hebrew, Cyrillic) and Noto Sans Georgian 400/600 (Georgian and the
 * ₾ sign, which Rubik lacks), static TTFs in src/app/fonts (SIL Open Font License, NOTICE.md there).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const PURPLE = siteConfig.colors.primary;
const WHITE = "#FFFFFF";
/** Lavender text on the purple (7.8:1). */
const SOFT = siteConfig.colors.primaryTintBorder;

const FONT_DIR = path.join(process.cwd(), "src", "app", "fonts");
const FONT_FILES = [
  { name: "Rubik", file: "Rubik-Regular.ttf", weight: 400 },
  { name: "Rubik", file: "Rubik-SemiBold.ttf", weight: 600 },
  { name: "Noto Sans Georgian", file: "NotoSansGeorgian-Regular.ttf", weight: 400 },
  { name: "Noto Sans Georgian", file: "NotoSansGeorgian-SemiBold.ttf", weight: 600 },
] as const;

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;

function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async (f) => ({
      name: f.name,
      data: await readFile(path.join(FONT_DIR, f.file)),
      weight: f.weight,
      style: "normal" as const,
    })),
  ).catch((error) => {
    fontsPromise = null;
    throw error;
  });
  return fontsPromise;
}

/**
 * Removes Arabic letters (Satori throws on them) and bidi control marks (Intl puts LRM/RLM and
 * isolates in formatted prices; the text is reordered here, and Satori would draw them as boxes),
 * then collapses spaces.
 */
function safeText(text: string): string {
  const plain = text.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
  return (hasArabicScript(plain) ? plain.replace(/[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, "") : plain).replace(/\s+/g, " ").trim();
}

/** A paragraph in visual order: words in a wrapping row, right to left for Hebrew. */
function BidiText({ text, style, center = false }: { text: string; style: CSSProperties; center?: boolean }) {
  const { rtl, words } = bidiWords(safeText(text));
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 40;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: rtl ? "row-reverse" : "row",
        flexWrap: style.whiteSpace === "nowrap" ? "nowrap" : "wrap",
        justifyContent: center ? "center" : "flex-start",
        columnGap: Math.round(fontSize * 0.26),
        ...style,
      }}
    >
      {words.map((word, i) => (
        <span key={i} style={{ display: "flex", flexShrink: 0 }}>
          {word}
        </span>
      ))}
    </div>
  );
}

/** The white mark and the name. `fontSize` = the name's size; the mark is 1.4 × that. */
function LogoLockup({ name, fontSize }: { name: string; fontSize: number }) {
  const rtl = isRtlText(name);
  const markHeight = Math.round(fontSize * 1.4);
  return (
    <div
      style={{
        display: "flex",
        // The mark comes first in reading order: right of "בית", left of "Bayit".
        flexDirection: rtl ? "row-reverse" : "row",
        alignItems: "center",
        gap: Math.round(fontSize * 0.25),
        color: WHITE,
      }}
    >
      <svg width={Math.round(markHeight * BAYIT_MARK_ASPECT)} height={markHeight} viewBox={BAYIT_MARK_VIEWBOX}>
        <path d={BAYIT_MARK_PATH} fill="none" stroke={WHITE} strokeWidth={54} strokeLinejoin="round" strokeLinecap="butt" />
      </svg>
      <BidiText
        text={name}
        style={{ fontSize, fontWeight: 600, lineHeight: 1, letterSpacing: rtl ? 0 : -0.01 * fontSize }}
      />
    </div>
  );
}

/** Purple background, the white mark, the name and the tagline (BRIEF 3.1). */
export async function brandShareImage({ name, tagline }: { name: string; tagline: string }): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PURPLE,
          color: WHITE,
          fontFamily: "Rubik",
          padding: "0 96px",
        }}
      >
        <LogoLockup name={name} fontSize={120} />
        <BidiText
          text={tagline}
          center
          style={{ marginTop: 48, maxWidth: 980, fontSize: 44, fontWeight: 400, lineHeight: 1.3, color: SOFT, rowGap: 4 }}
        />
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

/**
 * The image as a JPEG response. Photo share images are ~1 MB as PNG; WhatsApp and some other apps
 * skip link previews over a few hundred KB, so listing images are sent as JPEG (~100–200 KB).
 */
export async function asJpeg(image: Response, quality = 82): Promise<Response> {
  const png = Buffer.from(await image.arrayBuffer());
  const jpeg = await sharp(png).flatten({ background: PURPLE }).jpeg({ quality, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": image.headers.get("Cache-Control") ?? "public, max-age=3600" },
  });
}

/** Reads a listing photo (public/ file, local storage or an https URL) and crops it to `w`×`h` JPEG. */
async function photoDataUri(url: string, w: number, h: number): Promise<string | null> {
  try {
    let input: Buffer | null = null;
    const mediaPrefix = "/api/media/";
    if (url.startsWith(mediaPrefix)) {
      const key = decodeURIComponent(url.slice(mediaPrefix.length));
      if (isValidStorageKey(key)) input = await readLocal("public", key);
    } else if (url.startsWith("/") && !url.includes("..")) {
      input = await readFile(path.join(process.cwd(), "public", url.split(/[?#]/)[0]));
    } else if (/^https:\/\//i.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) input = Buffer.from(await res.arrayBuffer());
    }
    if (!input) return null;
    const jpeg = await sharp(input).resize(w, h, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

const BAR_HEIGHT = 176;

/**
 * A listing: its first photo with a purple bar holding the logo, the title (one line) and the
 * price. Falls back to the brand image when the photo cannot be read.
 */
export async function listingShareImage({
  name,
  tagline,
  title,
  price,
  photoUrl,
}: {
  name: string;
  tagline: string;
  title: string;
  price: string | null;
  photoUrl: string | null;
}): Promise<ImageResponse> {
  const photo = photoUrl ? await photoDataUri(photoUrl, OG_SIZE.width, OG_SIZE.height - BAR_HEIGHT) : null;
  if (!photo) return brandShareImage({ name, tagline });
  const rtl = isRtlText(title) || isRtlText(name);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PURPLE, fontFamily: "Rubik" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain <img> */}
        <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height - BAR_HEIGHT} alt="" style={{ objectFit: "cover" }} />
        <div
          style={{
            height: BAR_HEIGHT,
            display: "flex",
            flexDirection: rtl ? "row-reverse" : "row",
            alignItems: "center",
            gap: 40,
            padding: "0 56px",
            color: WHITE,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: rtl ? "flex-end" : "flex-start",
              gap: 10,
              overflow: "hidden",
            }}
          >
            <BidiText
              text={title}
              style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%" }}
            />
            {price ? <BidiText text={price} style={{ fontSize: 32, fontWeight: 400, lineHeight: 1.2, color: SOFT }} /> : null}
          </div>
          <LogoLockup name={name} fontSize={34} />
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
