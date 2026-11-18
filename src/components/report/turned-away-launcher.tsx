"use client";

import { useEffect, useRef, useState } from "react";
import { useRequireLogin } from "@/components/auth/login-dialog";
import { TurnedAwayForm, type TurnedAwayContext, type TurnedAwayTarget } from "./turned-away-form";

/**
 * Opens the "Turned away?" form each time `request` grows: a signed-out visitor logs in first
 * (in place), then the form opens. Loaded on demand by ./turned-away-button and
 * ./host-report-root, so no page ships the form's code up front.
 */
export type TurnedAwayLauncherProps = {
  request: number;
  target: TurnedAwayTarget;
  context: TurnedAwayContext;
  today: string;
  defaultDate?: string | null;
};

export default function TurnedAwayLauncher({ request, target, context, today, defaultDate }: TurnedAwayLauncherProps) {
  const requireLogin = useRequireLogin();
  const [open, setOpen] = useState(false);
  // A new form (fresh answers) for each opening.
  const [round, setRound] = useState(0);
  const handled = useRef(0);

  useEffect(() => {
    if (request <= handled.current) return;
    handled.current = request;
    void requireLogin(() => {
      setRound((r) => r + 1);
      setOpen(true);
    });
  }, [request, requireLogin]);

  if (round === 0) return null;
  return <TurnedAwayForm key={round} open={open} onOpenChange={setOpen} target={target} context={context} today={today} defaultDate={defaultDate} />;
}
