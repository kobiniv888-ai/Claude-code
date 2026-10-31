"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

/**
 * Six digit boxes for login and authenticator codes. Left-to-right in every language,
 * digits only, works with paste and the iOS/Android "code from Messages" suggestion.
 */
export function CodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  describedBy,
  label,
  autoComplete = "one-time-code",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  /** Accessible name (the visible label should point at `id`). */
  label: string;
  autoComplete?: string;
}) {
  return (
    <div dir="ltr" className="flex justify-center">
      <InputOTP
        id={id}
        maxLength={6}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        containerClassName="gap-2"
      >
        <InputOTPGroup className="gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={invalid || undefined}
              className={cn(
                "size-10 rounded-lg border border-input text-lg font-semibold tabular-nums first:rounded-s-lg last:rounded-e-lg min-[400px]:size-11 sm:size-12 sm:text-xl",
                "bg-background shadow-xs",
              )}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
