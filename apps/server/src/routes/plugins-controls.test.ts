import { describe, expect, it } from "vitest"

import {
  jsonRequest,
  makeServices,
  pluginsStub,
  readSseEventsOfKind,
  runningServers,
  startWithApp
} from "../test-support.js"

describe("local plugin controls", () => {
  it("restores and toggles installed plugins without the hosted registry", async () => {
    const { services } = await makeServices("server-a")
    const calls: Array<Array<unknown>> = []
    const server = await startWithApp({ ...services, plugins: pluginsStub(calls) })
    runningServers.push(server)

    const live = readSseEventsOfKind(server, "plugin.updated", 2)
    const restored = await jsonRequest(server, "/v1/plugins/owner.example/restore", {
      method: "POST"
    })
    expect(restored).toMatchObject({ status: 200, body: { version: "0.0.9" } })

    const disabled = await jsonRequest(server, "/v1/plugins/owner.example/set-enabled", {
      body: JSON.stringify({ enabled: false }),
      method: "POST"
    })
    expect(disabled).toMatchObject({ status: 200, body: { enabled: false } })
    expect(calls).toContainEqual(["restore", "owner.example"])
    expect(calls).toContainEqual(["setEnabled", "owner.example", false])
    expect(await live).toEqual([
      expect.objectContaining({ kind: "plugin.updated", subjectId: "owner.example" }),
      expect.objectContaining({ kind: "plugin.updated", subjectId: "owner.example" })
    ])
  })
})
