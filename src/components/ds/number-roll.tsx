import { useLocale } from "next-intl";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll to the new value (odometer style, transform only), e.g. the live
 * count on "Show 24 places". Screen readers get the final number only. Reduced motion: instant.
 * No state of its own: it animates whenever the parent re-renders it with a new `value`.
 *
 *   <Button><span>{t.rich("showResults", { count, n: () => <NumberRoll value={count} /> })}</span></Button>
 *   (wrap the sentence in one span inside a Button: it is a flex row with gaps)
 */
export function NumberRoll({ value, className }: { value: number; className?: string }) {
  const locale = useLocale();
  const text = formatNumber(value, locale);
  const chars = [...text];
  return (
    <span className={cn("inline-flex", className)}>
      <span aria-hidden="true" dir="ltr" className="inline-flex tabular-nums">
        {chars.map((char, i) => {
          // Keyed from the end, so the ones column stays the same element as the number grows.
          const key = chars.length - i;
          const digit = DIGITS.indexOf(char);
          if (digit < 0) return <span key={`s${key}`}>{char}</span>;
          return (
            <span key={`d${key}`} className="relative inline-block h-[1lh] overflow-hidden">
              <span
                className="flex flex-col transition-transform duration-(--motion-slow) ease-soft motion-reduce:transition-none"
                style={{ transform: `translateY(${-digit * 10}%)` }}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="h-[1lh]">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
