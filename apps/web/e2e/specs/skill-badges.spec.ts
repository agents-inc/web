import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// The two state badges on a cell. Their accessible name carries the current
// value, so every assertion here reads the accessibility tree rather than the
// amber styling that also signals it.
test.describe("skill state badges", () => {
  test("install mode flips between plugin and eject", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
    await skill.flipInstall()
    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
    await skill.flipInstall()
    await expect(skill.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
  })

  test("scope flips between project and global", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.scopeBadge).toHaveAccessibleName("Scope: project")
    await skill.flipScope()
    await expect(skill.scopeBadge).toHaveAccessibleName("Scope: global")
  })

  test("flipping a badge on an unselected skill selects it first", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await skill.flipInstall()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
  })

  test("flipping a badge does not deselect the skill", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.toggle()
    await skill.flipInstall()
    await skill.flipScope()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
  })
})
