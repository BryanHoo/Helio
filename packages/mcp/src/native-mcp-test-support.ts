import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { makeAgentRuntime } from "@codevisor/agent-runtime"
import type { HarnessDefinition } from "@codevisor/agent-runtime"
import type { CreateMcpServerRequest, McpAuthDetection } from "@codevisor/api"
import { makeDatabase } from "@codevisor/db"
import type { CodevisorDatabaseService } from "@codevisor/db"
import { Effect } from "effect"

import type { NativeConfigFileSystem } from "./native-config-files.js"
import { makeNativeMcpManager } from "./native-mcp-manager.js"
import type { ImportTargetMcpManager, NativeMcpManager } from "./native-mcp-types.js"

export const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect)

export const directories: string[] = []
export const databases: CodevisorDatabaseService[] = []

export const cleanupNativeMcpTests = async (): Promise<void> => {
  await Promise.all(databases.splice(0).map((database) => run(database.close)))
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
}

export const HOME = "/home/u"

// 旧配置格式只作为扫描和编辑夹具，不重新加入产品目录。
const legacyNativeMcpHarnesses: ReadonlyArray<HarnessDefinition> = [
  {
    id: "opencode",
    name: "OpenCode",
    symbolName: "terminal",
    detectBinaries: [],
    provider: "codex",
    nativeMcp: {
      path: "~/.config/opencode/opencode.json",
      key: "mcp",
      format: "json",
      disableField: { name: "enabled", enabledWhen: true },
      writable: true
    }
  },
  {
    id: "gemini",
    name: "Gemini",
    symbolName: "terminal",
    detectBinaries: [],
    provider: "codex",
    nativeMcp: {
      path: "~/.gemini/settings.json",
      key: "mcpServers",
      format: "json",
      writable: true
    }
  },
  {
    id: "cline",
    name: "Cline",
    symbolName: "terminal",
    detectBinaries: [],
    provider: "codex",
    nativeMcp: {
      path: "~/.cline/data/settings/cline_mcp_settings.json",
      key: "mcpServers",
      format: "json",
      disableField: { name: "disabled", enabledWhen: false },
      writable: true
    }
  },
  {
    id: "goose",
    name: "Goose",
    symbolName: "terminal",
    detectBinaries: [],
    provider: "codex",
    nativeMcp: {
      path: "~/.config/goose/config.yaml",
      key: "extensions",
      format: "yaml",
      writable: false
    }
  }
]

export const nativeMcpTestRuntime = () => {
  const agents = makeAgentRuntime({})
  agents.setExtraHarnesses(legacyNativeMcpHarnesses)
  return agents
}

/// In-memory filesystem: reads serve from the record, atomic writes mutate
/// it — so write-pipeline tests can assert on resulting file contents.
export const fakeFs = (files: Record<string, string | Error>): NativeConfigFileSystem => ({
  readFile: async (path) => {
    const value = files[path]
    if (value instanceof Error) throw value
    return value
  },
  writeFileAtomic: async (path, content) => {
    files[path] = content
  }
})

export interface ImportFakes {
  readonly createRequests: Array<CreateMcpServerRequest>
  readonly detectedUrls: Array<string>
}

/// Fake managed-MCP store: `create` persists through the real db (so
/// post-import scans see `alreadyManaged`), `detectAuth` is scripted.
export const fakeMcp = (
  db: CodevisorDatabaseService,
  behavior: {
    readonly detectAuth?: (url: string) => Promise<McpAuthDetection>
    readonly create?: (request: CreateMcpServerRequest) => Promise<never>
  } = {}
): { readonly fakes: ImportFakes; readonly mcp: ImportTargetMcpManager } => {
  const createRequests: Array<CreateMcpServerRequest> = []
  const detectedUrls: Array<string> = []
  return {
    fakes: { createRequests, detectedUrls },
    mcp: {
      create: async (request) => {
        if (behavior.create !== undefined) return behavior.create(request)
        createRequests.push(request)
        return run(
          db.saveMcpServer({
            args: request.args === undefined ? [] : [...request.args],
            authType: request.authType ?? "none",
            ...(request.command === undefined ? {} : { command: request.command }),
            connectionState: "disconnected",
            enabled: true,
            name: request.name,
            toolCount: 0,
            transport: request.transport,
            ...(request.url === undefined ? {} : { url: request.url })
          })
        )
      },
      detectAuth: async (url) => {
        detectedUrls.push(url)
        if (behavior.detectAuth !== undefined) return behavior.detectAuth(url)
        return { authType: "none", detail: "No authorization challenge detected" }
      }
    }
  }
}

export const testManager = async (
  files: Record<string, string | Error>,
  env: Record<string, string | undefined> = {},
  behavior: Parameters<typeof fakeMcp>[1] = {},
  agents = nativeMcpTestRuntime()
): Promise<{
  db: CodevisorDatabaseService
  fakes: ImportFakes
  manager: NativeMcpManager
}> => {
  const directory = mkdtempSync(join(tmpdir(), "codevisor-native-mcp-"))
  directories.push(directory)
  const db = await run(
    makeDatabase({ filename: join(directory, "codevisor.sqlite"), serverId: "test" })
  )
  databases.push(db)
  const { fakes, mcp } = fakeMcp(db, behavior)
  const manager = makeNativeMcpManager({
    agents,
    dataDir: directory,
    db,
    env,
    fs: fakeFs(files),
    homedir: HOME,
    mcp
  })
  return { db, fakes, manager }
}

export const harnessGroup = (scan: Awaited<ReturnType<NativeMcpManager["scan"]>>, id: string) => {
  const group = scan.harnesses.find((harness) => harness.harnessId === id)
  if (group === undefined) throw new Error(`missing harness group ${id}`)
  return group
}
