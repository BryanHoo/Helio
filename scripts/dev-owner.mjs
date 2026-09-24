import { spawn } from "node:child_process"
import { mkdir, realpath, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  readProcessTable,
  processIdentity,
  stopProcesses,
  trackProcessTree
} from "../packages/processes/src/index.mjs"
import { developmentLayout } from "./dev-layout.mjs"
import { claimDevelopmentRunner, readManifest, releaseDevelopmentRunner } from "./dev-runtime.mjs"

const repoRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)))
const [kind, ...args] = process.argv.slice(2)
if (kind !== "macos" || args.some((arg) => arg !== "--reuse-macos-build")) {
  throw new Error("usage: bun scripts/dev.mjs [--reuse-macos-build]")
}
const layout = developmentLayout(repoRoot)
const claimPath = layout.runtime.manifest
const claim = {
  kind,
  pid: process.ppid,
  ownerPid: process.pid,
  ownerStartedAt: (await processIdentity(process.pid))?.startedAt,
  repoRoot,
  startedAt: new Date().toISOString()
}
const appName = `Helio (${basename(repoRoot)})`
const appExecutable = join(
  layout.build.macos.derivedData,
  "Build/Products/Debug",
  `${appName}.app`,
  "Contents/MacOS",
  appName
)
let stopRequested = false
let wake
const stopped = new Promise((resolve) => {
  wake = resolve
})
const requestStop = () => {
  stopRequested = true
  wake()
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, requestStop)
process.stdin.on("end", requestStop)
process.stdin.on("error", requestStop)
process.stdin.resume()
let claimed = false
let child
let tree
let monitor
try {
  await mkdir(dirname(claimPath), { recursive: true })
  await claimDevelopmentRunner(claimPath, claim)
  claimed = true
  await cleanupExternalResources()
  if (!stopRequested) {
    child = spawn(process.execPath, [join(repoRoot, "scripts", "dev-local-macos.mjs"), ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      detached: true
    })
    const exited = new Promise((resolve, reject) => {
      child.once("exit", (code, signal) => resolve({ code, signal }))
      child.once("error", reject)
    })
    exited.catch(requestStop)
    tree = await trackProcessTree(child.pid)
    monitor = setInterval(() => {
      void readManifest(claimPath)
        .then((current) => {
          if (current?.ownerPid !== process.pid) requestStop()
        })
        .catch(requestStop)
    }, 1_000)
    const result = await Promise.race([stopped, exited])
    process.exitCode = stopRequested ? 0 : (result?.code ?? 1)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  clearInterval(monitor)
  if (claimed) {
    // Stop startup/build work before externally launched resources, so a
    // late install or launch cannot recreate them during teardown.
    const failures = []
    try {
      await tree?.stop({ graceMs: 4_000 })
    } catch (error) {
      failures.push(error)
    }
    try {
      await cleanupExternalResources()
    } catch (error) {
      failures.push(error)
    }
    await releaseDevelopmentRunner(claimPath, claim)
    for (const error of failures) console.error(`Development cleanup failed: ${error.message}`)
    if (failures.length) process.exitCode = 1
  }
  process.stdin.destroy()
}

async function cleanupExternalResources() {
  const cleanup = [
    (async () => {
      const apps = (await readProcessTable()).filter((entry) => entry.command === appExecutable)
      await stopProcesses(apps, { graceMs: 2_000 })
    })(),
    rm(join(repoRoot, "apps/macos/Codevisor/Resources/AppIconDevGenerated.icon"), {
      recursive: true,
      force: true
    })
  ]
  const results = await Promise.allSettled(cleanup)
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason)
  if (failures.length)
    throw new AggregateError(failures, "External development resources could not be cleaned up")
}
