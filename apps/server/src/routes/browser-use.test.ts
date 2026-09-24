import { describe, expect, it } from "vitest"

import { jsonRequest, start } from "../test-support.js"

describe("browser-use routes", () => {
  it("persists local Browser Use selection without exposing extension downloads", async () => {
    const { server } = await start()
    const initial = await jsonRequest(server, "/v1/browser-use")
    expect(initial.status).toBe(200)
    expect(initial.body).toMatchObject({
      chromeConnected: false,
      managedAvailable: expect.any(Boolean)
    })
    expect((await fetch(`${server.url}/v1/browser-use/extension/archive`)).status).toBe(404)

    const selected = await jsonRequest(server, "/v1/browser-use", {
      method: "PATCH",
      body: JSON.stringify({ preferredBrowser: "managed" })
    })
    expect(selected.body).toMatchObject({ preferredBrowser: "managed" })
    expect((await jsonRequest(server, "/v1/browser-use")).body).toMatchObject({
      preferredBrowser: "managed"
    })
    expect(
      (
        await jsonRequest(server, "/v1/browser-use", {
          method: "PATCH",
          body: JSON.stringify({ preferredBrowser: "firefox" })
        })
      ).status
    ).toBe(400)
  })
})
