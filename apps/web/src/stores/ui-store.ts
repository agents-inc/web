import { create } from "zustand"
import { persist } from "zustand/middleware"

import { persistedUiSchema } from "./persisted-schema"

type UiState = {
  /** Which skill's ••• options panel is showing. Only one at a time. */
  openPanelSkillId: string | null
  /** Stack awaiting confirmation because applying it would discard edits. */
  pendingStackId: string | null | undefined
  dialog: "none" | "install" | "add"
  rosterCollapsed: { available: boolean; inUse: boolean }

  openPanel: (skillId: string | null) => void
  togglePanel: (skillId: string) => void
  requestStack: (stackId: string | null) => void
  dismissStackRequest: () => void
  setDialog: (dialog: UiState["dialog"]) => void
  toggleRosterSection: (section: keyof UiState["rosterCollapsed"]) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      openPanelSkillId: null,
      pendingStackId: undefined,
      dialog: "none",
      rosterCollapsed: { available: false, inUse: false },

      openPanel: (skillId) => set({ openPanelSkillId: skillId }),
      togglePanel: (skillId) =>
        set((state) => ({
          openPanelSkillId: state.openPanelSkillId === skillId ? null : skillId,
        })),

      requestStack: (stackId) => set({ pendingStackId: stackId }),
      dismissStackRequest: () => set({ pendingStackId: undefined }),
      setDialog: (dialog) => set({ dialog }),

      toggleRosterSection: (section) =>
        set((state) => ({
          rosterCollapsed: {
            ...state.rosterCollapsed,
            [section]: !state.rosterCollapsed[section],
          },
        })),
    }),
    {
      name: "agents-inc:ui:v1",
      version: 2,
      /** Everything else is ephemeral — reloading into an open panel or dialog is never right. */
      partialize: ({ rosterCollapsed }) => ({ rosterCollapsed }),
      merge: (persisted, current) => {
        const parsed = persistedUiSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
    }
  )
)
