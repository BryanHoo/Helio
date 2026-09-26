import { describe, expect, it } from "vitest"

import { SetPluginEnabledRequest, decode } from "./index.js"

describe("plugin settings API", () => {
  it("validates persistent enabled-state changes", () => {
    expect(decode(SetPluginEnabledRequest)({ enabled: false })).toEqual({ enabled: false })
  })
})
