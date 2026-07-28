import { expect, test } from "../fixtures"
import { STACKS } from "../support/catalog"

// The roster stores nothing — every line is derived from `assignments`. These
// assertions are the guard on that: if a copy is ever introduced, the summary
// and the lists will disagree with the grid.
test.describe("roster panel", () => {
  test("starts empty", async ({ configure }) => {
    await expect(configure.roster.summary).toContainText("0 skills")
    await expect(configure.roster.summary).toContainText("0 assignments")
    await expect(configure.roster.root).toContainText(
      "No sub-agents assigned yet."
    )
  })

  test("lists every sub-agent that exists, assigned or not", async ({
    configure,
  }) => {
    await expect(configure.roster.root).toContainText("Available sub-agents")
    await expect(configure.roster.root).toContainText("developer")
  })

  test("applying a stack populates the in-use list and the counts", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.root).not.toContainText(
      "No sub-agents assigned yet."
    )
    await expect(configure.roster.summary).not.toContainText("0 skills")
    await expect(configure.roster.summary).not.toContainText("0 assignments")
  })

  test("load state renders as a word, never an icon", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.root).toContainText(/preloaded|lazy/)
  })

  test("sections collapse and expand", async ({ configure }) => {
    await expect(configure.roster.availableSection).toHaveAttribute(
      "aria-expanded",
      "true"
    )

    await configure.roster.toggleAvailable()
    await expect(configure.roster.availableSection).toHaveAttribute(
      "aria-expanded",
      "false"
    )

    await configure.roster.toggleAvailable()
    await expect(configure.roster.availableSection).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })
})
