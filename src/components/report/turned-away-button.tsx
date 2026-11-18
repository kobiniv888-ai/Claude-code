"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { FlagIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import type { TurnedAwayContext, TurnedAwayTarget } from "./turned-away-form";
import type { TurnedAwayLauncherProps } from "./turned-away-launcher";

const Launcher = dynamic<TurnedAwayLauncherProps>(() => import("./turned-away-launcher"), { ssr: false });

/**
 * "Report the host" / "Host cancelled? Tell us" on the trip page (brief 8.2). The form's code loads
 * at the first tap. `autoOpen` opens it right away (the cancellation email links to ?report=1).
 */
export function TurnedAwayButton({
  label,
  target,
  context,
  today,
  defaultDate,
  autoOpen = false,
  variant = "secondary",
  className,
}: {
  label: string;
  target: TurnedAwayTarget;
  context: TurnedAwayContext;
  today: string;
  defaultDate?: string | null;
  autoOpen?: boolean;
  variant?: "secondary" | "soft" | "link";
  className?: string;
}) {
  // ?report=1 opens the form at once (the launcher renders nothing on the server).
  const [request, setRequest] = useState(autoOpen ? 1 : 0);
  return (
    <>
      <Button type="button" variant={variant} size={variant === "link" ? undefined : "sm"} className={className} onClick={() => setRequest((n) => n + 1)}>
        <FlagIcon aria-hidden />
        {label}
      </Button>
      {request > 0 ? <Launcher request={request} target={target} context={context} today={today} defaultDate={defaultDate} /> : null}
    </>
  );
}
