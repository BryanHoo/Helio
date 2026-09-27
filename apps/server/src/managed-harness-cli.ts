import { accessSync, constants } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"

import { locateExecutableOnPath } from "@codevisor/agent-runtime"

const require = createRequire(import.meta.url)
type ManagedName = "claude" | "codex"

const targetTriples: Readonly<Record<string, string>> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "linux-x64": "x86_64-unknown-linux-musl",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "win32-x64": "x86_64-pc-windows-msvc"
}

type PackageRoot = (name: ManagedName, packageName: string) => string
const installedPackageRoot: PackageRoot = (name, packageName) =>
  dirname(
    createRequire(
      require.resolve(
        `${name === "codex" ? "@openai/codex" : "@anthropic-ai/claude-code"}/package.json`
      )
    ).resolve(`${packageName}/package.json`)
  )

export const managedHarnessBinary = (
  name: ManagedName,
  platform: NodeJS.Platform,
  arch: string,
  packageRoot: PackageRoot = installedPackageRoot
): string | undefined => {
  const triple = targetTriples[`${platform}-${arch}`]
  if (triple === undefined) return undefined
  const packageName =
    name === "codex"
      ? `@openai/codex-${platform}-${arch}`
      : `@anthropic-ai/claude-code-${platform}-${arch}`
  try {
    // 平台包必须属于当前 server 的固定依赖树，不经由用户 PATH 查找。
    const root = packageRoot(name, packageName)
    if (name === "claude") return resolve(root, platform === "win32" ? "claude.exe" : "claude")
    return resolve(root, "vendor", triple, "bin", platform === "win32" ? "codex.exe" : "codex")
  } catch {
    return undefined
  }
}

export const makeManagedHarnessLocator =
  (
    binaries: Partial<Record<ManagedName, string | undefined>>,
    fallback: (name: string, env: NodeJS.ProcessEnv) => string | undefined = locateExecutableOnPath
  ) =>
  (name: string, env: NodeJS.ProcessEnv): string | undefined => {
    if (name !== "codex" && name !== "claude") return fallback(name, env)
    const path = binaries[name]
    if (path === undefined) return undefined
    try {
      accessSync(path, constants.X_OK)
      return path
    } catch {
      return undefined
    }
  }

// 从应用安装的包解析可执行文件；缺失时不使用用户 PATH 中的其他版本。
export const locateManagedHarness = makeManagedHarnessLocator({
  claude: managedHarnessBinary("claude", process.platform, process.arch),
  codex: managedHarnessBinary("codex", process.platform, process.arch)
})

// 固定版本 CLI 不能自行升级；其他环境变量（尤其用户 home）原样传递。
export const managedHarnessEnvironment = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...env,
  DISABLE_UPDATES: "1"
})
