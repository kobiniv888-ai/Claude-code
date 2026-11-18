"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type ReactNode } from "react";
import { nextFocusAfterRemoval, SAVED_LIST_HEADING_ID } from "./list-text";

// Closed on first paint: its code loads at the first "Move" (speed-1), like the heart's sheet.
const ListPickerSheet = dynamic(() => import("./list-picker-sheet").then((m) => m.ListPickerSheet), { ssr: false });

/** Each card's Move button carries data-move-for="<listing id>" (focus finds the next one by it). */
export const MOVE_FOR_ATTR = "data-move-for";

type Target = { listingId: string; title: string; open: boolean };

/**
 * "Move" on the saved pages (round 3, brief 7.2): ONE list sheet for the whole list, mounted from
 * the first tap, instead of one per card. A move to another list or a removal takes the card away
 * together with its Move button; the sheet stays mounted to close, and gives focus to the next
 * card's Move button (or the list's heading when it was the last one) instead of the page's start
 * (a11y-2). `order` = the listing ids shown, in order.
 */
export function useMoveSheet({
  order,
  onSaved,
}: {
  order: readonly string[];
  /** The place left this list: moved elsewhere (saved true) or removed (false). */
  onSaved?: (listingId: string, saved: boolean) => void;
}): { openMove: (listingId: string, title: string) => void; moveSheet: ReactNode } {
  const [target, setTarget] = useState<Target | null>(null);
  /** undefined = nothing left the list; null = focus the heading; an id = that card's Move button. */
  const focusNext = useRef<string | null | undefined>(undefined);
  const openMove = (listingId: string, title: string) => setTarget({ listingId, title, open: true });
  const moveSheet = target ? (
    <ListPickerSheet
      key={target.listingId}
      open={target.open}
      onOpenChange={(open) => setTarget((current) => (current ? { ...current, open } : current))}
      listingId={target.listingId}
      title={target.title}
      onSaved={(saved) => {
        focusNext.current = nextFocusAfterRemoval(order, target.listingId);
        onSaved?.(target.listingId, saved);
      }}
      onCloseAutoFocus={(event) => {
        const next = focusNext.current;
        focusNext.current = undefined;
        if (next === undefined) return; // the card is still here: back to its Move button
        event.preventDefault();
        const button = next ? document.querySelector<HTMLElement>(`[${MOVE_FOR_ATTR}="${CSS.escape(next)}"]`) : null;
        (button ?? document.getElementById(SAVED_LIST_HEADING_ID))?.focus();
      }}
    />
  ) : null;
  return { openMove, moveSheet };
}
