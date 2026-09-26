import type { PluginManifest } from "@codevisor/api"

import type { PluginInstallSourceReceipt } from "./plugin-receipt.js"

export interface StagedPlugin {
  readonly manifest: PluginManifest
  readonly manifestRaw: string
  readonly root: string
  readonly env: NodeJS.ProcessEnv
  readonly resolvedCommit: string
  readonly source: PluginInstallSourceReceipt
  readonly cleanup: () => Promise<void>
}

export interface PreparedCandidateContext {
  readonly hadExisting: boolean
}
