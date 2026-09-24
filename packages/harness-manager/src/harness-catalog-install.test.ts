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
  it("offers Codex's script without requiring npm or Homebrew", async () => {
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([definition("codex")], []),
      db: await makeDb(),
      resolveEnv: async () => ({ PATH: makeBinDir(["curl"]) })
    })
    expect(await lifecycle.installMethods("codex")).toContainEqual({
      id: "curl",
      kind: "curl",
      label: "Installer script",
      command: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      available: true,
      recommended: true
    })
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
    expect(codex.find((m) => m.id === "brew")).toMatchObject({
      available: false,
      recommended: false
    })
    expect(codex.find((m) => m.id === "curl")).toMatchObject({ available: true, recommended: true })
    expect((await lifecycle.installMethods(brew.id)).find((m) => m.id === "brew")).toMatchObject({
      available: true,
      recommended: true
    })
    await expect(lifecycle.beginInstall("codex", "brew")).rejects.toThrow(
      "No runnable install method"
    )
  })

  it.each([
    [
      "claude-code",
      "/opt/homebrew/Caskroom/claude-code@latest/1.0.0/claude",
      "brew upgrade --cask claude-code@latest"
    ],
    [
      "codex",
      "/opt/homebrew/Cellar/codex/1.0.0/bin/codex",
      "/opt/homebrew/Cellar/codex/1.0.0/bin/codex update"
    ]
  ])("updates %s through its installed owner", async (id, path, command) => {
    const { spawnShell, spawns, processes } = fakeSpawner()
    const lifecycle = makeHarnessLifecycleManager({
      agents: agentsStub([definition(id)], [harness(id, path!, "1.0.0")]),
      db: await makeDb(),
      home: "/Users/dev",
      realpath: (p) => p,
      resolveEnv: async () => ({ PATH: makeBinDir(["brew", "uv"]) }),
      fetchImpl: async () => jsonResponse({}, 404),
      spawnShell,
      terminal: fakeTerminal().terminal
    })
    await lifecycle.beginUpdate(id!)
    expect(spawns[0]?.command).toBe(command)
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
