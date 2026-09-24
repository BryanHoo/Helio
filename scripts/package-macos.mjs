import { execFileSync, spawn } from "node:child_process"
import { access, cp, mkdir, realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { bootstrapDevelopment } from "./dev-bootstrap.mjs"
import {
  developmentLayout,
  ensureBuildDirectories,
  localDevelopmentEnvironment
} from "./dev-layout.mjs"
import { stageReleaseRuntime } from "./release-runtime.mjs"
import { runXcodebuild } from "./xcodebuild.mjs"

const repoRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)))
if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) {
  throw new Error("macOS arm64 or x64 is required")
}

const arch = process.arch === "arm64" ? "arm64" : "x86_64"
const target = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64"
const baseLayout = developmentLayout(repoRoot)
const releaseRoot = join(baseLayout.build.root, "release")
const layout = {
  ...baseLayout,
  build: {
    ...baseLayout.build,
    macos: {
      derivedData: join(releaseRoot, "DerivedData"),
      sourcePackages: join(releaseRoot, "SourcePackages")
    }
  }
}
const environment = localDevelopmentEnvironment(layout)
const run = (command, args, cwd = repoRoot) =>
  new Promise((resolve, reject) => {
    process.stdout.write(`\n$ ${command} ${args.join(" ")}\n`)
    const child = spawn(command, args, { cwd, env: environment, stdio: "inherit" })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} failed (${signal ?? `code ${code}`})`))
    })
  })

await ensureBuildDirectories(layout)
await bootstrapDevelopment(repoRoot, { environment, ghostty: true, architectures: [arch] })
await run("bun", ["run", "build", "--filter=@codevisor/server..."])
await runXcodebuild(
  repoRoot,
  "macos",
  [
    "-quiet",
    "-project",
    "apps/macos/Codevisor.xcodeproj",
    "-scheme",
    "Codevisor",
    "-configuration",
    "Release",
    "-arch",
    arch,
    "ONLY_ACTIVE_ARCH=YES",
    "CODE_SIGNING_ALLOWED=NO",
    "build"
  ],
  { environment, layout }
)

const app = join(layout.build.macos.derivedData, "Build/Products/Release/Helio.app")
const info = JSON.parse(
  execFileSync("plutil", ["-convert", "json", "-o", "-", join(app, "Contents/Info.plist")], {
    encoding: "utf8"
  })
)
const version = info.CFBundleShortVersionString
const buildNumber = Number(info.CFBundleVersion)
if (typeof version !== "string" || !Number.isSafeInteger(buildNumber)) {
  throw new Error("Release app has invalid version metadata")
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8"
}).trim()
const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: repoRoot,
  encoding: "utf8"
}).trim()
const runtimeRoot = join(releaseRoot, "runtime")
await rm(runtimeRoot, { recursive: true, force: true })
await stageReleaseRuntime({
  repoRoot,
  runtimeRoot,
  nodeExecutable: execFileSync("/usr/bin/which", ["node"], { encoding: "utf8" }).trim(),
  version,
  buildNumber,
  sourceRevision: dirty ? `${revision}-dirty` : revision
})
await run("bun", [
  "install",
  "--cwd",
  runtimeRoot,
  "--production",
  "--filter",
  "@codevisor/server",
  "--frozen-lockfile"
])

const bundledRuntime = join(app, "Contents/Resources/server", target)
await rm(bundledRuntime, { recursive: true, force: true })
await cp(runtimeRoot, bundledRuntime, { recursive: true, verbatimSymlinks: true })
await Promise.all(
  [
    join(bundledRuntime, "main.js"),
    join(bundledRuntime, "bin/node"),
    join(app, "Contents/Library/LaunchAgents/com.851labs.Codevisor.ServerAgent.plist")
  ].map((path) => access(path))
)

const identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
  encoding: "utf8"
})
const identity =
  process.env.CODEVISOR_SIGN_IDENTITY ??
  identities.match(/"(Developer ID Application: [^"]+)"/)?.[1]
if (!identity) throw new Error("Developer ID Application signing identity is required")
await run("codesign", ["--force", "--deep", "--options", "runtime", "--sign", identity, app])
await run("codesign", ["--verify", "--deep", "--strict", app])

const dmg = join(releaseRoot, `Helio-${version}-macos-${process.arch}.dmg`)
await mkdir(releaseRoot, { recursive: true })
await run("hdiutil", [
  "create",
  "-volname",
  "Helio",
  "-srcfolder",
  app,
  "-ov",
  "-format",
  "UDZO",
  dmg
])
await run("hdiutil", ["verify", dmg])
process.stdout.write(`\nRelease package: ${dmg}\n`)
