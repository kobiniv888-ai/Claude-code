/** Coordinates as text in the editors (so a half-typed "41." is kept). Pure, client-safe. */
export type CoordText = { lat: string; lng: string };

export function coordText(lat: number | null | undefined, lng: number | null | undefined): CoordText {
  return {
    lat: lat === null || lat === undefined ? "" : String(lat),
    lng: lng === null || lng === undefined ? "" : String(lng),
  };
}
