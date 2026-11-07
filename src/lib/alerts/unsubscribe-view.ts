/**
 * What the unsubscribe page shows and what its button does (pure, unit-tested; the page is
 * src/app/[locale]/(site)/unsubscribe/page.tsx). After an error the "retry" button repeats the
 * change the host asked for (`?on=1` turns it back on), never the opposite.
 */

export type UnsubscribeView = "confirm" | "alreadyOff" | "off" | "on" | "invalid" | "limited" | "error";

export type UnsubscribePlan = {
  view: UnsubscribeView;
  /** The change is done (a confirmation, no form). */
  done: boolean;
  /** The form is shown. */
  showsForm: boolean;
  /** The form's hidden `on` field: true turns the weekly email (back) on. */
  turnOn: boolean;
  /** The button's message key in account.unsubscribe. */
  label: "turnOn" | "turnOff" | "retry";
};

export function unsubscribePlan(input: { valid: boolean; current: boolean | null; state: string; retryOn: boolean }): UnsubscribePlan {
  const { valid, current, state } = input;
  let view: UnsubscribeView;
  if (state === "invalid" || !valid || current === null) view = "invalid";
  else if (state === "limited") view = "limited";
  else if (state === "error") view = "error";
  else if (state === "off" && current === false) view = "off";
  else if (state === "on" && current === true) view = "on";
  else view = current ? "confirm" : "alreadyOff";

  const done = view === "off" || view === "on";
  const turnOn = view === "off" || view === "alreadyOff" || (view === "error" && input.retryOn);
  const showsForm = view === "confirm" || view === "off" || view === "alreadyOff" || view === "error";
  const label = view === "error" ? "retry" : turnOn ? "turnOn" : "turnOff";
  return { view, done, showsForm, turnOn, label };
}
