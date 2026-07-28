import type { Locator, Page } from "@playwright/test"

/**
 * The right column. Everything here is derived from `assignments`, so it is
 * the natural place to assert that a change in the grid propagated.
 */
export class RosterPanel {
  readonly root: Locator
  readonly summary: Locator
  readonly installButton: Locator
  readonly availableSection: Locator
  readonly inUseSection: Locator

  constructor(page: Page) {
    this.root = page.getByRole("complementary")
    this.summary = this.root.locator("p").last()
    this.installButton = this.root.getByRole("button", { name: "Install" })
    this.availableSection = this.root.getByRole("button", {
      name: /Available sub-agents/,
    })
    this.inUseSection = this.root.getByRole("button", {
      name: /In use sub-agents/,
    })
  }

  /** A skill line under an in-use sub-agent, with its load state beside it. */
  skillLine(skillName: string): Locator {
    return this.root.locator("div").filter({ hasText: skillName }).last()
  }

  async toggleAvailable() {
    await this.availableSection.click()
  }

  async toggleInUse() {
    await this.inUseSection.click()
  }
}
