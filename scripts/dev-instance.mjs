import { createHash } from "node:crypto"
import { basename, join } from "node:path"

import { developmentLayout } from "./dev-layout.mjs"
import { colorFromHash, findAvailablePort, parsePort } from "./dev-shared.mjs"

/// Per-worktree identity of a dev rig: names, bundle identifiers, on-disk
/// layout, and the stable-but-scanned ports every process binds.

// Sanitize ambient Codevisor variables before anything inherits our env.
// This script is often launched from inside a running Codevisor instance
// (agent sessions, app terminals) whose server exports CODEVISOR_* state —
// e.g. CODEVISOR_APP_HOSTED=1 — which must never leak into the dev app or
// dev servers (a dev app that inherits APP_HOSTED thinks it manages its own
// server and hangs at "Starting Codevisor Server"). Only the documented
// dev-runner inputs survive.
const ambientAllowlist = new Set([
  "CODEVISOR_DEV_PORT",
  "HERDMAN_DEV_PORT",
  "CODEVISOR_DEV_DATA_DIR",
  "CODEVISOR_DEV_LOGS_DIR",
  "CODEVISOR_DEV_CACHE_DIR",
  "HERDMAN_DEV_DATA_DIR",
  "CODEVISOR_WORKTREES_ROOT",
  "HERDMAN_WORKTREES_ROOT",
  "CODEVISOR_REPOS_ROOT",
  "CODEVISOR_PLUGINS_ROOT",
  "CODEVISOR_GHOSTTY_ARTIFACTS_ROOT",
  "CODEVISOR_GHOSTTY_ARTIFACT_ORIGIN",
  "CODEVISOR_VERSION",
  "HERDMAN_VERSION"
])

export function sanitizeAmbientEnvironment(environment) {
  for (const key of Object.keys(environment)) {
    if (
      (key.startsWith("CODEVISOR_") || key.startsWith("HERDMAN_")) &&
      !ambientAllowlist.has(key)
    ) {
      delete environment[key]
    }
  }
}

export async function resolveDevelopmentInstance(repoRoot, environment) {
  const worktreeName = basename(repoRoot)
  const instanceHash = createHash("sha256").update(repoRoot).digest("hex").slice(0, 10)
  const worktreeHash = createHash("sha256").update(worktreeName).digest("hex")
  const developmentIconColor = colorFromHash(worktreeHash)
  const instanceName = `${worktreeName}-${instanceHash}`
  // Per-instance URL scheme, mirroring the per-instance bundle identifier:
  // every dev worktree registering plain codevisor-dev:// would leave
  // LaunchServices routing deeplinks to an arbitrary one of them. The Swift
  // deeplink parsers accept the whole codevisor-dev-* family.
  const urlScheme = `codevisor-dev-${instanceHash}`
  const appName = `Helio (${worktreeName})`
  const macOSBundleIdentifier = `com.851labs.Codevisor.Development.${instanceHash}`
  const layout = developmentLayout(repoRoot)
  const derivedDataPath = layout.build.macos.derivedData
  const appBundle = join(derivedDataPath, "Build", "Products", "Debug", `${appName}.app`)
  const appExecutable = join(appBundle, "Contents", "MacOS", appName)

  const preferredPort = 51_000 + (Number.parseInt(instanceHash.slice(0, 8), 16) % 10_000)
  const requestedPort = parsePort(
    environment.CODEVISOR_DEV_PORT ?? environment.HERDMAN_DEV_PORT,
    "CODEVISOR_DEV_PORT"
  )
  const port = requestedPort ?? (await findAvailablePort(preferredPort, 51_000, 10_000))

  return {
    appBundle,
    appExecutable,
    appName,
    appServerName: `Helio (${worktreeName})`,
    dataDirectory: layout.local.data,
    derivedDataPath,
    developmentIconColor,
    instanceHash,
    instanceName,
    layout,
    macOSBundleIdentifier,
    port,
    tmpRoot: layout.tmpRoot,
    urlScheme,
    worktreeName,
    worktreesDirectory: layout.local.worktrees
  }
}
