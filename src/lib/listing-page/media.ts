/**
 * Listing video and 360° tour links (client-safe, pure).
 *
 *   parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")
 *     → { provider: "youtube", id: "dQw4w9WgXcQ", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1" }
 *
 * Only YouTube (privacy-enhanced youtube-nocookie.com) and Vimeo (dnt=1) are embedded.
 */
import { allowListedHttpsUrl, TOUR_DOMAINS } from "@/config/external-hosts";

export type VideoEmbed = { provider: "youtube" | "vimeo"; id: string; embedUrl: string; watchUrl: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

function parseUrl(value: string | null | undefined): URL | null {
  const raw = value?.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = host === "player.vimeo.com" ? (parts[0] === "video" ? parts[1] : null) : parts.find((p) => VIMEO_ID.test(p));
  return id && VIMEO_ID.test(id) ? id : null;
}

export function parseVideoUrl(value: string | null | undefined): VideoEmbed | null {
  const url = parseUrl(value);
  if (!url) return null;
  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: "youtube",
      id: yt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&autoplay=1`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }
  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      provider: "vimeo",
      id: vimeo,
      embedUrl: `https://player.vimeo.com/video/${vimeo}?dnt=1&autoplay=1`,
      watchUrl: `https://vimeo.com/${vimeo}`,
    };
  }
  return null;
}

/** An http(s) link the page may open in a new tab, or null. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  const url = parseUrl(value);
  return url && url.protocol === "https:" ? url.toString() : null;
}

/**
 * A 360° tour link the page may show (SECURITY_REPORT 7.f): https on Matterport, Kuula,
 * Momento360 or Roundme only (TOUR_DOMAINS). Checked again on every render, so a link saved before
 * the allow-list (or written straight into the database) never reaches a visitor. Null otherwise.
 */
export function safeTourUrl(value: string | null | undefined): string | null {
  const url = allowListedHttpsUrl(value, TOUR_DOMAINS);
  return url ? url.toString() : null;
}
