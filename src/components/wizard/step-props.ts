import type { AppLocale } from "@/config/site";
import type { PledgeStatus } from "@/lib/pledge";
import type { StepIssues, WizardValues } from "@/lib/wizard/schemas";
import type { ListingKind, WizardStepKey } from "@/lib/wizard/steps";
import type {
  DayRange,
  PublishOutcome,
  WizardContext,
  WizardListing,
  WizardPhoto,
  WizardRoomType,
  WizardTranslation,
} from "@/lib/wizard/types";

/** What every step component receives from the wizard shell. */
export type StepProps = {
  listing: WizardListing;
  context: WizardContext;
  locale: AppLocale;
  values: WizardValues;
  kind: ListingKind;
  /** Update some values (auto-saved after a short pause). */
  set: (patch: Partial<WizardValues>) => void;
  /** Visible validation issues: field → translated message. */
  errors: Record<string, string | null>;
  /** Raw issue codes (for steps that need them). */
  issues: StepIssues;
  photos: WizardPhoto[];
  setPhotos: (update: (photos: WizardPhoto[]) => WizardPhoto[]) => void;
  roomTypes: WizardRoomType[];
  setRoomTypes: (update: (rooms: WizardRoomType[]) => WizardRoomType[]) => void;
  blocked: DayRange[];
  setBlocked: (ranges: DayRange[]) => void;
  translations: WizardTranslation[];
  setTranslations: (update: (list: WizardTranslation[]) => WizardTranslation[]) => void;
  /** Moves to another step (saving first). */
  goTo: (step: WizardStepKey) => void;
  /** Saves the current step now; resolves false when it failed. */
  flush: () => Promise<boolean>;
  onPublished: (outcome: PublishOutcome) => void;
  /** Marks the deal/property choice as made (steps 1–2 start empty on a new draft). */
  chosen: { deal: boolean; property: boolean };
  setChosen: (patch: Partial<{ deal: boolean; property: boolean }>) => void;
  /** Reports a save state for actions the step runs itself (photos, calendar…). */
  track: <T>(promise: Promise<T>) => Promise<T>;
  /** The owner's Bayit welcome pledge (accepted in the pledge step; publishing needs the current version). */
  pledge: PledgeStatus;
  setPledge: (status: PledgeStatus) => void;
};
