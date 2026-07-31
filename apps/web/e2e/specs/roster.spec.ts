import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// The roster stores nothing — every line is derived from `assignments` and
// `pins`. These assertions are the guard on that: if a copy is ever
// introduced, the bands, the rows and the Install label will disagree with
// the grid.
test.describe("roster panel", () => {
  test("starts with every agent off", async ({ configure }) => {
    await expect(configure.roster.installButton).toContainText(
      "0 sub-agents and 0 skills"
    )
    await expect(configure.roster.domainBand("web")).toContainText("0 of")
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
  })

  test("lists every domain that has agents", async ({ configure }) => {
    for (const domainId of ["web", "api", "ai", "cli", "infra", "meta"]) {
      await expect(configure.roster.domainBand(domainId)).toBeVisible()
    }
  })

  // The headline behaviour: selecting a skill assigns it to the domain's core
  // agents, which is what switches them on.
  test("selecting a skill enables its domain's core agents", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(configure.roster.domainBand("web")).toContainText("4 of")
    for (const role of ["developer", "pm", "reviewer", "tester"]) {
      await expect(configure.roster.agentButton("web", role)).toHaveAttribute(
        "aria-pressed",
        "true"
      )
      await expect(
        configure.roster.skillRow(REACT, `web-${role}`)
      ).toBeVisible()
    }
    await expect(configure.roster.installButton).toContainText(
      "4 sub-agents and 1 skill"
    )
  })

  test("a framework arrives preloaded on every agent it reaches", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(
      configure.roster.loadWord(REACT, "web-developer")
    ).toHaveAccessibleName("Load mode: preloaded")
  })

  test("the reached agents pulse when the selection lands, then decay", async ({
    configure,
    page,
  }) => {
    // Pinned clock: the pulse's 2.6s decay must not race the assertions.
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const developer = configure.roster.agentButton("web", "developer")

    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(developer).toHaveClass(/bg-flash/)

    await page.clock.fastForward(2600)
    await expect(developer).not.toHaveClass(/bg-flash/)
  })

  test("deselecting clears an in-flight pulse", async ({ configure, page }) => {
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    const developer = configure.roster.agentButton("web", "developer")
    const react = configure.skillIn(web, CATEGORY, REACT)

    await react.toggle()
    await expect(developer).toHaveClass(/bg-flash/)

    await react.toggle()
    await expect(developer).not.toHaveClass(/bg-flash/)
  })

  test("clicking an agent pins it off and back on", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const developer = configure.roster.agentButton("web", "developer")

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.domainBand("web")).toContainText("3 of")
    // The deselected agent keeps its skills listed, recessed.
    await expect(
      configure.roster.skillRow(REACT, "web-developer")
    ).toBeVisible()

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.domainBand("web")).toContainText("4 of")
  })

  test("a pinned bare agent reads as a base agent", async ({ configure }) => {
    await configure.roster.agentButton("web", "developer").click()

    await expect(configure.roster.root).toContainText("no skills — base agent")
    await expect(configure.roster.installButton).toContainText(
      "1 sub-agent and 0 skills"
    )
  })

  test("clicking a skill row switches that copy off without removing it", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const row = configure.roster.skillRow(REACT, "web-developer")

    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "false")
    // Its agent loses its only skill and derives off; the grid count follows.
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "false")
    await expect(configure.skillIn(web, CATEGORY, REACT).agentCount).toHaveText(
      "3 agents"
    )

    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "true")
  })

  test("the load word flips between pre and lazy", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const load = configure.roster.loadWord(REACT, "web-developer")

    await load.click()
    await expect(load).toHaveAccessibleName("Load mode: lazy")
    await load.click()
    await expect(load).toHaveAccessibleName("Load mode: preloaded")
  })

  test("domains collapse and expand", async ({ configure }) => {
    const band = configure.roster.domainBand("web")
    const developer = configure.roster.agentButton("web", "developer")

    await expect(band).toHaveAttribute("aria-expanded", "true")
    await expect(developer).toBeVisible()

    await configure.roster.toggleDomain("web")
    await expect(band).toHaveAttribute("aria-expanded", "false")
    await expect(developer).toBeHidden()

    await configure.roster.toggleDomain("web")
    await expect(developer).toBeVisible()
  })

  // Only skills on more than one agent get a target, and the tooltip names
  // every carrier with the pointed-from agent marked.
  test("hovering the where-used number lists every carrier", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const uses = configure.roster.whereUsed(REACT, "web-developer")

    await expect(uses).toHaveText("4")
    await uses.hover()

    const tip = configure.roster.whereUsedTip
    await expect(tip).toBeVisible()
    await expect(tip).toContainText("web developer")
    await expect(tip).toContainText("web tester")

    await configure.roster.heading.hover()
    await expect(tip).toBeHidden()
  })

  test("applying a stack populates agents and counts", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.installButton).not.toContainText(
      "0 sub-agents"
    )
    await expect(configure.roster.domainBand("web")).not.toContainText("0 of")
  })

  test("load state renders as a word, never an icon", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    // Anchored on the load-word button itself, so a skill-name substring
    // elsewhere in the panel can never satisfy it.
    await expect(
      configure.roster.loadWord(STACK_MEMBER_SKILL, "web-developer")
    ).toHaveText(/^(pre|lazy)$/)
  })
})
