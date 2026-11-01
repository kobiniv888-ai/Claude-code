"use client";

import { PledgeForm } from "@/components/pledge/pledge-form";
import type { StepProps } from "../step-props";

/**
 * The Bayit welcome pledge (required before publishing). It is saved on the account, not on the
 * listing: once the current version is accepted, every later listing shows the confirmed state.
 */
export function PledgeStep({ pledge, setPledge, errors }: StepProps) {
  return <PledgeForm status={pledge} onAccepted={setPledge} showRequiredError={!!errors.pledge} className="max-w-2xl" />;
}
