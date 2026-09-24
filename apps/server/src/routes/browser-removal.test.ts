import { describe, expect, it } from "vitest"

import { jsonRequest, start } from "../test-support.js"

describe("removed browser surfaces", () => {
  it("does not advertise or route browser services", async () => {
    const { server } = await start()
    const info = await jsonRequest(server, "/v1/info")
    const features = (info.body as { features: string[] }).features
    expect(features).not.toContain("browser-proxy-v1")
    expect(features).not.toContain("browser-http-proxy-v1")
    expect(features).not.toContain("browser-state-v1")
    expect((await jsonRequest(server, "/v1/browser-use")).status).toBe(404)
    expect((await jsonRequest(server, "/v1/browser/state/panes/fixture")).status).toBe(404)
    expect(
      (await jsonRequest(server, "/v1/browser/proxy-session", { method: "POST" })).status
    ).toBe(404)
  })
})
