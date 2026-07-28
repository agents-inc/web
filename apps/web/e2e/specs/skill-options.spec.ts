import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, SKILL_OPTIONS } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY
const MATRIX_DOMAIN = "Web"
const MATRIX_ROLE = "dev"

test.describe("skill options panel", () => {
  test("the ellipsis opens the panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.options.root).toBeHidden()
    await skill.openOptions()
    await expect(skill.options.root).toBeVisible()
  })

  test("opening on an unselected skill selects it", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await skill.openOptions()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
    await expect(skill.options.root).toBeVisible()
  })

  test("the ellipsis closes an open panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.openOptions()
    await expect(skill.options.root).toBeHidden()
  })

  test("Escape closes the panel", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await page.keyboard.press("Escape")
    await expect(skill.options.root).toBeHidden()
  })

  test("a press outside closes the panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await configure.roster.summary.click()
    await expect(skill.options.root).toBeHidden()
  })

  test("model and effort rest on their defaults", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(
      skill.options.option(SKILL_OPTIONS.defaultModel)
    ).toHaveAttribute("aria-pressed", "true")
    await expect(
      skill.options.option(SKILL_OPTIONS.defaultEffort)
    ).toHaveAttribute("aria-pressed", "true")
  })

  test("choosing a model moves the selection", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.choose("opus")

    await expect(skill.options.option("opus")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      skill.options.option(SKILL_OPTIONS.defaultModel)
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("the panel's install mode stays in sync with the cell badge", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.choose("eject")

    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
  })

  test("a cell badge flip is reflected back in the panel", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.flipScope()
    await skill.openOptions()

    await expect(skill.options.option("global")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

test.describe("sub-agent assignment", () => {
  test("a matrix cell cycles unassigned, lazy, preloaded", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const cell = skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(cell).toHaveText("")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("lazy")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("pre")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("")
  })

  test("assigning updates the cell's agent count", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(skill.agentCount).toHaveText("0 agents")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(skill.agentCount).toHaveText("1 agent")
  })

  test("assigning moves the sub-agent into the roster", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(configure.roster.root).toContainText(
      "No sub-agents assigned yet."
    )
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(configure.roster.root).not.toContainText(
      "No sub-agents assigned yet."
    )
    await expect(configure.roster.summary).toContainText("1 assignments")
  })
})
