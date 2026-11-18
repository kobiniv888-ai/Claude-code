"use client";

import { createContext, useContext, useEffect, useId } from "react";

/**
 * Uploads and other long actions inside a step tell the form they are running, so Next waits for
 * them (bug 2.2: "Next is disabled while a save or upload is in flight").
 */
export const WizardBusyContext = createContext<(id: string, busy: boolean) => void>(() => undefined);

/** Reports `busy` for this component (cleared when it unmounts). */
export function useReportBusy(busy: boolean) {
  const report = useContext(WizardBusyContext);
  const id = useId();
  useEffect(() => {
    report(id, busy);
    return () => report(id, false);
  }, [busy, id, report]);
}
