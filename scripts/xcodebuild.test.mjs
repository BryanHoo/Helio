import assert from "node:assert/strict"
import test from "node:test"

import { developmentLayout } from "./dev-layout.mjs"
import { xcodebuildArguments } from "./xcodebuild.mjs"

test("xcodebuild builds pin worktree-local caches", () => {
  const layout = developmentLayout("/repo/codevisor", {})
  const arguments_ = xcodebuildArguments(layout, "macos", ["-scheme", "Codevisor", "build"])

  assert.deepEqual(arguments_.slice(0, 7), [
    "-derivedDataPath",
    layout.build.macos.derivedData,
    "-clonedSourcePackagesDirPath",
    layout.build.macos.sourcePackages,
    "-packageCachePath",
    layout.build.packageCache,
    "-skipMacroValidation"
  ])
  assert.deepEqual(arguments_.slice(7), ["-scheme", "Codevisor", "build"])
})

test("standalone Xcode operations omit incompatible build flags", () => {
  const layout = developmentLayout("/repo/codevisor", {})
  const exportArguments = [
    "-exportArchive",
    "-archivePath",
    "/repo/codevisor/tmp/build/macos/Helio.xcarchive",
    "-exportOptionsPlist",
    "/repo/codevisor/tmp/build/macos/ExportOptions.plist",
    "-exportPath",
    "/repo/codevisor/tmp/build/macos/export"
  ]

  assert.deepEqual(xcodebuildArguments(layout, "macos", exportArguments), exportArguments)
})

test("xcodebuild arguments reject unknown platforms", () => {
  const layout = developmentLayout("/repo/codevisor", {})
  assert.throws(() => xcodebuildArguments(layout, "watchos", []), /Unknown Xcode platform/)
})
