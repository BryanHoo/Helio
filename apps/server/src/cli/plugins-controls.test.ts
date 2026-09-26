import { describe, expect, it } from "vitest"

import { pluginRestoreCommand, pluginSetEnabledCommand, type PluginsCliDeps } from "./plugins.js"

type Response = { readonly status: number; readonly body?: unknown } | undefined

const makeWorld = (http: Record<string, ReadonlyArray<Response>> = {}) => {
  const logs: string[] = []
  const errors: string[] = []
  const requests: Array<{ key: string; body?: unknown; timeoutMs?: number }> = []
  const counts = new Map<string, number>()
  const deps: PluginsCliDeps = {
    confirm: () => Promise.resolve(true),
    dataDir: "/tmp/data",
    env: { CODEVISOR_PORT: "49361" },
    error: (line) => errors.push(line),
    exec: () => Promise.resolve({ code: 1, stderr: "", stdout: "" }),
    execInteractive: () => Promise.resolve(0),
    fetchJson: (url, init) => {
      const key = `${init?.method ?? "GET"} ${url}`
      requests.push({
        key,
        ...(init?.body === undefined ? {} : { body: init.body }),
        ...(init?.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs })
      })
      const responses = http[key] ?? [undefined]
      const index = counts.get(key) ?? 0
      counts.set(key, index + 1)
      const response = responses[Math.min(index, responses.length - 1)]
      return Promise.resolve(
        response === undefined ? undefined : { body: response.body, status: response.status }
      )
    },
    installedVersion: () => undefined,
    isRoot: false,
    log: (line) => logs.push(line),
    logsDir: "/tmp/logs",
    processAlive: () => false,
    readTextFile: () => undefined,
    removeFile: () => undefined,
    signal: () => false,
    sleep: () => Promise.resolve(),
    spawnDetachedServer: () => Promise.resolve(1),
    writeTextFile: () => undefined
  }
  return { deps, errors, logs, requests }
}

const RESTORE = "POST http://127.0.0.1:49361/v1/plugins/acme.git-diff%2Fsafe/restore"
const SET_ENABLED = "POST http://127.0.0.1:49361/v1/plugins/acme.git-diff%2Fsafe/set-enabled"
const pluginId = "acme.git-diff/safe"

describe("codevisor plugin local recovery controls", () => {
  it("restores the known-good version", async () => {
    const world = makeWorld({
      [RESTORE]: [
        { body: { id: pluginId, version: "1.0.0" }, status: 200 },
        { body: { id: pluginId }, status: 200 }
      ]
    })
    expect(await pluginRestoreCommand(world.deps, { pluginId })).toBe(0)
    expect(await pluginRestoreCommand(world.deps, { pluginId })).toBe(0)
    expect(world.logs).toEqual([`Restored ${pluginId} 1.0.0`, `Restored ${pluginId}`])
    expect(world.requests[0]?.timeoutMs).toBe(600_000)
  })

  it("reports restore refusal and an unreachable server", async () => {
    const refused = makeWorld({ [RESTORE]: [{ body: {}, status: 409 }] })
    expect(await pluginRestoreCommand(refused.deps, { pluginId })).toBe(1)
    expect(refused.errors).toEqual(["Restore failed (status 409)"])
    expect(await pluginRestoreCommand(makeWorld().deps, { pluginId })).toBe(1)
  })

  it("enables and disables without uninstalling", async () => {
    const world = makeWorld({
      [SET_ENABLED]: [
        { body: { enabled: true }, status: 200 },
        { body: { enabled: false }, status: 200 }
      ]
    })
    expect(await pluginSetEnabledCommand(world.deps, { enabled: true, pluginId })).toBe(0)
    expect(await pluginSetEnabledCommand(world.deps, { enabled: false, pluginId })).toBe(0)
    expect(world.logs).toEqual([`Enabled ${pluginId}`, `Disabled ${pluginId}`])
    expect(world.requests.map((request) => request.body)).toEqual([
      { enabled: true },
      { enabled: false }
    ])
  })

  it("reports toggle refusal and an unreachable server", async () => {
    const refused = makeWorld({ [SET_ENABLED]: [{ body: {}, status: 500 }] })
    expect(await pluginSetEnabledCommand(refused.deps, { enabled: false, pluginId })).toBe(1)
    expect(refused.errors).toEqual(["Changing plugin state failed (status 500)"])
    expect(await pluginSetEnabledCommand(makeWorld().deps, { enabled: true, pluginId })).toBe(1)
  })
})
