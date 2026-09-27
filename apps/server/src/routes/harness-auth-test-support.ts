import type { HarnessAuthManager } from "@codevisor/harness-manager"
import { vi } from "vitest"

/// A scripted HarnessAuthManager for the harness route tests: one default
/// account and a mutable
/// `state` the tests flip to simulate sign-out and missing account context.
export const makeAuthFixture = () => {
  const account = {
    id: "account-1",
    harnessId: "codex",
    profileKind: "default" as const,
    label: "person@example.com",
    email: "person@example.com",
    authState: "authenticated" as const,
    isActive: true,
    canLogin: true,
    canLogout: true
  }
  const accountList = [account]
  const state: {
    authState: "authenticated" | "unauthenticated"
    activeContextAvailable: boolean
  } = { authState: "authenticated", activeContextAvailable: true }
  const auth: HarnessAuthManager = {
    answerLogin: () => Promise.reject(new Error("unused")),
    decorateHarnesses: async (values) =>
      values.map((harness) => {
        const desiredEnabled = harness.enabled
        return {
          ...harness,
          desiredEnabled,
          enabled: desiredEnabled && state.authState === "authenticated",
          auth: {
            state: state.authState,
            activeAccountId: account.id,
            accounts: accountList,
            loginMethods: [{ id: "browser", name: "Browser", kind: "browser" }],
            supportsMultipleAccounts: true
          }
        }
      }),
    decorateHarnessesFromStoredState: async (values) => auth.decorateHarnesses(values),
    refresh: vi.fn(async () => undefined),
    accounts: vi.fn(async () => accountList),
    createAccount: vi.fn(async () => account),
    renameAccount: vi.fn(async () => account),
    removeAccount: vi.fn(async () => undefined),
    activateAccount: vi.fn(async () => undefined),
    probeAccount: vi.fn(async () => account),
    beginLogin: vi.fn(async () => ({
      id: "flow-1",
      accountId: account.id,
      kind: "complete" as const
    })),
    cancelLogin: vi.fn(async () => undefined),
    logout: vi.fn(async () => ({ ...account, authState: "unauthenticated" as const })),
    accountContext: vi.fn(async () => ({ id: account.id, profileKind: "default" as const })),
    activeAccountContext: vi.fn(async () =>
      state.activeContextAvailable ? { id: account.id, profileKind: "default" as const } : undefined
    ),
    markAccountExpired: vi.fn(async () => undefined),
    subscribe: () => () => undefined
  }
  return { account, accountList, auth, state }
}
