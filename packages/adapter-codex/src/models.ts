import { findKnownModel, highestThinkingLevel, sanitizeModelValue } from "@codevisor/agent-runtime"
import type { CanonicalModeId, SessionConfigOption, SessionModeState } from "@codevisor/api"

import type { CodexModel, CodexSession } from "./session.js"

/// The wire value Codex uses for its fast service tier (the UI calls it
/// "priority"); "default" is the explicit standard-routing sentinel.
export const CODEX_FAST_TIER = "priority"
export const CODEX_STANDARD_TIER = "default"

/// Approval/sandbox presets, mirroring the modes the codex-acp adapter (and
/// the Codex IDE extensions) expose. Applied as sticky turn/start overrides.
export interface CodexMode {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly canonicalId: CanonicalModeId
  /// When set, turn/start also sends the EXPERIMENTAL collaborationMode
  /// preset (unlocked by `capabilities.experimentalApi` at initialize).
  readonly collaboration?: "plan"
}

export const CODEX_MODES: ReadonlyArray<CodexMode> = [
  {
    canonicalId: "plan",
    collaboration: "plan",
    description: "Plans before making changes.",
    id: "plan",
    name: "Plan"
  },
  {
    canonicalId: "ask",
    description: "Works with the selected sandbox and approval settings.",
    id: "agent",
    name: "Agent"
  }
]

export const DEFAULT_CODEX_MODE = "agent"

export const sandboxValueFor = (policy: Record<string, unknown>): string => {
  switch (policy.type) {
    case "readOnly":
      return "read-only"
    case "workspaceWrite":
      return "workspace-write"
    case "dangerFullAccess":
      return "danger-full-access"
    case "externalSandbox":
      return "external-sandbox"
    default:
      if (typeof policy.type === "string") return policy.type
      throw new Error("Codex sandbox policy has no type")
  }
}

export const sandboxPolicyFor = (sandbox: string): Record<string, unknown> => {
  switch (sandbox) {
    case "read-only":
      return { networkAccess: false, type: "readOnly" }
    case "danger-full-access":
      return { type: "dangerFullAccess" }
    default:
      return {
        excludeSlashTmp: false,
        excludeTmpdirEnvVar: false,
        networkAccess: false,
        type: "workspaceWrite",
        writableRoots: []
      }
  }
}

export const configOptionsFor = (session: CodexSession): ReadonlyArray<SessionConfigOption> => {
  const options: Array<SessionConfigOption> = []
  const current = currentCodexModelFor(session)
  if (current !== undefined) {
    options.push({
      category: "model",
      currentValue: current.value,
      id: "model",
      name: "Model",
      options: session.models.map((model) => ({ name: model.name, value: model.value }))
    })
  }
  const efforts = current?.efforts ?? []
  if (efforts.length > 0) {
    options.push({
      category: "thought_level",
      currentValue:
        session.currentEffort !== undefined && efforts.includes(session.currentEffort)
          ? session.currentEffort
          : (current?.defaultEffort ?? efforts[0] ?? "medium"),
      id: "effort",
      name: "Reasoning",
      options: efforts.map((effort) => ({
        name: effort === "xhigh" ? "X-High" : effort[0]?.toUpperCase() + effort.slice(1),
        value: effort
      }))
    })
  }
  if (current?.supportsFast === true) {
    options.push({
      category: "speed",
      currentValue: effectiveSpeed(session) ?? "standard",
      id: "speed",
      name: "Speed",
      options: [
        { name: "Standard", value: "standard" },
        { description: "Prioritized, faster responses", name: "Fast", value: "fast" }
      ]
    })
  }
  options.push(
    {
      category: "permission",
      currentValue: session.currentSandbox,
      id: "sandbox",
      name: "Sandbox",
      options: [
        { name: "Read-only", value: "read-only" },
        { name: "Workspace write", value: "workspace-write" },
        { name: "Full access", value: "danger-full-access" },
        ...(["read-only", "workspace-write", "danger-full-access"].includes(session.currentSandbox)
          ? []
          : [{ name: session.currentSandbox, value: session.currentSandbox }])
      ]
    },
    {
      category: "permission",
      currentValue: session.currentApproval,
      id: "approval",
      name: "Approvals",
      options: [
        { name: "Untrusted commands", value: "untrusted" },
        { name: "On request", value: "on-request" },
        { name: "Never", value: "never" },
        ...(["untrusted", "on-request", "never"].includes(session.currentApproval)
          ? []
          : [{ name: session.currentApproval, value: session.currentApproval }])
      ]
    }
  )
  return options
}

/// The speed the next turn runs at: the user's pick, else the current
/// model's catalog default. Undefined when the model has no fast tier.
export const effectiveSpeed = (session: CodexSession): "standard" | "fast" | undefined => {
  const current = currentCodexModelFor(session)
  if (current?.supportsFast !== true) return undefined
  return session.currentSpeed ?? (current.defaultsToFast ? "fast" : "standard")
}

export const currentCodexModelFor = (session: CodexSession): CodexModel | undefined => {
  if (session.models.length === 0) {
    session.currentModel = sanitizeModelValue(session.currentModel)
    return undefined
  }
  const matched = findKnownModel(session.models, session.currentModel)
  if (matched !== undefined) {
    session.currentModel = matched.value
    return matched
  }
  const fallback = session.models[0]
  if (fallback === undefined) return undefined
  session.currentModel = fallback.value
  session.currentEffort = highestThinkingLevel(fallback.efforts) ?? fallback.defaultEffort
  session.currentSpeed = undefined
  return fallback
}

export const modesFor = (session: CodexSession): SessionModeState => ({
  availableModes: CODEX_MODES.map((mode) => ({
    canonicalId: mode.canonicalId,
    description: mode.description,
    id: mode.id,
    name: mode.name
  })),
  currentModeId: session.currentModeId
})
