import { dirname, join } from "node:path"

import { textToolResult, type AutomationToolProvider } from "@codevisor/automation"
import { computerUseTools } from "@codevisor/automation"
import { requireServerResource, type ServerResourceOptions } from "@codevisor/automation"
import type { ManagedSkillSpec } from "@codevisor/skills"

import { errorMessage } from "./mcp-support.js"

export const BUILTIN_MCP_SERVERS = [
  { id: "computer", name: "Computer Use", kind: "computerUse" as const },
  { id: "codevisor", name: "Codevisor", kind: "codevisor" as const }
] as const

export type BuiltinMcpId = (typeof BUILTIN_MCP_SERVERS)[number]["id"]

export const automationSkillPath = (options: ServerResourceOptions = {}): string => {
  const skillName = "computer-use"
  const relative = join("automation-skills", skillName, "SKILL.md")
  return requireServerResource(relative, `managed ${skillName} skill`, options)
}

export const managedAutomationSkills = (
  enabledIds: ReadonlySet<string>
): ReadonlyArray<ManagedSkillSpec> =>
  (["computer"] as const).map((id) => {
    const enabled = enabledIds.has(id)
    return {
      directoryName: "computer-use",
      enabled,
      // Disabled managed skills only need their installed copies removed.
      // Do not make an absent optional resource block that cleanup.
      sourcePath: enabled ? dirname(automationSkillPath()) : ""
    }
  })

export const unavailableComputerProvider = (
  cause: unknown
): AutomationToolProvider & {
  readonly ensureSetup: () => Promise<void>
  readonly status: () => Readonly<Record<string, unknown>>
} => {
  const detail = errorMessage(cause)
  return {
    id: "computer",
    tools: computerUseTools,
    ensureSetup: async () => {
      throw new Error(detail)
    },
    status: () => ({ platform: process.platform, available: false, detail }),
    invoke: async () => textToolResult(detail, true),
    closeSession: async () => undefined,
    close: async () => undefined
  }
}

export const initializeAutomationProvider = <A>(
  name: string,
  initialize: () => A,
  unavailable: (cause: unknown) => A
): A => {
  try {
    return initialize()
  } catch (cause) {
    console.error(`${name} unavailable: ${errorMessage(cause)}`)
    return unavailable(cause)
  }
}
