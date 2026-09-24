import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export function developmentLayout(repoRoot, environment = process.env) {
  const tmpRoot = join(repoRoot, "tmp")
  const localCodevisorRoot = join(tmpRoot, ".codevisor")
  const buildRoot = join(tmpRoot, "build")

  return {
    tmpRoot,
    local: {
      root: localCodevisorRoot,
      data:
        environment.CODEVISOR_DEV_DATA_DIR ??
        environment.HERDMAN_DEV_DATA_DIR ??
        join(localCodevisorRoot, "data"),
      logs: environment.CODEVISOR_DEV_LOGS_DIR ?? join(localCodevisorRoot, "logs"),
      repos: environment.CODEVISOR_REPOS_ROOT ?? join(localCodevisorRoot, "repos"),
      plugins: environment.CODEVISOR_PLUGINS_ROOT ?? join(localCodevisorRoot, "plugins"),
      cache: environment.CODEVISOR_DEV_CACHE_DIR ?? join(localCodevisorRoot, "cache"),
      worktrees:
        environment.CODEVISOR_WORKTREES_ROOT ??
        environment.HERDMAN_WORKTREES_ROOT ??
        join(tmpRoot, "codevisor")
    },
    build: {
      root: buildRoot,
      macos: {
        derivedData: join(buildRoot, "macos", "DerivedData"),
        sourcePackages: join(buildRoot, "macos", "SourcePackages")
      },
      pixelbook: {
        derivedData: join(buildRoot, "pixelbook", "DerivedData"),
        sourcePackages: join(buildRoot, "pixelbook", "SourcePackages")
      },
      // Shared across worktrees like the Ghostty and Chromium artifacts.
      // SwiftPM's package cache is an append-only store of git mirrors and
      // checksummed binary artifacts keyed by origin — Xcode shares it
      // machine-wide by default, and SwiftPM serializes access itself. Which
      // commits a worktree checks out stays per worktree (sourcePackages).
      packageCache:
        environment.CODEVISOR_SWIFT_PACKAGE_CACHE ??
        join(homedir(), ".codevisor-development", "artifacts", "swift-package-cache"),
      bunCache: join(buildRoot, "bun-cache"),
      nodeGyp: join(buildRoot, "node-gyp"),
      generated: join(buildRoot, "generated"),
      turboCache: join(buildRoot, "turbo-cache")
    },
    runtime: {
      root: join(tmpRoot, "runtime"),
      temp: join(tmpRoot, "runtime", "temp"),
      manifest: join(tmpRoot, "runtime", "manifest.json")
    }
  }
}

export async function ensureDevelopmentDirectories(layout) {
  await Promise.all(
    [
      layout.local.data,
      layout.local.logs,
      layout.local.repos,
      layout.local.plugins,
      layout.local.cache,
      layout.local.worktrees,
      layout.build.generated,
      layout.build.bunCache,
      layout.build.nodeGyp,
      layout.runtime.temp
    ].map((directory) => mkdir(directory, { recursive: true }))
  )
}

export async function ensureBuildDirectories(layout) {
  await Promise.all(
    [layout.build.bunCache, layout.build.nodeGyp, layout.build.generated, layout.runtime.temp].map(
      (directory) => mkdir(directory, { recursive: true })
    )
  )
}

export function localDevelopmentEnvironment(layout, environment = process.env) {
  return {
    ...environment,
    TMPDIR: layout.runtime.temp,
    BUN_INSTALL_CACHE_DIR: layout.build.bunCache,
    npm_config_devdir: layout.build.nodeGyp,
    ...(process.platform === "darwin" ? { npm_config_python: "/usr/bin/python3" } : {}),
    CODEVISOR_DEV_DATA_DIR: layout.local.data,
    CODEVISOR_DEV_LOGS_DIR: layout.local.logs,
    CODEVISOR_DEV_CACHE_DIR: layout.local.cache,
    CODEVISOR_DATA_DIR: layout.local.data,
    CODEVISOR_LOGS_DIR: layout.local.logs,
    CODEVISOR_WORKTREES_ROOT: layout.local.worktrees,
    CODEVISOR_REPOS_ROOT: layout.local.repos,
    CODEVISOR_PLUGINS_ROOT: layout.local.plugins
  }
}
