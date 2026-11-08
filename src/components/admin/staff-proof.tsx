"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

/** Loaded at the first destructive action only. */
const StaffProofDialog = dynamic(() => import("./staff-proof-dialog").then((m) => m.StaffProofDialog), { ssr: false });

type StaffProof = {
  /** Opens the authenticator dialog; true once a code was accepted (a fresh proof for 5 minutes). */
  ask: () => Promise<boolean>;
};

const StaffProofContext = createContext<StaffProof | null>(null);

/**
 * The admin panel's "confirm with your authenticator" step (SECURITY_REPORT 3.6.c). Mounted once
 * by the admin layout; useAdminAction / useContentAction call `ask()` when a destructive action
 * answers "fresh_proof_required" and then try the action once more.
 */
export function StaffProofProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // A new dialog (fresh state) for every request.
  const [round, setRound] = useState(0);
  const resolver = useRef<((proven: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    // A second request while one is open answers "no" for the first one.
    resolver.current?.(false);
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

  return (
    <StaffProofContext.Provider value={{ ask }}>
      {children}
      {mounted ? <StaffProofDialog key={round} open={open} onDone={onDone} /> : null}
    </StaffProofContext.Provider>
  );
}

/** The provider's `ask`, or null outside the admin panel (the error is shown as usual then). */
export function useStaffProof(): StaffProof | null {
  return useContext(StaffProofContext);
}

/**
 * Runs `fn`; when it answers "fresh_proof_required", asks for the authenticator code and runs it
 * once more. Without a provider, or when the dialog is closed, the first answer comes back.
 */
export async function withStaffProof<R extends { ok: boolean; error?: string }>(proof: StaffProof | null, fn: () => Promise<R>): Promise<R> {
  const first = await fn();
  if (first.ok || first.error !== "fresh_proof_required" || !proof) return first;
  if (!(await proof.ask())) return first;
  return fn();
}
