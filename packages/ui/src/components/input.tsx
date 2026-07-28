import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Both search fields in the design are borderless — the border belongs to the
 * bar or field wrapping them, so the input itself contributes only type. That
 * keeps the wrapper free to own focus and hover states for the whole row.
 */
const inputVariants = cva(
  "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono font-normal outline-none",
  {
    variants: {
      variant: {
        /** The filter bar. */
        search: "text-15 text-subtle placeholder:text-subtle",
        /** The add-skill dialog's GitHub search. */
        dialog: "text-13 text-ink placeholder:text-faint",
      },
    },
    defaultVariants: { variant: "search" },
  }
)

function Input({
  className,
  variant,
  type = "text",
  ...props
}: ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
