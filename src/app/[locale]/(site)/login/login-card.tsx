"use client";

import { useState } from "react";
import { LoginPanel, type LoginStage } from "@/components/auth/login-panel";
import { LoginWelcome } from "@/components/auth/login-welcome";
import type { LoginConfig } from "@/lib/auth/config";
import type { AuthErrorKey } from "@/lib/auth/error-codes";

/**
 * The /login page card: the same door, headline and benefits as the login sheet, then the
 * Google/Apple buttons (when set up), the email code (and, in development / test mode, the phone
 * code). The welcome block shrinks while a code or the first name is being entered.
 */
export function LoginCard({
  config,
  next,
  initialError,
  initialStage = "start",
  title,
  description,
}: {
  config: LoginConfig;
  next: string;
  initialError: AuthErrorKey | null;
  initialStage?: "start" | "name" | "email" | "terms";
  title: string;
  description: string;
}) {
  const [stage, setStage] = useState<LoginStage>(initialStage);
  return (
    <div className="rounded-card border border-border bg-card p-5 sm:p-8">
      <LoginWelcome title={title} description={description} compact={stage !== "start"} />
      <div className="mt-6">
        <LoginPanel
          config={config}
          next={next}
          initialError={initialError}
          initialStage={initialStage}
          onStageChange={setStage}
        />
      </div>
    </div>
  );
}
