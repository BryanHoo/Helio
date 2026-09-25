import { describe, expect, it } from "vitest"

import { defaultServerConfig, startCodevisorServer } from "../server.js"
import { jsonRequest, makeServices, run, runningServers } from "../test-support.js"

describe("local-only server", () => {
  it("does not expose cloud registration, while local sync remains available", async () => {
    const { services } = await makeServices("server-local-only")
    const server = await run(
      startCodevisorServer(services, defaultServerConfig({ id: "server-local-only", port: 0 }))
    )
    runningServers.push(server)

    for (const path of ["/v1/cloud", "/v1/cloud/connect", "/v1/cloud/disconnect"]) {
      expect((await jsonRequest(server, path, { method: "POST" })).status).toBe(404)
      expect((await jsonRequest(server, path)).status).toBe(404)
    }
    expect((await jsonRequest(server, "/v1/info")).body).not.toHaveProperty("cloudDeviceId")
    expect((await jsonRequest(server, "/v1/sync/settings")).status).not.toBe(404)
  })

  it("does not advertise a legacy cloud identity", async () => {
    const { services } = await makeServices("server-legacy-cloud")
    const server = await run(
      startCodevisorServer(
        services,
        defaultServerConfig({ id: "server-legacy-cloud", port: 0, cloudDeviceId: "old-device" })
      )
    )
    runningServers.push(server)
    expect((await jsonRequest(server, "/v1/info")).body).not.toHaveProperty("cloudDeviceId")
  })
})
