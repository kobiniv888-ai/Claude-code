"use client";

import { useState } from "react";
import { LoginPanel, type LoginStage } from "@/components/auth/login-panel";
import { LoginWelcome } from "@/components/auth/login-welcome";
import type { LoginConfig } from "@/lib/auth/config";
import type { AuthErrorKey } from "@/lib/auth/error-codes";

/**
 * The /login page card: the same door, headline and benefits as the login sheet, then the
 * Google/Apple buttons (when set up) and the phone form. The welcome block shrinks while a code is
 * being entered.
 */
export function LoginCard({
  config,
  next,
  initialError,
  title,
  description,
}: {
  config: LoginConfig;
  next: string;
  initialError: AuthErrorKey | null;
  title: string;
  description: string;
}) {
  const [stage, setStage] = useState<LoginStage>("start");
  return (
    <div className="rounded-card bg-card p-5 shadow-raised ring-1 ring-foreground/5 sm:p-8">
      <LoginWelcome title={title} description={description} compact={stage !== "start"} />
      <div className="mt-6">
        <LoginPanel config={config} next={next} initialError={initialError} onStageChange={setStage} />
      </div>
    </div>
  );
}
