import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web } = DOMAINS
const { name: EXCLUSIVE, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY
const MATRIX_DOMAIN = "Web"
const MATRIX_ROLE = "dev"

/**
 * Deselecting must not be destructive. One click removes a skill; the
 * configuration behind it can be a dozen, and the cell gives no warning
 * because deselect reads as "not included" rather than "erase my work".
 *
 * The rule is deliberately one sentence with no special case per category: a
 * skill remembers how you configured it, and a skill you have never configured
 * starts blank.
 */
test.describe("configuration survives deselection", () => {
  test("re-selecting restores install mode and scope", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.flipInstall()
    await react.flipScope()
    await react.toggle()
    await expect(react.root).toHaveAttribute("aria-pressed", "false")

    await react.toggle()

    await expect(react.installBadge).toHaveAccessibleName("Install mode: eject")
    await expect(react.scopeBadge).toHaveAccessibleName("Scope: global")
  })

  test("re-selecting restores sub-agent assignments", async ({ configure }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.openOptions()
    await react.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(react.agentCount).toHaveText("1 agent")
    await configure.roster.summary.click()

    await react.toggle()
    await react.toggle()

    await expect(react.agentCount).toHaveText("1 agent")
    await expect(configure.roster.summary).toContainText("1 assignments")
  })

  test("re-selecting restores model and effort", async ({ configure }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.openOptions()
    await react.options.choose("opus")
    await react.options.choose("high")
    await configure.roster.summary.click()

    await react.toggle()
    await react.toggle()
    await react.openOptions()

    await expect(react.options.option("opus")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(react.options.option("high")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  /**
   * The case that matters most: a stack hands a skill a set of sub-agent
   * assignments the user never clicked, and losing those to a stray toggle
   * would be exactly as costly as losing ones they built by hand.
   */
  test("a stack-provided skill keeps its assignments through a toggle", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const react = configure.skillIn(web, EXCLUSIVE, STACK_MEMBER_SKILL)

    const assigned = await react.agentCount.textContent()
    expect(assigned).not.toBe("0 agents")

    await react.toggle()
    await expect(react.root).toHaveAttribute("aria-pressed", "false")
    await react.toggle()

    await expect(react.agentCount).toHaveText(assigned ?? "")
  })

  test("a stack-provided skill keeps its options through a toggle", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const react = configure.skillIn(web, EXCLUSIVE, STACK_MEMBER_SKILL)

    await react.flipScope()
    await react.toggle()
    await react.toggle()

    await expect(react.scopeBadge).toHaveAccessibleName("Scope: global")
  })

  test("an empty skill starts blank rather than remembering nothing", async ({
    configure,
  }) => {
    const skill = configure.skillIn(
      web,
      MULTI_CATEGORY.name,
      MULTI_CATEGORY.first
    )

    await skill.toggle()
    await skill.toggle()
    await skill.toggle()

    await expect(skill.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
    await expect(skill.agentCount).toHaveText("0 agents")
  })
})

/**
 * An eviction is a deselection the user did not click, so it keeps the same
 * promise — while the skill replacing it has never been configured and must
 * start blank.
 */
test.describe("configuration survives an exclusive swap", () => {
  test("the incoming skill starts blank", async ({ configure }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)
    const vue = configure.skillIn(web, EXCLUSIVE, VUE)

    await react.flipInstall()
    await vue.toggle()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.installBadge).toHaveAccessibleName("Install mode: plugin")
  })

  test("swapping back restores the evicted skill", async ({ configure }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)
    const vue = configure.skillIn(web, EXCLUSIVE, VUE)

    await react.flipInstall()
    await react.openOptions()
    await react.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await configure.roster.summary.click()

    await vue.toggle()
    await expect(react.root).toHaveAttribute("aria-pressed", "false")

    await react.toggle()

    await expect(react.installBadge).toHaveAccessibleName("Install mode: eject")
    await expect(react.agentCount).toHaveText("1 agent")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("memory boundaries", () => {
  /** Applying a stack is the explicit start-over action. */
  test("applying a stack forgets everything set aside", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.flipInstall()
    await react.toggle()
    await configure.chooseStack(STACKS.t3)
    await react.toggle()

    await expect(react.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
  })

  test("a deselected skill is absent from the roster and counts", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.openOptions()
    await react.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await configure.roster.summary.click()
    await react.toggle()

    await expect(configure.roster.summary).toContainText("0 skills")
    await expect(configure.roster.summary).toContainText("0 assignments")
    await expect(configure.roster.root).toContainText(
      "No sub-agents assigned yet."
    )
  })

  test("memory survives a reload", async ({ configure, page }) => {
    const react = configure.skillIn(web, EXCLUSIVE, REACT)

    await react.flipInstall()
    await react.toggle()

    await page.reload()
    await configure.stacks.waitFor()

    await configure.skillIn(web, EXCLUSIVE, REACT).toggle()
    await expect(
      configure.skillIn(web, EXCLUSIVE, REACT).installBadge
    ).toHaveAccessibleName("Install mode: eject")
  })
})
