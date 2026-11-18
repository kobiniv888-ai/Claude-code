/**
 * Patch saves for the post form (bug 2.2, client-safe and pure).
 *
 * The form only ever sends the answers the person changed since the last confirmed save. An
 * answer they did not touch is never written, so a step that shows old or empty answers (a page
 * restored from the browser's cache, a slow load) can no longer write blanks over saved ones.
 * Clearing a field on purpose is a change like any other and is saved.
 */
import { PROPERTY_TYPES_BY_DEAL } from "@/lib/listing/fields";
import { STEP_FIELDS, type WizardValues } from "./schemas";
import { SAVABLE_STEPS, stepsFor, type ListingKind, type SavableStepKey } from "./steps";

export type FieldKey = keyof WizardValues;

/** Every field the form edits (for checking keys that come back from the browser's storage). */
const ALL_FIELDS: ReadonlySet<string> = new Set(SAVABLE_STEPS.flatMap((step) => STEP_FIELDS[step] as readonly string[]));

export function isFieldKey(key: string): key is FieldKey {
  return ALL_FIELDS.has(key);
}

/** The changed answers that `step` saves (only fields of that step, only changed ones). */
export function pickChanged(step: SavableStepKey, values: WizardValues, changed: ReadonlySet<FieldKey>): Partial<WizardValues> {
  const out: Record<string, unknown> = {};
  for (const key of STEP_FIELDS[step] as readonly FieldKey[]) {
    if (changed.has(key)) out[key] = values[key];
  }
  return out as Partial<WizardValues>;
}

/**
 * The steps that save the changed fields, in form order: `active` first (when it owns any of
 * them), then for every other field the first step of this listing that owns it. Used when the
 * form leaves a step, so a change can never be left behind unsaved.
 */
export function stepsToSave(changed: ReadonlySet<FieldKey>, kind: ListingKind, active?: SavableStepKey): SavableStepKey[] {
  const order: SavableStepKey[] = [];
  const left = new Set(changed);
  const take = (step: SavableStepKey) => {
    const owned = (STEP_FIELDS[step] as readonly FieldKey[]).filter((key) => left.has(key));
    if (owned.length === 0) return;
    order.push(step);
    for (const key of owned) left.delete(key);
  };
  if (active) take(active);
  const visible = stepsFor(kind);
  for (const step of SAVABLE_STEPS) if (visible.includes(step)) take(step);
  // A field no visible step owns (e.g. left over from another deal type): any owner saves it.
  for (const step of SAVABLE_STEPS) take(step);
  return order;
}

/** The keys of `data` that belong to `step` (the zod `pick` mask the server validates with). */
export function presentStepKeys(step: SavableStepKey, data: unknown): FieldKey[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  return (STEP_FIELDS[step] as readonly FieldKey[]).filter((key) => Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined);
}

/** Server answers, with the fields the person changed (and has not saved yet) kept as they are now. */
export function mergeAnswers(server: WizardValues, current: WizardValues, changed: ReadonlySet<FieldKey>): WizardValues {
  const merged: Record<string, unknown> = { ...server };
  for (const key of changed) merged[key] = current[key];
  return merged as WizardValues;
}

/** JSON equality for answers (arrays, null and numbers). */
export function sameAnswer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * After a save resolves: the fields that are now saved (sent and not changed again while the
 * request was on its way). A field typed into during the save stays "changed" for the next one.
 */
export function confirmedFields(sent: Partial<WizardValues>, now: WizardValues): FieldKey[] {
  return (Object.keys(sent) as FieldKey[]).filter((key) => sameAnswer(sent[key], now[key]));
}

// ─── Which of steps 1–2 were answered ─────────────────────────

/**
 * Steps 1–2 start without a selection on a new draft (the database has defaults, so a value alone
 * does not prove a choice). Instead of guessing from the time since creation:
 * - the deal type is chosen once the draft was saved at all (only step 1 can save a pristine draft)
 *   or the person got past step 1;
 * - the place type is chosen once they got past step 2, picked a type other than the deal's
 *   default, or answered anything after step 2.
 */
export function answeredChoices(input: {
  status: string;
  wizardStep: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  values: WizardValues;
  photoCount: number;
}): { deal: boolean; property: boolean } {
  if (input.status !== "DRAFT") return { deal: true, property: true };
  const { values } = input;
  const touched = new Date(input.updatedAt).getTime() > new Date(input.createdAt).getTime();
  const laterAnswers =
    values.cityId !== null ||
    values.lat !== null ||
    values.address.trim() !== "" ||
    values.title.trim() !== "" ||
    values.description.trim() !== "" ||
    values.price !== null ||
    values.rooms !== null ||
    values.sizeSqm !== null ||
    values.amenities.length > 0 ||
    values.contactMethods.length > 0 ||
    input.photoCount > 0;
  const defaultType = PROPERTY_TYPES_BY_DEAL[values.dealType][0];
  const property = input.wizardStep > 2 || laterAnswers || values.propertyType !== defaultType;
  const deal = property || input.wizardStep > 1 || touched;
  return { deal, property };
}


// ─── Unsent changes (kept in sessionStorage) ──────────────────

/** Answers changed in this tab that may not have reached the server (bug 2.2). */
export type UnsentChanges = {
  v: 1;
  /** The listing's updatedAt the browser knew when the answers were changed. */
  base: string;
  /** When they were changed (the browser's clock, ms). */
  changedAt: number;
  fields: Partial<WizardValues>;
};

/** Reads a stored entry back (anything malformed or with unknown fields is dropped). */
export function parseUnsent(raw: string | null): UnsentChanges | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<UnsentChanges> | null;
    if (!value || value.v !== 1 || typeof value.base !== "string" || typeof value.changedAt !== "number") return null;
    if (!value.fields || typeof value.fields !== "object" || Array.isArray(value.fields)) return null;
    const fields: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value.fields)) if (isFieldKey(key)) fields[key] = field;
    if (Object.keys(fields).length === 0) return null;
    return { v: 1, base: value.base, changedAt: value.changedAt, fields: fields as Partial<WizardValues> };
  } catch {
    return null;
  }
}

/**
 * Restore unsent answers over the server's? Yes when the server has not changed since they were
 * made, or when they were made after the server's last change (clocks compared through the
 * snapshot's `serverNow`, received at `receivedAt` on the browser's clock).
 */
export function unsentIsNewer(entry: UnsentChanges, snapshot: { updatedAt: string; serverNow: string }, receivedAt: number): boolean {
  if (entry.base === snapshot.updatedAt) return true;
  const skew = Date.parse(snapshot.serverNow) - receivedAt;
  const changedOnServerClock = entry.changedAt + (Number.isFinite(skew) ? skew : 0);
  return changedOnServerClock > Date.parse(snapshot.updatedAt);
}
