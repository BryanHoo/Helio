import { rmSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  browserExtensionInstallation,
  CODEVISOR_BROWSER_EXTENSION_ID
} from "./browser-extension-relay.js"
import {
  browserKeyDescription,
  browserUseTools,
  managedBrowserSandboxArguments
} from "./browser-use-provider.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe("Browser Use tool contract", () => {
  it("disables Chromium's process sandbox only for containerized or root Linux", () => {
    expect(
      managedBrowserSandboxArguments({ platform: "linux", uid: 0, containerized: false })
    ).toEqual(["--no-sandbox"])
    expect(
      managedBrowserSandboxArguments({ platform: "linux", uid: 1_000, containerized: true })
    ).toEqual(["--no-sandbox"])
    expect(
      managedBrowserSandboxArguments({ platform: "linux", uid: 1_000, containerized: false })
    ).toEqual([])
    expect(
      managedBrowserSandboxArguments({ platform: "darwin", uid: 0, containerized: true })
    ).toEqual([])
  })

  it("exposes Codevisor's CDP targeting and snapshot rules", () => {
    const snapshot = browserUseTools.find((candidate) => candidate.name === "snapshot")
    const click = browserUseTools.find((candidate) => candidate.name === "click")

    expect(snapshot?.description).toContain("snapshot-scoped")
    expect(snapshot?.description).toContain("re-snapshot after every action")
    expect(click?.description).toContain("trusted CDP mouse input")
    expect(click?.description).toContain("hit targeting")
  })

  it("does not bundle an extension even when an old Chrome profile still has one", () => {
    const home = mkdtempSync(join(tmpdir(), "codevisor-browser-extension-"))
    directories.push(home)
    expect(browserExtensionInstallation(home)).toMatchObject({ bundled: false, installed: false })

    expect(["darwin", "linux"]).toContain(process.platform)
    const profile =
      process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Google", "Chrome", "Default")
        : join(home, ".config", "google-chrome", "Default")
    mkdirSync(profile, { recursive: true })
    writeFileSync(
      join(profile, "Preferences"),
      JSON.stringify({ extensions: { settings: { [CODEVISOR_BROWSER_EXTENSION_ID]: {} } } })
    )
    expect(browserExtensionInstallation(home)).toMatchObject({
      bundled: false,
      installed: true,
      profiles: [profile]
    })
  })

  it("exposes a native-style nonblocking tab lifecycle", () => {
    expect(browserUseTools.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "connection_status",
        "openTabs",
        "claimTab",
        "finalizeTabs",
        "tab_info"
      ])
    )
    for (const tool of browserUseTools) {
      expect((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(
        false
      )
    }
  })

  it("exposes the native Browser Playwright locator operations", () => {
    expect(browserUseTools.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "playwright.domSnapshot",
        "playwright.count",
        "playwright.click",
        "playwright.fill",
        "playwright.type",
        "playwright.press",
        "playwright.check",
        "playwright.uncheck",
        "playwright.setChecked",
        "playwright.selectOption",
        "playwright.isVisible",
        "playwright.isEnabled",
        "playwright.getAttribute",
        "playwright.innerText",
        "playwright.textContent",
        "playwright.waitFor",
        "playwright.waitForTimeout",
        "playwright.waitForURL",
        "playwright.waitForLoadState",
        "playwright.allTextContents",
        "playwright.evaluate",
        "playwright.waitForEvent",
        "playwright.fileChooserSetFiles",
        "clipboard.readText",
        "clipboard.writeText",
        "dev.logs",
        "getJsDialog",
        "viewport.set",
        "viewport.reset",
        "cdp.send",
        "cdp.readEvents",
        "pageAssets.list",
        "pageAssets.bundle"
      ])
    )
  })

  it("documents the native clipboard item shape", () => {
    const clipboardWrite = browserUseTools.find((candidate) => candidate.name === "clipboard.write")
    expect(clipboardWrite?.inputSchema).toMatchObject({
      properties: {
        items: {
          items: {
            properties: {
              entries: {
                items: {
                  properties: {
                    mimeType: { type: "string" },
                    text: { type: "string" },
                    base64: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    })
  })

  it("accepts Playwright and legacy names for navigation keys", () => {
    expect(browserKeyDescription("ArrowRight")).toMatchObject({
      key: "ArrowRight",
      code: "ArrowRight",
      windowsVirtualKeyCode: 39
    })
    expect(browserKeyDescription("Right")).toMatchObject({
      key: "ArrowRight",
      code: "ArrowRight",
      windowsVirtualKeyCode: 39
    })
    expect(browserKeyDescription("Esc")).toMatchObject({ key: "Escape" })
  })
})
