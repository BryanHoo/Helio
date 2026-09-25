import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { runSwiftTests } from "./test-swift.mjs"

const root = fileURLToPath(new URL("../packages/swift", import.meta.url))

function testSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "Vendor") return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return testSources(path)
    return path.includes("/Tests/") && path.endsWith(".swift") ? [path] : []
  })
}

test("Swift suites do not change the global executor", () => {
  const suites = testSources(root)
    .filter((path) =>
      /\b(?:TestStore|TestStoreOf|withMainSerialExecutor)\b/.test(readFileSync(path, "utf8"))
    )
    .map((path) => basename(path, ".swift"))
  assert.deepEqual(suites, [])
})

test("the Swift runner executes the full package once and rejects extra selections", () => {
  const calls = []
  assert.equal(
    runSwiftTests(["--build-system", "native"], (executable, args) => {
      assert.equal(executable, "swift")
      calls.push(args)
      return { status: 0 }
    }),
    0
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], [
    "test",
    "--package-path",
    "packages/swift",
    "--build-system",
    "native"
  ])
  for (const arg of ["--filter", "--filter=OtherTests", "--skip", "--package-path", "-s"]) {
    assert.throws(
      () => runSwiftTests([arg], () => assert.fail("must not launch Swift")),
      /cannot forward/
    )
  }
})

test("Swift test failures preserve their exit status", () => {
  assert.equal(
    runSwiftTests([], () => ({ status: 17 })),
    17
  )
  assert.equal(
    runSwiftTests([], () => ({ status: null, signal: "SIGTERM" })),
    1
  )
})
