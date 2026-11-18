"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

/** Loaded at the first sensitive change only (pages that never ask for a fresh code never load it). */
const FreshProofDialog = dynamic(() => import("./fresh-proof-dialog").then((m) => m.FreshProofDialog), { ssr: false });

/**
 * A fresh code before a sensitive change (SECURITY_REPORT 3.6). The server decides
 * (`fresh_proof_required` from the action); this asks for the code and lets the caller try again:
 *
 *   const proof = useFreshProof();
 *   const result = await proof.run(() => deleteMyAccount({ confirmation }));
 *   …
 *   return <>{form}{proof.dialog}</>;
 *
 * `run(action)` calls the action, and when it answers `fresh_proof_required` opens the dialog and
 * calls it once more after the code was accepted. `ask()` opens the dialog on its own (before a
 * redirect to Google, which cannot answer like an action).
 */
export function useFreshProof() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // A new dialog (fresh state) for every request.
  const [round, setRound] = useState(0);
  const resolver = useRef<((proven: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    setMounted(true);
    setRound((n) => n + 1);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const onDone = useCallback((proven: boolean) => {
    setOpen(false);
    resolver.current?.(proven);
    resolver.current = null;
  }, []);

  const run = useCallback(
    async <R extends { ok: boolean; error?: string }>(action: () => Promise<R>): Promise<R | null> => {
      const first = await action();
      if (first.ok || first.error !== "fresh_proof_required") return first;
      if (!(await ask())) return null;
      return action();
    },
    [ask],
  );

  const dialog: ReactNode = mounted ? <FreshProofDialog key={round} open={open} onDone={onDone} /> : null;
  return { ask, run, dialog };
}
