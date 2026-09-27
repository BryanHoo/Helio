import { rmSync } from "node:fs"
import { mkdtemp, readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  credentialFerrySources,
  canonicalCredentialJson,
  readJsonFile,
  withFileLock
} from "./credential-ferry.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

const makeSources = async () => {
  const home = await mkdtemp(join(tmpdir(), "codevisor-ferry-"))
  roots.push(home)
  const env = { HOME: home, XDG_DATA_HOME: join(home, ".local", "share") }
  const sources = credentialFerrySources({ resolveEnv: () => Promise.resolve(env) })
  const byId = Object.fromEntries(sources.map((source) => [source.id, source]))
  return { home, byId }
}

describe("codex source", () => {
  it("ferries api-key files but never a live ChatGPT login, either direction", async () => {
    const { home, byId } = await makeSources()
    const path = join(home, ".codex", "auth.json")
    const source = byId["codex-auth-file"]!
    expect(source.tombstoneOnAbsence).toBe(true)
    expect(await source.localOverrides!()).toEqual([])

    // API-key file publishes whole.
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(path, JSON.stringify({ OPENAI_API_KEY: "sk-c" }))
    expect(await source.read()).toBe(canonicalCredentialJson({ OPENAI_API_KEY: "sk-c" }))

    // A rotating token family stops publication…
    await writeFile(path, JSON.stringify({ tokens: { access_token: "a" }, last_refresh: "t" }))
    expect(await source.localOverrides!()).toEqual(["*"])
    expect(await source.read()).toBeUndefined()
    // …and refuses ferried content and deletions while it lives.
    await source.apply(canonicalCredentialJson({ OPENAI_API_KEY: "ferried" }))
    expect(JSON.parse(await readFile(path, "utf8"))).toHaveProperty("tokens")
    await source.applyDelete!()
    expect(JSON.parse(await readFile(path, "utf8"))).toHaveProperty("tokens")

    // Back to an API key: applies and deletes propagate.
    await writeFile(path, JSON.stringify({ OPENAI_API_KEY: "old" }))
    await source.apply(canonicalCredentialJson({ OPENAI_API_KEY: "ferried" }))
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ OPENAI_API_KEY: "ferried" })
    await source.applyDelete!()
    expect(await source.read()).toBeUndefined()
    // Deleting when already absent is a quiet no-op.
    await source.applyDelete!()
  })
})

describe("devin source", () => {
  it("ferries the credentials file verbatim and tombstones on absence", async () => {
    const { home, byId } = await makeSources()
    const source = byId["devin-credentials-file"]!
    expect(source.tombstoneOnAbsence).toBe(true)
    expect(await source.read()).toBeUndefined()

    const path = join(home, ".local", "share", "devin", "credentials.toml")
    await mkdir(join(home, ".local", "share", "devin"), { recursive: true })
    const content = 'windsurf_api_key = "wk-static"\napi_server_url = "https://api.devin.ai"\n'
    await writeFile(path, content)
    expect(await source.read()).toBe(content)

    // Verbatim apply onto a fresh machine, locked down to owner-only.
    const { home: other, byId: otherById } = await makeSources()
    const target = otherById["devin-credentials-file"]!
    await target.apply(content)
    const applied = join(other, ".local", "share", "devin", "credentials.toml")
    expect(await readFile(applied, "utf8")).toBe(content)
    expect(((await stat(applied)).mode & 0o777).toString(8)).toBe("600")

    // A fleet sign-out removes the file.
    await target.applyDelete!()
    await expect(readFile(applied, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await target.applyDelete!()
  })

  it("honors HOME fallback when XDG_DATA_HOME is unset and surfaces read errors", async () => {
    const home = await mkdtemp(join(tmpdir(), "codevisor-ferry-"))
    roots.push(home)
    const sources = credentialFerrySources({
      resolveEnv: () => Promise.resolve({ HOME: home })
    })
    const source = sources.find((candidate) => candidate.id === "devin-credentials-file")!
    await source.apply('windsurf_api_key = "wk"\n')
    expect(
      await readFile(join(home, ".local", "share", "devin", "credentials.toml"), "utf8")
    ).toContain("wk")

    // A directory where the file should be is an error, never "absent".
    const broken = await mkdtemp(join(tmpdir(), "codevisor-ferry-"))
    roots.push(broken)
    await mkdir(join(broken, ".local", "share", "devin", "credentials.toml"), {
      recursive: true
    })
    const brokenSource = credentialFerrySources({
      resolveEnv: () => Promise.resolve({ HOME: broken })
    }).find((candidate) => candidate.id === "devin-credentials-file")!
    await expect(brokenSource.read()).rejects.toThrow()

    // A bare environment falls back to the process home; the read itself
    // must be well-formed either way (present file or none).
    const bare = credentialFerrySources({ resolveEnv: () => Promise.resolve({}) }).find(
      (candidate) => candidate.id === "devin-credentials-file"
    )!
    const bareRead = await bare.read()
    expect(bareRead === undefined || typeof bareRead === "string").toBe(true)
  })
})

describe("supported credential sources", () => {
  it("exposes only static Codex and Devin credentials", async () => {
    const { byId } = await makeSources()
    expect(Object.keys(byId).sort()).toEqual(["codex-auth-file", "devin-credentials-file"])
  })

  it("rejects malformed Codex files and honors CODEX_HOME", async () => {
    const { home } = await makeSources()
    const path = join(home, "custom-codex", "auth.json")
    await mkdir(join(home, "custom-codex"), { recursive: true })
    await writeFile(path, JSON.stringify(["not", "an object"]))
    const source = credentialFerrySources({
      resolveEnv: async () => ({ HOME: home, CODEX_HOME: join(home, "custom-codex") })
    }).find((entry) => entry.id === "codex-auth-file")!
    await expect(source.read()).rejects.toThrow("Not a credential object")
  })

  it("sorts credential keys and propagates filesystem failures", async () => {
    expect(canonicalCredentialJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}')
    const { home } = await makeSources()
    const directory = join(home, "directory-instead-of-json")
    await mkdir(directory)
    await expect(readJsonFile(directory)).rejects.toThrow()
  })

  it("releases the credential lock after both success and failure", async () => {
    const { home } = await makeSources()
    const path = join(home, "nested", "auth.json")
    await expect(
      withFileLock(path, async () => {
        throw new Error("write failed")
      })
    ).rejects.toThrow("write failed")
    await withFileLock(path, async () => {
      expect(await readFile(path, "utf8")).toBe("{}")
    })
    const invalidPath = join(home, "nested", "auth.json", "child")
    await expect(withFileLock(invalidPath, async () => undefined)).rejects.toThrow()
    await expect(
      withFileLock(
        path,
        async () => undefined,
        async () => {
          throw Object.assign(new Error("permission denied"), { code: "EACCES" })
        }
      )
    ).rejects.toThrow("permission denied")
  })

  it("resolves the Codex path from the system home when HOME is absent", async () => {
    const { home } = await makeSources()
    vi.stubEnv("HOME", home)
    try {
      const source = credentialFerrySources({ resolveEnv: async () => ({}) })[0]!
      expect(await source.read()).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
