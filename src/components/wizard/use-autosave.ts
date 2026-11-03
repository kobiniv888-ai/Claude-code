"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { saveWizardStep, updateDraft } from "@/lib/wizard/actions";
import { confirmedFields, pickChanged, stepsToSave, type FieldKey } from "@/lib/wizard/patch";
import type { StepIssues, WizardValues } from "@/lib/wizard/schemas";
import type { ListingKind, SavableStepKey } from "@/lib/wizard/steps";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; code: string };

export const AUTOSAVE_DELAY_MS = 1500;

export type AutosaveOptions = {
  listingId: string;
  /** The answers as the browser holds them now. */
  getValues: () => WizardValues;
  getKind: () => ListingKind;
  /** Drafts remember the step the owner is on; published listings do not. */
  isDraft: () => boolean;
  /** A save went through: the listing's new updatedAt. */
  onSaved?: (updatedAt: string) => void;
  /** The set of unsaved changes changed (to keep a copy in sessionStorage). */
  onPendingChange?: (changed: ReadonlySet<FieldKey>) => void;
};

/**
 * Auto-save for the post form (bug 2.2: patch saves). Only answers the person changed are sent
 * (`markChanged`), about 1.5 s after the last change and again on Next/Back; an answer that was not
 * touched is never written. Saves run one after another (never out of order). A field changed again
 * while its save is on the way stays "changed" for the next save. Other actions (photos, calendar…)
 * report their state through `track()` so the "Saved" indicator covers them too.
 */
export function useAutosave(options: AutosaveOptions) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const changed = useRef(new Set<FieldKey>());
  const pendingStep = useRef<SavableStepKey | null>(null);
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
  const notifyPending = () => opts.current.onPendingChange?.(changed.current);

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

  /** The person changed these answers (they are sent with the next save of a step that owns them). */
  const markChanged = useCallback((fields: readonly FieldKey[]) => {
    for (const field of fields) changed.current.add(field);
    notifyPending();
  }, []);

  /**
   * Saves the changed answers of `step` (and `wizardStep` for drafts). Nothing changed: only the
   * step is remembered, or nothing is sent at all.
   */
  const saveNow = useCallback((step: SavableStepKey, wizardStep?: number): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      const { listingId, getValues, isDraft } = opts.current;
      const draftStep = isDraft() ? wizardStep : undefined;
      const data = pickChanged(step, getValues(), changed.current);
      if (Object.keys(data).length === 0) {
        if (draftStep !== undefined) void saveWizardStep(listingId, draftStep).catch(() => undefined);
        return true;
      }
      begin();
      try {
        const result = await updateDraft(listingId, step, data, { wizardStep: draftStep });
        if (result.ok) {
          for (const field of confirmedFields(data, opts.current.getValues())) changed.current.delete(field);
          notifyPending();
          opts.current.onSaved?.(result.data.updatedAt);
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
  }, []);

  /** Schedules a save of `step` (debounced). */
  const schedule = useCallback(
    (step: SavableStepKey) => {
      pendingStep.current = step;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const job = pendingStep.current;
        pendingStep.current = null;
        if (job) void saveNow(job);
      }, AUTOSAVE_DELAY_MS);
    },
    [saveNow],
  );

  /**
   * Saves every changed answer right away and waits for the queue: `active` first (with
   * `wizardStep` for drafts), then any other step that owns a changed field. Resolves false when a
   * save failed.
   */
  const flush = useCallback(
    async (active?: SavableStepKey, wizardStep?: number): Promise<boolean> => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const scheduled = pendingStep.current;
      pendingStep.current = null;
      const first = active ?? scheduled ?? undefined;
      let okay = true;
      if (first) okay = (await saveNow(first, wizardStep)) && okay;
      else if (wizardStep !== undefined && opts.current.isDraft()) {
        void saveWizardStep(opts.current.listingId, wizardStep).catch(() => undefined);
      }
      for (const step of stepsToSave(changed.current, opts.current.getKind()).filter((s) => s !== first)) {
        okay = (await saveNow(step)) && okay;
      }
      await chain.current.catch(() => undefined);
      return okay;
    },
    [saveNow],
  );

  /** Fields changed and not saved yet (a copy). */
  const changedFields = useCallback((): ReadonlySet<FieldKey> => new Set(changed.current), []);
  const isSaving = useCallback(() => inFlight.current > 0, []);

  // Warn before closing the tab while something is not saved yet.
  const warn = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!warn.current && timer.current === null && inFlight.current === 0) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  useEffect(() => {
    warn.current = state.status === "error" && changed.current.size > 0;
  }, [state]);

  return { state, schedule, flush, saveNow, track, markChanged, changedFields, isSaving, serverIssues };
}
