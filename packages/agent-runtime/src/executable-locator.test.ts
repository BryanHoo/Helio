import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, expect, it } from "vitest"

import { locateExecutableOnPath } from "./executable-locator.js"

const directories: Array<string> = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it("searches PATH and expands executable home-relative fallbacks", () => {
  const home = mkdtempSync(join(tmpdir(), "agent-runtime-bin-"))
  directories.push(home)
  const bin = join(home, "agent")
  writeFileSync(bin, "#!/bin/sh\n")
  chmodSync(bin, 0o755)

  expect(locateExecutableOnPath("agent", { PATH: `${home}/missing:${home}` })).toBe(bin)
  expect(locateExecutableOnPath(bin, { PATH: "" })).toBe(bin)
  expect(locateExecutableOnPath("~/agent", { HOME: home })).toBe(bin)
  expect(locateExecutableOnPath("~/agent", {})).toBeUndefined()
  expect(locateExecutableOnPath("missing", { PATH: home })).toBeUndefined()
  expect(locateExecutableOnPath(join(home, "missing"), {})).toBeUndefined()
  expect(locateExecutableOnPath("missing", {})).toBeUndefined()

  chmodSync(bin, 0o644)
  expect(locateExecutableOnPath("agent", { PATH: home })).toBeUndefined()
})
