import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { harnessCatalog, type AgentRuntimeService } from "@codevisor/agent-runtime"
import { makeDatabase } from "@codevisor/db"
import type { TerminalManagerService } from "@codevisor/terminal"
import { Effect } from "effect"
import { expect, it, vi } from "vitest"

import { makeHarnessAuthManager } from "./harness-auth.js"

it("creates managed profiles with isolated XDG directories", async () => {
  const directory = mkdtempSync(join(tmpdir(), "codevisor-opencode-profile-"))
  const db = await Effect.runPromise(
    makeDatabase({ filename: join(directory, "codevisor.sqlite"), serverId: "test" })
  )
  try {
    const probeHarnessAuth = vi.fn(() =>
      Effect.succeed({ state: "authenticated" as const, methods: [], canLogout: false })
    )
    const manager = makeHarnessAuthManager({
      agents: { probeHarnessAuth } as unknown as AgentRuntimeService,
      // 仅测试历史账户配置，不把它重新加入产品目录。
      catalog: [...harnessCatalog, { ...harnessCatalog[0]!, id: "opencode" }],
      dataDir: directory,
      db,
      terminal: {} as TerminalManagerService,
      resolveEnv: () =>
        Promise.resolve({ HOME: directory, OPENCODE_AUTH_CONTENT: '{"openai":{"type":"api"}}' })
    })

    const account = await manager.createAccount("opencode", "Work")
    const context = await manager.accountContext(account.id)
    const profile = join(directory, "harness-profiles", "opencode", account.id)
    expect(context).toMatchObject({
      id: account.id,
      profileKind: "managed",
      profilePath: profile,
      env: {
        XDG_DATA_HOME: join(profile, "data"),
        XDG_CONFIG_HOME: join(profile, "config"),
        XDG_STATE_HOME: join(profile, "state"),
        XDG_CACHE_HOME: join(profile, "cache")
      }
    })
    expect(probeHarnessAuth).toHaveBeenCalledWith(
      "opencode",
      expect.objectContaining({ id: account.id, profilePath: profile })
    )
  } finally {
    await Effect.runPromise(db.close)
    rmSync(directory, { force: true, recursive: true })
  }
})
