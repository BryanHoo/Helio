import type { spawnClaudeAuthClient } from "@codevisor/adapter-claude"
import type {
  AgentRuntimeService,
  HarnessAccountContext,
  HarnessDefinition
} from "@codevisor/agent-runtime"
import type { Harness, HarnessAccount, HarnessAuthFlow } from "@codevisor/api"
import type { CodevisorDatabaseService } from "@codevisor/db"
import type { TerminalManagerService } from "@codevisor/terminal"

import type { SharedAccountIntegration } from "./shared-account-integration.js"

export interface HarnessAuthExecOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly timeout?: number
  readonly maxBuffer?: number
}

export type HarnessAuthExec = (
  command: string,
  args: ReadonlyArray<string>,
  options: HarnessAuthExecOptions
) => Promise<{ readonly stdout: string; readonly stderr: string }>

export type AuthEventKind =
  | "harness.auth.updated"
  | "harness.account.updated"
  | "harness.authFlow.updated"

export interface HarnessAuthEvent {
  readonly kind: AuthEventKind
  readonly subjectId: string
  readonly payload: unknown
}

export interface HarnessAuthManagerConfig {
  readonly sharedAccounts?: () => SharedAccountIntegration | undefined
  readonly dataDir: string
  readonly db: CodevisorDatabaseService
  readonly agents: AgentRuntimeService
  readonly terminal: TerminalManagerService
  readonly preferDeviceCode?: boolean
  /// Test seam: replaces the SDK-backed Claude OAuth client factory.
  readonly claudeAuth?: typeof spawnClaudeAuthClient
  /// Overrides the login-shell environment resolver in tests and embedded hosts.
  readonly resolveEnv?: () => Promise<NodeJS.ProcessEnv>
  /// Overrides non-interactive authentication commands in tests.
  readonly execFile?: HarnessAuthExec
  /// The effective harness catalog (builtins + user-defined entries).
  /// Defaults to `agents.catalog`, falling back to the builtin catalog for
  /// hosts/tests that stub the runtime.
  readonly catalog?: ReadonlyArray<HarnessDefinition>
}

export interface HarnessAuthManager {
  readonly decorateHarnesses: (
    harnesses: ReadonlyArray<Harness>,
    force?: boolean
  ) => Promise<ReadonlyArray<Harness>>
  /// Decorates harnesses from durable auth state without launching auth probes.
  readonly decorateHarnessesFromStoredState: (
    harnesses: ReadonlyArray<Harness>
  ) => Promise<ReadonlyArray<Harness>>
  readonly refresh: (harnessId?: string) => Promise<void>
  readonly accounts: (harnessId: string, shared?: boolean) => Promise<ReadonlyArray<HarnessAccount>>
  readonly createAccount: (harnessId: string, label?: string) => Promise<HarnessAccount>
  readonly renameAccount: (accountId: string, label: string) => Promise<HarnessAccount>
  readonly removeAccount: (accountId: string) => Promise<void>
  readonly activateAccount: (harnessId: string, accountId: string) => Promise<void>
  readonly probeAccount: (
    accountId: string,
    force?: boolean,
    shared?: boolean
  ) => Promise<HarnessAccount>
  readonly beginLogin: (
    accountId: string,
    methodId?: string,
    apiKey?: string,
    shared?: boolean
  ) => Promise<HarnessAuthFlow>
  readonly cancelLogin: (flowId: string) => Promise<void>
  /// Completes a pasteCode flow with the user's pasted code.
  readonly answerLogin: (flowId: string, code: string) => Promise<HarnessAuthFlow>
  readonly logout: (accountId: string, shared?: boolean) => Promise<HarnessAccount>
  readonly accountContext: (accountId: string) => Promise<HarnessAccountContext>
  readonly activeAccountContext: (harnessId: string) => Promise<HarnessAccountContext | undefined>
  readonly markAccountExpired: (accountId: string, detail?: string) => Promise<void>
  readonly subscribe: (listener: (event: HarnessAuthEvent) => void) => () => void
}
