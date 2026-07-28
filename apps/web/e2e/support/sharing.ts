import type { Page } from "@playwright/test"

// The sharing worker is the app's second network dependency (after GitHub
// search). The specs mock it at the browser boundary: what these test is the
// app's half of the round trip, not KV — apps/server has its own suite.

export const SHARE_API = "http://localhost:8787"

export const STORED_ID = "Ab3xY9_Q"

// A payload as the worker would return it: real catalog ids, since the app
// prunes anything its catalog does not know.
export const STORED_PAYLOAD = {
  v: 1,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {
    "web-framework-react": {
      model: "opus",
      effort: "ultra",
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
    },
  },
}

export const stubCreateConfig = (page: Page) =>
  page.route(`${SHARE_API}/configs`, (route) =>
    route.fulfill({ status: 201, json: { id: STORED_ID } })
  )

export const stubGetConfig = (page: Page, id: string) =>
  page.route(`${SHARE_API}/configs/${id}`, (route) =>
    route.fulfill({ status: 200, json: STORED_PAYLOAD })
  )

export const stubGetConfigMissing = (page: Page, id: string) =>
  page.route(`${SHARE_API}/configs/${id}`, (route) =>
    route.fulfill({ status: 404, body: "No config under this id" })
  )
