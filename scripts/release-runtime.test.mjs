import assert from "node:assert/strict"
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { removeBundledHarnessBinaries, stageReleaseRuntime } from "./release-runtime.mjs"

test("release runtime keeps the server entrypoint, resources and version together", async () => {
  const root = await mkdtemp(join(tmpdir(), "helio-release-"))
  const repoRoot = join(root, "repo")
  const runtimeRoot = join(root, "runtime")
  const nodeExecutable = join(root, "node")
  try {
    await Promise.all(
      [
        repoRoot,
        join(repoRoot, "apps/server/dist"),
        join(repoRoot, "packages/api/dist"),
        join(repoRoot, "packages/api/resources")
      ].map((directory) => mkdir(directory, { recursive: true }))
    )
    await writeFile(join(repoRoot, "package.json"), '{"workspaces":["apps/*","packages/*"]}')
    await writeFile(join(repoRoot, "bun.lock"), "")
    await writeFile(join(repoRoot, "apps/server/package.json"), '{"name":"@codevisor/server"}')
    await writeFile(join(repoRoot, "apps/server/dist/main.js"), "console.log('ready')")
    await writeFile(join(repoRoot, "packages/api/package.json"), '{"name":"@codevisor/api"}')
    await writeFile(join(repoRoot, "packages/api/dist/index.js"), "export const ready = true")
    await writeFile(join(repoRoot, "packages/api/resources/schema.json"), "{}")
    await writeFile(nodeExecutable, "node")
    await chmod(nodeExecutable, 0o755)

    await stageReleaseRuntime({
      repoRoot,
      runtimeRoot,
      nodeExecutable,
      version: "1.0",
      buildNumber: 1,
      sourceRevision: "abc123-dirty"
    })

    assert.equal(await readlink(join(runtimeRoot, "main.js")), "apps/server/dist/main.js")
    assert.equal(await readFile(join(runtimeRoot, "VERSION"), "utf8"), "1.0\n")
    assert.equal(await readFile(join(runtimeRoot, "apps/server/dist/VERSION"), "utf8"), "1.0\n")
    assert.deepEqual(JSON.parse(await readFile(join(runtimeRoot, "BUILD.json"), "utf8")), {
      buildNumber: 1,
      sourceRevision: "abc123-dirty"
    })
    assert.equal(
      await readFile(join(runtimeRoot, "packages/api/resources/schema.json"), "utf8"),
      "{}"
    )
    assert.equal((await lstat(join(runtimeRoot, "bin/node"))).mode & 0o111, 0o111)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("release runtime removes bundled harness executables but retains the Claude SDK", async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "helio-harness-release-"))
  const store = join(runtimeRoot, "node_modules/.bun")
  const sdk = join(store, "@anthropic-ai+claude-agent-sdk@1/node_modules/@anthropic-ai")
  const native = join(
    store,
    "@anthropic-ai+claude-agent-sdk-darwin-arm64@1/node_modules/@anthropic-ai"
  )
  const codex = join(store, "@openai+codex@1/node_modules/@openai")
  const cli = join(store, "@anthropic-ai+claude-code@1/node_modules/@anthropic-ai")
  try {
    for (const path of [
      join(sdk, "claude-agent-sdk"),
      join(native, "claude-agent-sdk-darwin-arm64"),
      join(codex, "codex"),
      join(cli, "claude-code")
    ]) {
      await mkdir(path, { recursive: true })
      await writeFile(join(path, "package.json"), "{}")
    }
    await mkdir(join(runtimeRoot, "apps/server/node_modules/@openai"), { recursive: true })
    await mkdir(join(store, "node_modules/@anthropic-ai"), { recursive: true })
    await mkdir(join(runtimeRoot, "packages/adapter-claude/node_modules/@anthropic-ai"), {
      recursive: true
    })
    await symlink(
      join(native, "claude-agent-sdk-darwin-arm64"),
      join(store, "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64")
    )
    await symlink(
      join(native, "claude-agent-sdk-darwin-arm64"),
      join(
        runtimeRoot,
        "packages/adapter-claude/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"
      )
    )
    await symlink(join(codex, "codex"), join(runtimeRoot, "apps/server/node_modules/@openai/codex"))

    await removeBundledHarnessBinaries(runtimeRoot)

    assert.equal(await readFile(join(sdk, "claude-agent-sdk/package.json"), "utf8"), "{}")
    for (const path of [
      join(native, "claude-agent-sdk-darwin-arm64"),
      join(codex, "codex"),
      join(cli, "claude-code"),
      join(store, "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"),
      join(runtimeRoot, "apps/server/node_modules/@openai/codex"),
      join(
        runtimeRoot,
        "packages/adapter-claude/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"
      )
    ]) {
      await assert.rejects(lstat(path), { code: "ENOENT" })
    }
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true })
  }
})
