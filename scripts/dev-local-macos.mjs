import { spawn } from "node:child_process"
import { realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { bootstrapDevelopment, ensureNativeFrameworks } from "./dev-bootstrap.mjs"
import {
  createDevelopmentAppIcon,
  makeCommandRunner,
  resolveDevelopmentSigningArguments,
  terminateExactDevelopmentApp
} from "./dev-host-tools.mjs"
import { resolveDevelopmentInstance, sanitizeAmbientEnvironment } from "./dev-instance.mjs"
import { ensureDevelopmentDirectories, localDevelopmentEnvironment } from "./dev-layout.mjs"
import { requestsMacOSBuildReuse, verifyReusableMacOSApp } from "./dev-macos-reuse.mjs"
import { describeExit, waitForExit, waitForHealth } from "./dev-shared.mjs"
import { runXcodebuild } from "./xcodebuild.mjs"

const repoRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)))
const arguments_ = process.argv.slice(2)
if (arguments_.some((argument) => argument !== "--reuse-macos-build")) {
  throw new Error("usage: bun scripts/dev-local-macos.mjs [--reuse-macos-build]")
}

sanitizeAmbientEnvironment(process.env)
const instance = await resolveDevelopmentInstance(repoRoot, process.env)
const {
  appBundle,
  appExecutable,
  appName,
  appServerName,
  dataDirectory,
  developmentIconColor,
  layout,
  macOSBundleIdentifier,
  port,
  urlScheme,
  worktreeName
} = instance
await ensureDevelopmentDirectories(layout)
Object.assign(process.env, localDevelopmentEnvironment(layout, process.env))
const { capture, run } = makeCommandRunner(repoRoot)
const reuseBuild = requestsMacOSBuildReuse(arguments_)
const project = ["-project", "apps/macos/Codevisor.xcodeproj", "-scheme", "Codevisor"]

if (reuseBuild) {
  await verifyReusableMacOSApp({
    appBundle,
    bundleIdentifier: macOSBundleIdentifier,
    executableName: appName,
    capture,
    run
  })
}

console.log(`Helio development instance: ${worktreeName}`)
console.log(`  app:    ${appName}`)
console.log(`  server: http://127.0.0.1:${port}`)
console.log(`  data:   ${dataDirectory}`)

await bootstrapDevelopment(repoRoot, { environment: process.env })
await Promise.all([
  run("bun", ["run", "--cwd", "apps/server", "build"]),
  ensureNativeFrameworks(repoRoot, { environment: process.env }),
  reuseBuild
    ? undefined
    : runXcodebuild(repoRoot, "macos", [...project, "-resolvePackageDependencies"], {
        environment: process.env,
        layout
      })
])

if (!reuseBuild) {
  const generatedIcon = await createDevelopmentAppIcon(repoRoot, developmentIconColor)
  try {
    const signingArguments = await resolveDevelopmentSigningArguments(capture)
    await runXcodebuild(
      repoRoot,
      "macos",
      [
        ...project,
        "-configuration",
        "Debug",
        `CODEVISOR_DEV_PRODUCT_NAME=${appName}`,
        `CODEVISOR_DEV_DISPLAY_NAME=${appName}`,
        `CODEVISOR_DEV_BUNDLE_IDENTIFIER=${macOSBundleIdentifier}`,
        `CODEVISOR_URL_SCHEME=${urlScheme}`,
        "CODEVISOR_APP_ICON_NAME=AppIconDevGenerated",
        "INFOPLIST_KEY_CFBundleIconFile=AppIconDevGenerated",
        "INFOPLIST_KEY_CFBundleIconName=AppIconDevGenerated",
        ...signingArguments,
        "build"
      ],
      { environment: process.env, layout }
    )
  } finally {
    await rm(generatedIcon, { recursive: true, force: true })
  }
}

// 开发版只监听本机回环地址，不启动云端、网页或第二台测试机器。
const server = spawn(
  "node",
  [
    join(repoRoot, "apps/server/dist/main.js"),
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--db",
    join(dataDirectory, "codevisor-server.sqlite"),
    "--auth",
    "token",
    "--kind",
    "local",
    "--name",
    appServerName
  ],
  { cwd: repoRoot, env: process.env, stdio: "inherit" }
)
let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  terminateExactDevelopmentApp(appExecutable)
  try {
    await fetch(`http://127.0.0.1:${port}/v1/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(1_000)
    })
  } catch {
    server.kill("SIGTERM")
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void stop())

try {
  await waitForHealth(port, server)
  const launchEnvironment = Object.entries(process.env).filter(
    ([key]) => key === "TMPDIR" || key.startsWith("CODEVISOR_") || key.startsWith("GHOSTTY_")
  )
  const opened = spawn(
    "/usr/bin/open",
    [
      "-n",
      "-W",
      ...launchEnvironment.flatMap(([key, value]) => ["--env", `${key}=${value}`]),
      appBundle
    ],
    { cwd: repoRoot, stdio: "inherit" }
  )
  const firstExit = await Promise.race([
    waitForExit(opened).then((result) => ({ name: "app", result })),
    waitForExit(server).then((result) => ({ name: "server", result }))
  ])
  if (!stopping && firstExit.name === "server") {
    console.error(`Local server exited unexpectedly (${describeExit(firstExit.result)}).`)
    process.exitCode = firstExit.result.code ?? 1
  }
} finally {
  await stop()
}
