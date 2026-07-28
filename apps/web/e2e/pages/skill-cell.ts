import type { Locator, Page } from "@playwright/test"

import { OptionsPanel } from "./options-panel"

// One skill cell. The cell itself is the selection target; the badges, the
// agent count and the ••• each stop propagation and do their own thing, so all
// four are exposed separately.
export class SkillCell {
  readonly root: Locator
  readonly options: OptionsPanel

  constructor(
    private readonly page: Page,
    readonly name: string,
    scope: Locator | Page = page
  ) {
    this.root = scope.getByRole("button", { name, exact: true })
    this.options = new OptionsPanel(page)
  }

  // The install-mode badge, whose accessible name carries its current value.
  get installBadge(): Locator {
    return this.root.getByRole("button", { name: /^Install mode: / })
  }

  get scopeBadge(): Locator {
    return this.root.getByRole("button", { name: /^Scope: / })
  }

  get optionsButton(): Locator {
    return this.root.getByRole("button", { name: `Options for ${this.name}` })
  }

  // Only rendered on selected skills.
  get agentCount(): Locator {
    return this.root.getByRole("button", { name: /agents?$/ })
  }

  async toggle() {
    await this.root.click()
  }

  async openOptions() {
    await this.optionsButton.click()
  }

  async flipInstall() {
    await this.installBadge.click()
  }

  async flipScope() {
    await this.scopeBadge.click()
  }

  async isSelected() {
    return (await this.root.getAttribute("aria-pressed")) === "true"
  }
}
