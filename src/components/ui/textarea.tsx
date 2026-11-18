import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-input border border-border-strong bg-card px-3 py-2.5 text-base transition-colors outline-none placeholder:text-placeholder focus-visible:border-primary-text focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60 aria-invalid:border-error aria-invalid:ring-3 aria-invalid:ring-error/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
