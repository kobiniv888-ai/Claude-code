"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { updateDraft } from "@/lib/wizard/actions";
import { pickStepData, STEP_FIELDS, type StepIssues, type WizardValues } from "@/lib/wizard/schemas";
import { SAVABLE_STEPS, type SavableStepKey } from "@/lib/wizard/steps";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; code: string };

export const AUTOSAVE_DELAY_MS = 1500;

function snapshot(step: SavableStepKey, values: WizardValues): string {
  return JSON.stringify(pickStepData(step, values));
}

/**
 * Auto-save for the wizard: a step's data is saved ≈1.5 s after the last change and again on
 * Next. Saves run one after another (never out of order) and are skipped when nothing changed.
 * Other actions (photos, calendar…) report their state through `track()` so the "Saved"
 * indicator covers them too.
 */
export function useAutosave(listingId: string, initialValues: WizardValues) {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const saved = useRef<Record<string, string>>(
    Object.fromEntries(SAVABLE_STEPS.map((step) => [step, snapshot(step, initialValues)])),
  );
  const pending = useRef<{ step: SavableStepKey; values: WizardValues } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const [serverIssues, setServerIssues] = useState<Partial<Record<SavableStepKey, StepIssues>>>({});

  const begin = () => {
    inFlight.current += 1;
    setState({ status: "saving" });
  };
  const end = (outcome: SaveState) => {
    inFlight.current = Math.max(0, inFlight.current - 1);
    if (outcome.status === "error" || inFlight.current === 0) setState(outcome);
  };

  /** Runs any promise as part of the save queue and reflects it in the indicator. */
  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    begin();
    return promise.then(
      (value) => {
        const result = value as unknown as ActionResult<unknown> | undefined;
        if (result && typeof result === "object" && "ok" in result && result.ok === false) {
          end({ status: "error", code: result.error });
        } else {
          end({ status: "saved", at: Date.now() });
        }
        return value;
      },
      (error) => {
        end({ status: "error", code: "network" });
        throw error;
      },
    );
  }, []);

  const saveNow = useCallback(
    (step: SavableStepKey, values: WizardValues, wizardStep?: number): Promise<boolean> => {
      const data = pickStepData(step, values);
      const json = JSON.stringify(data);
      const run = async (): Promise<boolean> => {
        if (saved.current[step] === json && wizardStep === undefined) return true;
        begin();
        try {
          const result = await updateDraft(listingId, step, data, { wizardStep });
          if (result.ok) {
            saved.current[step] = json;
            setServerIssues((current) => (current[step] ? { ...current, [step]: undefined } : current));
            end({ status: "saved", at: Date.now() });
            return true;
          }
          if (result.fieldErrors) {
            const issues: StepIssues = {};
            for (const [field, codes] of Object.entries(result.fieldErrors)) {
              const code = codes?.[0];
              if (code) issues[field] = /^[a-zA-Z]+$/.test(code) ? code : "invalid";
            }
            setServerIssues((current) => ({ ...current, [step]: issues }));
          }
          end({ status: "error", code: result.error });
          return false;
        } catch {
          end({ status: "error", code: "network" });
          return false;
        }
      };
      const next = chain.current.then(run, run);
      chain.current = next;
      return next;
    },
    [listingId],
  );

  /** Schedules a save of `step` (debounced). */
  const schedule = useCallback(
    (step: SavableStepKey, values: WizardValues) => {
      if (saved.current[step] === snapshot(step, values)) {
        pending.current = null;
        if (timer.current) clearTimeout(timer.current);
        return;
      }
      pending.current = { step, values };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const job = pending.current;
        pending.current = null;
        if (job) void saveNow(job.step, job.values);
      }, AUTOSAVE_DELAY_MS);
    },
    [saveNow],
  );

  /** Saves the pending change (if any) right away and waits for every save in the queue. */
  const flush = useCallback(
    async (step?: SavableStepKey, values?: WizardValues, wizardStep?: number): Promise<boolean> => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const job = pending.current;
      pending.current = null;
      let okay = true;
      if (job && (!step || job.step !== step)) okay = (await saveNow(job.step, job.values)) && okay;
      if (step && values) okay = (await saveNow(step, values, wizardStep)) && okay;
      else await chain.current.catch(() => undefined);
      return okay;
    },
    [saveNow],
  );

  const isDirty = useCallback(
    (values: WizardValues) => pending.current !== null || SAVABLE_STEPS.some((s) => saved.current[s] !== snapshot(s, values)),
    [],
  );

  // Warn before closing the tab while something is not saved yet.
  const valuesRef = useRef(initialValues);
  const warn = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!warn.current && pending.current === null && inFlight.current === 0) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => {
    warn.current = state.status === "error";
  }, [state]);

  /** Marks values as saved by someone else (e.g. the deal step changed the property type on the server). */
  const markSaved = useCallback((values: WizardValues, steps: readonly SavableStepKey[] = SAVABLE_STEPS) => {
    valuesRef.current = values;
    for (const step of steps) saved.current[step] = snapshot(step, values);
  }, []);

  return { state, schedule, flush, saveNow, track, isDirty, markSaved, serverIssues };
}

export { STEP_FIELDS };
