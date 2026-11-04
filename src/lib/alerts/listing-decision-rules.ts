import type { ChannelStatus } from "./rules";

/**
 * How a host hears about a staff decision on their listing (approved, changes asked, rejected):
 * round 3, brief 9 "Each action emails the host". Pure and client-safe.
 *
 *   - By EMAIL whenever the account has a real address that is not paused after a bounce. These
 *     emails are not optional: the host's "listing emails" switch does not turn them off.
 *   - When email is not available (a phone-only account, a paused address) or the email could not
 *     be sent, through the host's OTHER alert channels that are ready: Telegram and app/browser
 *     notifications. SMS is a paid channel for later and is never used for this.
 *   - With none of those, the decision is still on the host's "My listings" page.
 */

export type DecisionChannel = "telegram" | "push";

export type DecisionPlan = {
  /** Send the decision email. */
  email: boolean;
  /** Channels to use when the email is not sent or fails. */
  fallback: DecisionChannel[];
};

export function planListingDecision(input: { email: string | null; emailFailing: boolean; channels: readonly ChannelStatus[] }): DecisionPlan {
  const fallback = input.channels
    .filter((c): c is ChannelStatus & { channel: DecisionChannel } => (c.channel === "telegram" || c.channel === "push") && c.ready)
    .map((c) => c.channel);
  return { email: !!input.email && !input.emailFailing, fallback };
}

/** The channels to try after the email step (none when the email went out). */
export function fallbackChannels(plan: DecisionPlan, emailAccepted: boolean): DecisionChannel[] {
  return plan.email && emailAccepted ? [] : plan.fallback;
}
