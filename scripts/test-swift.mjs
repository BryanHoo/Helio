import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function runSwiftTests(args = [], run = spawnSync) {
  // Keep this command dedicated to the complete package test suite.
  for (const arg of args) {
    if (/^--(?:filter|skip|package-path|specifier)(?:=|$)/.test(arg) || arg === "-s") {
      throw new Error(`Test selection is managed by swift:test; cannot forward ${arg}`)
    }
  }
  const result = run("swift", ["test", "--package-path", "packages/swift", ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit"
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runSwiftTests(process.argv.slice(2))
}
