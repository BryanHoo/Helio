import { harnessCatalog, type HarnessDefinition } from "@codevisor/agent-runtime"
import { afterEach, describe, expect, it } from "vitest"

import { installCommand, upgradeCommand } from "./harness-lifecycle-support.js"
import {
  agentsStub,
  cleanupLifecycleTests,
  fakeSpawner,
  fakeTerminal,
  harness,
  jsonResponse,
  makeBinDir,
  makeDb,
  waitForLifecycleSettle
} from "./harness-lifecycle-test-support.js"
import { makeHarnessLifecycleManager } from "./harness-lifecycle.js"

afterEach(cleanupLifecycleTests)

const definition = (id: string): HarnessDefinition => {
  const entry = harnessCatalog.find((candidate) => candidate.id === id)
  if (entry === undefined) throw new Error(`Missing catalog entry: ${id}`)
  return entry
}

const fixture = (id: string, overrides: Partial<HarnessDefinition>): HarnessDefinition => ({
  ...definition("codex"),
  id,
  name: id,
  detectBinaries: [id],
  ...overrides
})

describe("catalog installation routes", () => {
  it("does not install or update app-managed CLIs globally", async () => {
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([definition("codex"), definition("claude-code")], []),
      db: await makeDb(),
      resolveEnv: async () => ({ PATH: makeBinDir(["curl"]) })
    })
    for (const id of ["codex", "claude-code"]) {
      expect(await lifecycle.installMethods(id)).toEqual([])
      await expect(lifecycle.beginInstall(id, "curl")).rejects.toThrow("No runnable install method")
      await expect(lifecycle.beginUpdate(id)).rejects.toThrow("not installed")
    }
  })

  it.each([false, true])("checks uv availability on PATH (installed: %s)", async (available) => {
    const env = { PATH: makeBinDir(available ? ["uv"] : []) }
    const uv = fixture("fixture-uv", {
      installMethods: [{ kind: "uv", packageName: "fixture-uv", python: "3.12" }]
    })
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([uv], []),
      db: await makeDb(),
      resolveEnv: async () => env
    })
    expect((await lifecycle.installMethods(uv.id)).find((m) => m.id === "uv")).toMatchObject({
      available,
      recommended: available,
      label: "uv",
      command: "uv tool install fixture-uv --python 3.12"
    })
  })

  it("keeps macOS casks unavailable on a Linux host with Homebrew", async () => {
    const brew = fixture("fixture-brew", {
      installMethods: [{ kind: "brew", formula: "fixture-brew" }]
    })
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([definition("codex"), brew], []),
      db: await makeDb(),
      platform: "linux",
      resolveEnv: async () => ({ PATH: makeBinDir(["brew", "curl"]) })
    })
    const codex = await lifecycle.installMethods("codex")
    expect(codex).toEqual([])
    expect((await lifecycle.installMethods(brew.id)).find((m) => m.id === "brew")).toMatchObject({
      available: true,
      recommended: true
    })
    await expect(lifecycle.beginInstall("codex", "brew")).rejects.toThrow(
      "No runnable install method"
    )
  })

  it("keeps owner-specific updates available for explicitly defined external harnesses", async () => {
    const id = "fixture-external"
    const path = "/opt/homebrew/Cellar/fixture-external/1.0.0/bin/fixture-external"
    const external = fixture(id, {
      update: {
        sources: [
          {
            apply: { args: ["update"], kind: "selfUpdate" },
            check: { kind: "npm", packageName: id },
            when: "any"
          }
        ]
      }
    })
    const { spawnShell, spawns, processes } = fakeSpawner()
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([external], [harness(id, path, "1.0.0")]),
      db: await makeDb(),
      home: "/Users/dev",
      realpath: (p) => p,
      resolveEnv: async () => ({ PATH: makeBinDir(["brew", "uv"]) }),
      fetchImpl: async () => jsonResponse({}, 404),
      spawnShell,
      terminal: fakeTerminal().terminal
    })
    await lifecycle.beginUpdate(id)
    expect(spawns[0]?.command).toBe(`${path} update`)
    const settled = waitForLifecycleSettle(lifecycle)
    processes[0]?.emitExit(0)
    await settled
  })

  it("installs declared npm dependencies and respects ignore-scripts", () => {
    const bundled = {
      kind: "npm" as const,
      packageName: "fixture-cli",
      additionalPackages: ["fixture-addon"]
    }
    expect(installCommand(bundled)).toBe("npm install -g fixture-cli fixture-addon")
    expect(upgradeCommand(bundled)).toBe("npm install -g fixture-cli@latest fixture-addon@latest")
    const isolated = { kind: "npm" as const, packageName: "fixture-cli", ignoreScripts: true }
    expect(installCommand(isolated)).toBe("npm install -g --ignore-scripts fixture-cli")
    expect(upgradeCommand(isolated)).toBe("npm install -g --ignore-scripts fixture-cli@latest")
  })
})
