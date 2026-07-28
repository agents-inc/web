import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

const BELOW_THE_BAR = 200
const PAST_THE_BAR = 1500

/**
 * The bar changes shape at the moment CSS pins it, and the domain headers
 * follow. Both states are published as attributes rather than React state, so
 * these read the attributes — which is also what the styling reads.
 */
test.describe("sticky filter bar", () => {
  test("is not stuck at rest", async ({ configure }) => {
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("is not stuck while it is still mid-column", async ({ configure }) => {
    await configure.scrollTo(BELOW_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("sticks once it reaches the top", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)
  })

  test("releases on the way back up", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await configure.scrollTo(0)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("stays usable while stuck", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).toBeVisible()
    await expect(configure.addSkillButton).toBeVisible()
  })
})

test.describe("sticky domain header", () => {
  test("takes an edge only while it holds the top of the column", async ({
    configure,
  }) => {
    const header = configure.domainHeader(DOMAINS.web)

    await expect(header).not.toHaveAttribute("data-pinned", "")

    await configure.scrollTo(PAST_THE_BAR)
    await expect(header).toHaveAttribute("data-pinned", "")
  })
})
