import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The collapsed hairline grid — design language rule 2, "borders only where
 * they mean something".
 *
 * Every line and every white surface belongs to a **cell**. The container is
 * transparent and borderless: it is a layout device, not a box. Cells draw a
 * full 1px border and are pulled back by 1px (`-mt-px -ml-px`) so each shared
 * edge is contributed by both neighbours and lands on the same physical line —
 * one continuous lattice with no doubled strokes and no container box.
 *
 * The design file puts `border-top`/`border-left` and a white background on the
 * *grid* instead, which is equivalent only while every row is full. Its mock
 * never shows a partial row; ours do constantly (a category with 1, 2 or 3
 * skills), and there the container approach paints white across the empty
 * columns and runs a rule out to the right of the last cell. Owning the border
 * per cell degrades correctly: two skills in a four-column row draw two boxes
 * and nothing else.
 *
 * Selection is an `outline` at `-outline-offset-1` so the amber lands exactly
 * on the cell's own hairline rather than displacing it, with `z-1` to raise it
 * over the neighbours it shares edges with.
 *
 * Used by the stack grid, every skill grid, and the add-skill result list.
 */
const latticeVariants = cva("grid", {
  variants: {
    columns: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
    },
  },
  defaultVariants: { columns: 4 },
})

function Lattice({
  className,
  columns,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeVariants>) {
  return (
    <div
      data-slot="lattice"
      className={cn(latticeVariants({ columns }), className)}
      {...props}
    />
  )
}

const latticeCellVariants = cva(
  "relative -mt-px -ml-px flex min-w-0 flex-col border border-hairline bg-cell",
  {
    variants: {
      interactive: {
        true: "cursor-pointer hover:bg-cell-hover",
        false: "",
      },
      selected: {
        true: "z-1 outline-1 -outline-offset-1 outline-brand",
        false: "",
      },
      /** Incompatible skills are shown but disabled — never hidden. */
      disabled: {
        true: "pointer-events-none opacity-40",
        false: "",
      },
      /**
       * Cells clip by default so a long name cannot bleed across a hairline.
       * A cell hosting an open popover must let it escape — the popover is
       * absolutely positioned just outside the cell's right edge.
       */
      overflow: {
        clip: "overflow-hidden",
        visible: "overflow-visible",
      },
    },
    defaultVariants: {
      interactive: true,
      selected: false,
      disabled: false,
      overflow: "clip",
    },
  }
)

function LatticeCell({
  className,
  interactive,
  selected,
  disabled,
  overflow,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeCellVariants>) {
  return (
    <div
      data-slot="lattice-cell"
      data-selected={selected || undefined}
      className={cn(
        latticeCellVariants({ interactive, selected, disabled, overflow }),
        className
      )}
      {...props}
    />
  )
}

/** A lattice whose cells are full-width rows rather than grid columns. */
function LatticeRows({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="lattice-rows" className={cn(className)} {...props} />
}

const latticeRowVariants = cva(
  "relative -mt-px flex cursor-pointer items-start gap-3 border border-hairline bg-cell px-3 py-2.5",
  {
    variants: {
      selected: {
        true: "z-1 outline-1 -outline-offset-1 outline-brand",
        false: "hover:bg-row-hover",
      },
    },
    defaultVariants: { selected: false },
  }
)

function LatticeRow({
  className,
  selected,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof latticeRowVariants>) {
  return (
    <div
      data-slot="lattice-row"
      data-selected={selected || undefined}
      className={cn(latticeRowVariants({ selected }), className)}
      {...props}
    />
  )
}

export {
  Lattice,
  LatticeCell,
  LatticeRow,
  LatticeRows,
  latticeCellVariants,
  latticeRowVariants,
  latticeVariants,
}
