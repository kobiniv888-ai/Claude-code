import type { ShownText } from "@/lib/reviews/rules";
import { cn } from "@/lib/utils";

/**
 * A review's (or a reply's) text: the machine translation into the reader's language when there
 * is one, with "תורגם אוטומטית · הצגת המקור" — and back with "הצגת התרגום". The switch is a
 * visually hidden checkbox and two labels (CSS :has), so it costs no JavaScript on the listing page
 * and works before anything hydrates. Without a translation, the original shows as written.
 * User text: dir="auto", and the original carries its language.
 */
export function ReviewText({
  id,
  body,
  labels,
  className,
}: {
  /** Unique on the page (the review's id plus "reply" for a reply). */
  id: string;
  body: ShownText;
  labels: { translated: string; showOriginal: string; showTranslation: string };
  className?: string;
}) {
  const text = "text-body whitespace-pre-line text-pretty break-words";
  if (!body.translated) {
    return (
      <p dir="auto" lang={body.language} className={cn(text, className)}>
        {body.original}
      </p>
    );
  }
  const inputId = `${id}-original`;
  const label =
    "inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-primary-text underline underline-offset-4 sm:min-h-0 group-has-[:focus-visible]/review-text:ring-3 group-has-[:focus-visible]/review-text:ring-ring/50";
  return (
    <div className={cn("group/review-text grid gap-1", className)}>
      <input id={inputId} type="checkbox" className="peer sr-only" aria-label={labels.showOriginal} />
      <p dir="auto" className={cn(text, "peer-checked:hidden")}>
        {body.shown}
      </p>
      <p dir="auto" lang={body.language} className={cn(text, "hidden peer-checked:block")}>
        {body.original}
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
        <span>{labels.translated}</span>
        <span aria-hidden="true">·</span>
        <label htmlFor={inputId} className={cn(label, "group-has-[:checked]/review-text:hidden")}>
          {labels.showOriginal}
        </label>
        <label htmlFor={inputId} className={cn(label, "hidden group-has-[:checked]/review-text:inline-flex")}>
          {labels.showTranslation}
        </label>
      </p>
    </div>
  );
}
