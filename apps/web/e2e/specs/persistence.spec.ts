import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import {
  SEARCH_RESULTS,
  SEARCH_TERM,
  mockGitHubSearch,
  repoSkillName,
} from "../support/github"

const { web } = DOMAINS
const { name: CATEGORY } = EXCLUSIVE_CATEGORY
const CONFIG_KEY = "agents-inc:config:v1"
const [FIRST] = SEARCH_RESULTS
const ADDED_SKILL = repoSkillName(FIRST!.full_name)

test.describe("persistence", () => {
  test("the configuration survives a reload", async ({ configure, page }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).installBadge
    ).toHaveAccessibleName("Install mode: eject")
  })

  /** Corrupt storage must reset to empty rather than take the app down. */
  test("unreadable storage falls back to an empty configuration", async ({
    configure,
    page,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await page.evaluate(
      (key) => localStorage.setItem(key, "{ not json at all"),
      CONFIG_KEY
    )

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.summary).toContainText("0 skills")
  })
})

/**
 * Added skills are session-only by design: they have no catalogue entry, so a
 * selection referencing one must not survive into a session that cannot
 * describe or install it.
 */
test.describe("session-added skills are not persisted", () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubSearch(page)
  })

  test("an added skill disappears on reload", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)
    await configure.addSkillDialog.stage(FIRST!.full_name)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    await expect(configure.skill(ADDED_SKILL).root).toBeVisible()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.skill(ADDED_SKILL).root).toBeHidden()
  })

  test("its selection never reaches storage", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)
    await configure.addSkillDialog.stage(FIRST!.full_name)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key) ?? "",
      CONFIG_KEY
    )
    expect(stored).not.toContain(FIRST!.full_name)
  })
})
