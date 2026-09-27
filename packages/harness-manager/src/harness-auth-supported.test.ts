import { describe, expect, it } from "vitest"

import { makeHarnessAuthManager } from "./harness-auth.js"

describe("supported harness authentication", () => {
  it("does not expose provider-specific flows for harnesses outside the catalog", () => {
    const manager = makeHarnessAuthManager({
      dataDir: "/tmp/codevisor-auth-test",
      db: {} as Parameters<typeof makeHarnessAuthManager>[0]["db"],
      agents: {} as Parameters<typeof makeHarnessAuthManager>[0]["agents"],
      terminal: {} as Parameters<typeof makeHarnessAuthManager>[0]["terminal"]
    })

    expect(manager).not.toHaveProperty("piProviders")
    expect(manager).not.toHaveProperty("openCodeProviders")
    expect(manager).not.toHaveProperty("sharedOpenCodeProfiles")
  })
})
