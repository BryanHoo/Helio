import assert from "node:assert/strict"
import { chmod, lstat, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { stageReleaseRuntime } from "./release-runtime.mjs"

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
