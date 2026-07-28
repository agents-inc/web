import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
} from "../support/catalog"

// The catalogue is regenerated from the agents-inc CLI, so the fixed points the
// other specs lean on will drift eventually. These assertions exist so that
// drift surfaces as one failure naming the value that moved, rather than as
// every other spec going red at once.
test.describe("catalog assumptions", () => {
  test("the stacks the specs use are present", async ({ configure }) => {
    for (const name of Object.values(STACKS)) {
      await expect(configure.stack(name)).toBeVisible()
    }
  })

  test("the domains the specs use are present", async ({ configure }) => {
    for (const label of Object.values(DOMAINS)) {
      await expect(configure.domain(label)).toBeVisible()
    }
  })

  test("the exclusive category holds both skills and is tagged", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)

    await expect(category).toContainText(EXCLUSIVE_CATEGORY.tag)
    await expect(
      configure.skill(EXCLUSIVE_CATEGORY.first, category).root
    ).toBeVisible()
    await expect(
      configure.skill(EXCLUSIVE_CATEGORY.second, category).root
    ).toBeVisible()
  })

  test("the multi category holds both skills and is tagged", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, MULTI_CATEGORY.name)

    await expect(category).toContainText(MULTI_CATEGORY.tag)
    await expect(
      configure.skill(MULTI_CATEGORY.first, category).root
    ).toBeVisible()
    await expect(
      configure.skill(MULTI_CATEGORY.second, category).root
    ).toBeVisible()
  })
})
