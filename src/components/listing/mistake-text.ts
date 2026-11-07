/**
 * The sentence for one mistake-check issue (src/lib/listing/mistake-check.ts), from
 * wizard.mistakes in messages/<locale>/wizard.json. Shared by the host's panel (client) and the
 * admin review page (server): pass `useTranslations("wizard.mistakes")` or
 * `await getTranslations("wizard.mistakes")`.
 *
 * What the host wrote (a snippet of the description, a room name) is isolated (FSI … PDI) and
 * quoted; phone numbers and links are left-to-right islands; times are isolated by their first
 * strong letter ("10:00 AM", Arabic "10:00 ص"); numbers use Western digits.
 */
import { formatNumber, isolate, isolateLtr } from "@/lib/format";
import { clockLabel } from "@/lib/listing/check-times";
import type { MistakeIssue } from "@/lib/listing/mistake-check";

export type MistakeTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

function list(t: MistakeTranslator, items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${t("or")} ${items.at(-1)}`;
}

function label(t: MistakeTranslator, group: string, key: string | number | undefined): string {
  const path = `${group}.${String(key)}`;
  return t.has(path) ? t(path) : String(key ?? "");
}

/** The issue's sentence in the page's language. */
export function mistakeMessage(issue: MistakeIssue, t: MistakeTranslator, locale: string): string {
  const p = issue.params ?? {};
  const quoted = (text: string | number | undefined) => t("quoted", { text: isolate(String(text ?? "")) });
  const n = (value: string | number | undefined) => formatNumber(Number(value ?? 0), locale);
  const values: Record<string, string | number> = {};
  switch (issue.code) {
    case "photos_too_few":
      values.count = Number(p.count ?? 0);
      values.min = n(p.min);
      break;
    case "contact_in_title":
    case "contact_in_description":
    case "contact_in_translation":
    case "contact_in_room_name":
      values.kind = label(t, "contactKind", p.kind);
      values.language = label(t, "languages", p.locale);
      values.room = isolate(String(p.room ?? ""));
      // An email address or a link is one word: no line break at its "-" or "/" (word joiners),
      // which would show "host-" and "p4g@example.com" as two pieces in a right-to-left sentence.
      values.value = isolateLtr(String(p.value ?? "").replace(/[-/]/g, "\u2060$&\u2060"));
      break;
    case "pin_outside_city":
      values.km = n(p.km);
      break;
    case "guests_below_beds":
    case "guests_above_beds":
    case "room_guests_below_beds":
    case "room_guests_above_beds":
      values.maxGuests = n(p.maxGuests);
      values.sleeps = n(p.sleeps);
      values.room = isolate(String(p.room ?? ""));
      break;
    case "room_price_far_below":
    case "room_price_far_above":
      values.room = isolate(String(p.room ?? ""));
      break;
    case "title_language":
      values.detected = label(t, "languages", p.detected);
      values.setting = label(t, "languages", p.setting);
      break;
    case "description_currency":
      values.written = quoted(p.written);
      values.listingCurrency = label(t, "currencies", p.listingCurrency);
      break;
    case "checkin_time_mismatch":
    case "checkout_time_mismatch":
      values.written = quoted(p.written);
      // First-strong isolate: "10:00 AM" stays left-to-right, Arabic "10:00 ص" reads right-to-left.
      values.setting = isolate(clockLabel(String(p.setting ?? ""), locale));
      break;
    case "checkin_time_missing":
      if (p.written !== undefined) return t("issues.checkin_time_missing_written", { written: quoted(p.written) });
      break;
    case "photo_rooms_missing":
      values.rooms = list(
        t,
        String(p.rooms ?? "")
          .split(",")
          .filter(Boolean)
          .map((room) => quoted(label(t, "rooms", room))),
      );
      break;
  }
  const key = `issues.${issue.code}`;
  return t.has(key) ? t(key, values) : issue.code;
}
