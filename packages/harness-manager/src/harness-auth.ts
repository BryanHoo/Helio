import { makeHarnessAccountOperations } from "./harness-auth-accounts.js"
import { makeHarnessAuthCore } from "./harness-auth-core.js"
import { makeHarnessAuthDecoration } from "./harness-auth-decoration.js"
import { makeHarnessLoginOperations } from "./harness-auth-logins.js"
import { makeHarnessAuthProbes } from "./harness-auth-probes.js"
import { run } from "./harness-auth-support.js"
import type { HarnessAuthManager, HarnessAuthManagerConfig } from "./harness-auth-types.js"

export type {
  HarnessAuthEvent,
  HarnessAuthManager,
  HarnessAuthManagerConfig
} from "./harness-auth-types.js"

export const makeHarnessAuthManager = (config: HarnessAuthManagerConfig): HarnessAuthManager => {
  const core = makeHarnessAuthCore(config)
  const { contextFor, listeners, persistProbe } = core
  const probes = makeHarnessAuthProbes(core)
  const { probeAccount } = probes
  const decoration = makeHarnessAuthDecoration(core, probes)
  const accounts = makeHarnessAccountOperations(core, probes, decoration)
  const logins = makeHarnessLoginOperations(core, probes)

  return {
    decorateHarnesses: async (harnesses, force) => {
      await config.sharedAccounts?.()?.reconcile()
      return decoration.decorateHarnesses(harnesses, force)
    },
    decorateHarnessesFromStoredState: decoration.decorateHarnessesFromStoredState,
    refresh: decoration.refresh,
    ...accounts,
    ...logins,
    activateAccount: async (harnessId, accountId) => {
      if (await config.sharedAccounts?.()?.activate(harnessId, accountId)) return
      return accounts.activateAccount(harnessId, accountId)
    },
    removeAccount: async (accountId) => {
      if (await config.sharedAccounts?.()?.logout(accountId)) return
      return accounts.removeAccount(accountId)
    },
    accounts: async (harnessId, _shared = false) => {
      return (
        (await config.sharedAccounts?.()?.accounts(harnessId)) ??
        (await run(config.db.listHarnessAccounts(harnessId))).map(core.publicAccount)
      )
    },
    probeAccount,
    accountContext: async (accountId) => {
      const shared = await config.sharedAccounts?.()?.context(accountId)
      if (shared !== undefined) {
        if (shared.env?.CLAUDE_CONFIG_DIR) await core.prepareClaudeStorage()
        return shared
      }
      const state = await probeAccount(accountId)
      if (state.authState !== "authenticated" && state.authState !== "notRequired") {
        throw new Error("Harness account requires sign-in")
      }
      const account = await run(config.db.getHarnessAccount(accountId))
      if (account === undefined) throw new Error(`Harness account not found: ${accountId}`)
      return contextFor(account)
    },
    activeAccountContext: async (harnessId) => {
      const accounts = await run(config.db.listHarnessAccounts(harnessId))
      const account = accounts.find((candidate) => candidate.isActive) ?? accounts[0]
      if (account === undefined) return undefined
      const shared = await config.sharedAccounts?.()?.context(account.id)
      if (shared !== undefined) {
        if (shared.env?.CLAUDE_CONFIG_DIR) await core.prepareClaudeStorage()
        return shared
      }
      const state = await probeAccount(account.id)
      return state.authState === "authenticated" || state.authState === "notRequired"
        ? contextFor(account)
        : undefined
    },
    markAccountExpired: async (accountId, detail) => {
      const account = await run(config.db.getHarnessAccount(accountId))
      if (account === undefined) return
      await persistProbe(account, {
        authState: "expired",
        canLogin: true,
        canLogout: account.canLogout,
        detail: detail ?? "Sign-in expired. Sign in again to continue."
      })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
