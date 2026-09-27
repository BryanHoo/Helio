import type { HarnessDefinition } from "./types.js"

// CLI 由应用固定依赖提供；配置、凭据和会话仍由 CLI 在用户 home 下管理。
export const harnessCatalog: ReadonlyArray<HarnessDefinition> = [
  {
    detectBinaries: ["claude"],
    id: "claude-code",
    name: "Claude Code",
    nativeMcp: {
      format: "json",
      key: "mcpServers",
      path: "~/.claude.json",
      projectFile: ".mcp.json",
      writable: true
    },
    provider: "claude",
    skills: { globalDir: "~/.claude/skills" },
    symbolName: "sparkle"
  },
  {
    detectBinaries: ["codex"],
    id: "codex",
    name: "Codex",
    nativeMcp: {
      format: "toml",
      key: "mcp_servers",
      path: "~/.codex/config.toml",
      writable: true
    },
    provider: "codex",
    skills: { globalDir: "~/.codex/skills" },
    symbolName: "chevron.left.forwardslash.chevron.right"
  }
]
