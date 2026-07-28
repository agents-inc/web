import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  STORED_ID,
  STORED_PAYLOAD,
  stubCreateConfig,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

test.describe("sharing a configuration", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("share stores the config and copies a fromId link", async ({
    configure,
    page,
  }) => {
    await stubCreateConfig(page)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain(`?fromId=${STORED_ID}`)
  })

  test("share offers nothing to an empty selection", async ({ configure }) => {
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("a failed store reads as failure and recovers", async ({
    configure,
    page,
  }) => {
    await page.route("**/configs", (route) => route.abort())
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Sharing failed" })
    ).toBeVisible()
    // The terminal state decays back to an actionable button.
    await expect(configure.roster.shareButton).toBeVisible()
  })
})

test.describe("opening a share link", () => {
  test("loads the shared config and strips the param", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const react = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    // Consumed once: a reload must show the user's edits, not the snapshot.
    await expect(page).toHaveURL("/")
  })

  test("carries the shared load states through to the roster", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const skillNames = Object.keys(STORED_PAYLOAD.skills)
    expect(skillNames).toHaveLength(1)
    await expect(configure.roster.summary).toContainText("1 skills")
    await expect(configure.roster.summary).toContainText("1 preloaded")
  })

  test("a dead link reports itself and leaves the config alone", async ({
    configure,
    page,
  }) => {
    await stubGetConfigMissing(page, "gone0000")
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.second)
      .toggle()

    await page.goto("/?fromId=gone0000")

    await expect(page.getByRole("alert")).toContainText(
      "points to nothing"
    )
    // Vue was selected before following the link and must still be.
    const vue = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(page).toHaveURL("/")
  })
})
