import assert from "node:assert/strict"
import test from "node:test"

import { requestsMacOSBuildReuse, verifyReusableMacOSApp } from "./dev-macos-reuse.mjs"

function fixture(overrides = {}) {
  const calls = []
  return {
    calls,
    options: {
      appBundle: "/owned/Debug/Example.app",
      bundleIdentifier: "dev.example",
      executableName: "Example",
      capture: async (command, args) => {
        calls.push([command, ...args])
        return JSON.stringify({ CFBundleIdentifier: "dev.example", CFBundleExecutable: "Example" })
      },
      run: async (command, args) => calls.push([command, ...args]),
      ...overrides
    }
  }
}

test("reuse performs only metadata reading and strict signature verification", async () => {
  const { options, calls } = fixture()
  await verifyReusableMacOSApp(options)
  assert.deepEqual(calls, [
    [
      "/usr/bin/plutil",
      "-convert",
      "json",
      "-o",
      "-",
      "/owned/Debug/Example.app/Contents/Info.plist"
    ],
    ["/usr/bin/codesign", "--verify", "--deep", "--strict", "/owned/Debug/Example.app"]
  ])
})

for (const [name, overrides, message] of [
  [
    "missing",
    {
      capture: async () => {
        throw new Error("missing plist")
      }
    },
    /missing plist/
  ],
  [
    "foreign",
    { capture: async () => JSON.stringify({ CFBundleIdentifier: "other" }) },
    /Cannot reuse/
  ],
  [
    "wrong executable",
    {
      capture: async () =>
        JSON.stringify({ CFBundleIdentifier: "dev.example", CFBundleExecutable: "Other" })
    },
    /Cannot reuse/
  ],
  [
    "invalid signature",
    {
      run: async () => {
        throw new Error("invalid signature")
      }
    },
    /invalid signature/
  ]
]) {
  test(`${name} artifact rejects reuse without a rebuild or signing command`, async () => {
    const { options, calls } = fixture(overrides)
    await assert.rejects(verifyReusableMacOSApp(options), message)
    assert.ok(calls.every(([command]) => command === "/usr/bin/plutil"))
  })
}

test("reuse is explicit in the Mac-only runner", () => {
  assert.equal(requestsMacOSBuildReuse([]), false)
  assert.equal(requestsMacOSBuildReuse(["--reuse-macos-build"]), true)
})
