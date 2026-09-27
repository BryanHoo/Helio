import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  locateManagedHarness,
  makeManagedHarnessLocator,
  managedHarnessEnvironment,
  managedHarnessBinary
} from "./managed-harness-cli.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("managed harness CLI", () => {
  it("preserves the user's home while disabling Claude CLI self-updates", () => {
    expect(
      managedHarnessEnvironment({
        HOME: "/users/owner",
        CODEX_HOME: "/users/owner/codex",
        CLAUDE_CONFIG_DIR: "/users/owner/claude",
        DISABLE_UPDATES: "0"
      })
    ).toEqual({
      HOME: "/users/owner",
      CODEX_HOME: "/users/owner/codex",
      CLAUDE_CONFIG_DIR: "/users/owner/claude",
      DISABLE_UPDATES: "1"
    })
  })

  it("resolves each supported native target from its owning package", () => {
    const targets = [
      ["darwin", "arm64", "aarch64-apple-darwin"],
      ["darwin", "x64", "x86_64-apple-darwin"],
      ["linux", "arm64", "aarch64-unknown-linux-musl"],
      ["linux", "x64", "x86_64-unknown-linux-musl"],
      ["win32", "arm64", "aarch64-pc-windows-msvc"],
      ["win32", "x64", "x86_64-pc-windows-msvc"]
    ] as const
    for (const [platform, arch, triple] of targets) {
      const extension = platform === "win32" ? ".exe" : ""
      expect(
        managedHarnessBinary("codex", platform, arch, (_name, packageName) => {
          expect(packageName).toBe(`@openai/codex-${platform}-${arch}`)
          return "/packaged"
        })
      ).toBe(join("/packaged", "vendor", triple, "bin", `codex${extension}`))
      expect(
        managedHarnessBinary("claude", platform, arch, (_name, packageName) => {
          expect(packageName).toBe(`@anthropic-ai/claude-code-${platform}-${arch}`)
          return "/packaged"
        })
      ).toBe(join("/packaged", `claude${extension}`))
    }
    expect(managedHarnessBinary("codex", "freebsd", "x64")).toBeUndefined()
    expect(managedHarnessBinary("claude", "linux", "riscv64")).toBeUndefined()
    expect(
      managedHarnessBinary("codex", "darwin", "arm64", () => {
        throw new Error("missing optional dependency")
      })
    ).toBeUndefined()
  })

  it("resolves both pinned native packages without PATH", () => {
    for (const name of ["codex", "claude"] as const) {
      expect(locateManagedHarness(name, { PATH: "", HOME: "/users/owner" })).toContain(
        "node_modules"
      )
    }
  })

  it("selects packaged executables, never a user's PATH copy", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-harness-"))
    directories.push(root)
    const codex = join(root, "codex")
    const claude = join(root, "claude")
    for (const path of [codex, claude]) {
      writeFileSync(path, "binary")
      chmodSync(path, 0o755)
    }
    const locate = makeManagedHarnessLocator({ codex, claude }, () => join(root, "user-global"))
    expect(locate("codex", { PATH: "/usr/local/bin" })).toBe(codex)
    expect(locate("claude", { PATH: "/usr/local/bin" })).toBe(claude)
    expect(locate("git", { PATH: "/usr/local/bin" })).toBe(join(root, "user-global"))
    rmSync(codex)
    expect(locate("codex", { PATH: "/usr/local/bin" })).toBeUndefined()
    chmodSync(claude, 0o644)
    expect(locate("claude", { PATH: "/usr/local/bin" })).toBeUndefined()
  })

  it("does not use project-local auth/config directories", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-harness-home-"))
    directories.push(root)
    mkdirSync(join(root, "bin"))
    const locate = makeManagedHarnessLocator({ codex: join(root, "bin/codex") }, () => root)
    expect(
      locate("codex", { HOME: "/users/owner", CODEX_HOME: "/users/owner/.codex" })
    ).toBeUndefined()
    expect(locate("claude", { PATH: "/usr/local/bin" })).toBeUndefined()
    expect(makeManagedHarnessLocator({})("git", { PATH: "" })).toBeUndefined()
  })
})
