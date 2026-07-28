import { STACKS } from "@workspace/matrix"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@workspace/ui/components/alert-dialog"

import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"

// Applying a stack replaces every selection and assignment wholesale, so it
// needs confirming once the user has something to lose. `StackGrid` applies
// directly unless the configuration has been *edited* away from what the
// current stack produces, so reaching this dialog always means real work is at
// stake — never merely "a stack is currently applied".
export function StackSwitchDialog() {
  const pendingStackId = useUiStore((state) => state.pendingStackId)
  const dismiss = useUiStore((state) => state.dismissStackRequest)
  const applyStack = useConfigStore((state) => state.applyStack)
  const skillCount = useConfigStore((state) => Object.keys(state.skills).length)

  const open = pendingStackId !== undefined
  const targetName =
    pendingStackId === null
      ? "Start from scratch"
      : (STACKS.find((stack) => stack.id === pendingStackId)?.name ??
        "this stack")

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader title={`Switch to ${targetName}?`} />
        <AlertDialogDescription>
          You have changes that do not come from a stack. Switching replaces
          your current setup, discarding {skillCount} selected{" "}
          {skillCount === 1 ? "skill" : "skills"}, their options and their
          sub-agent assignments.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my setup</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (open) applyStack(pendingStackId)
              dismiss()
            }}
          >
            Switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
