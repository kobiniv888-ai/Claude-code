"use client"

import * as React from "react"

/**
 * Gives focus back to whatever had it when a dialog opened. Radix only returns focus to its own
 * `<Trigger>`; dialogs opened from state (a custom button, a toolbar, a card action) otherwise
 * drop keyboard and screen-reader users on <body> when they close.
 *
 * Returns `onOpenAutoFocus` / `onCloseAutoFocus` handlers that wrap the caller's own. A caller
 * that calls `event.preventDefault()` in its `onCloseAutoFocus` keeps full control.
 */
export function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    // Runs before focus moves into the dialog, so the active element is still the opener.
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const target = opener.current
      opener.current = null
      if (target?.isConnected) {
        event.preventDefault()
        target.focus({ preventScroll: true })
      }
    },
  }
}
