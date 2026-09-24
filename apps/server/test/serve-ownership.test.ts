import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import { resolveServeModes } from "../src/serve-boot.js"
import { monitorAppOwner } from "../src/serve.js"

describe("app-owned server lifecycle", () => {
  it("rejects network binds and remote authentication for app-owned servers", () => {
    expect(() => resolveServeModes({ "app-owned": "1" }, "0.0.0.0")).toThrow(/loopback/)
    expect(() => resolveServeModes({ "service-managed": "1", auth: "token" }, "127.0.0.1")).toThrow(
      /auth/
    )
    expect(resolveServeModes({ "app-owned": "1" }, "127.0.0.1")).toMatchObject({
      authMode: "none",
      directPathMode: "disabled",
      resolvedKind: "local"
    })
  })
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it("releases the database lease before stopping when its app exits", async () => {
    const order: string[] = []
    const release = vi.fn(async () => {
      order.push("release")
    })

    const stopped = new Promise<void>((resolve) => {
      monitorAppOwner({
        ownerPid: 42,
        lease: { release },
        intervalMilliseconds: 1000,
        isAlive: () => false,
        stopProcess: () => {
          order.push("exit")
          resolve()
        }
      })
    })

    await vi.advanceTimersByTimeAsync(1000)
    await stopped
    expect(release).toHaveBeenCalledOnce()
    expect(order).toEqual(["release", "exit"])
  })

  it("does not stop while the owning app is alive", async () => {
    const release = vi.fn(async () => undefined)
    const stopProcess = vi.fn()
    const cancel = monitorAppOwner({
      ownerPid: 42,
      lease: { release },
      intervalMilliseconds: 1000,
      isAlive: () => true,
      stopProcess
    })

    await vi.advanceTimersByTimeAsync(10000)
    cancel()

    expect(release).not.toHaveBeenCalled()
    expect(stopProcess).not.toHaveBeenCalled()
  })
})
