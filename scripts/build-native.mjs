import { realpath } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { bootstrapDevelopment } from "./dev-bootstrap.mjs"
import {
  developmentLayout,
  ensureBuildDirectories,
  localDevelopmentEnvironment
} from "./dev-layout.mjs"
import { runXcodebuild } from "./xcodebuild.mjs"

const repoRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)))
const target = process.argv[2]
const forwardedArguments = process.argv.slice(3)
const layout = developmentLayout(repoRoot)
await ensureBuildDirectories(layout)
const environment = localDevelopmentEnvironment(layout)

if (target === "macos") {
  await bootstrapDevelopment(repoRoot, {
    environment,
    ghostty: true,
    architectures: forwardedArguments
      .find((arg) => arg.startsWith("ARCHS="))
      ?.slice(6)
      .split(/\s+/)
  })
  await runXcodebuild(
    repoRoot,
    "macos",
    [
      "-project",
      "apps/macos/Codevisor.xcodeproj",
      "-scheme",
      "Codevisor",
      "-configuration",
      "Debug",
      "CODEVISOR_DEV_PRODUCT_NAME=Helio",
      "CODEVISOR_DEV_DISPLAY_NAME=Helio",
      "CODE_SIGNING_ALLOWED=NO",
      ...forwardedArguments,
      "build"
    ],
    { environment, layout }
  )
  console.log(
    `\nBuilt macOS app: ${join(layout.build.macos.derivedData, "Build/Products/Debug/Helio.app")}`
  )
} else if (target === "pixelbook") {
  // PixelBook, the component gallery, links only Autocomplete, so it needs none of the
  // server/Ghostty bootstrap the product apps do.
  await runXcodebuild(
    repoRoot,
    "pixelbook",
    [
      "-project",
      "apps/pixelbook/PixelBook.xcodeproj",
      "-scheme",
      "PixelBook",
      "-configuration",
      "Debug",
      "CODE_SIGNING_ALLOWED=NO",
      ...forwardedArguments,
      "build"
    ],
    { environment, layout }
  )
  console.log(
    `\nBuilt PixelBook app: ${join(layout.build.pixelbook.derivedData, "Build/Products/Debug/PixelBook.app")}`
  )
} else if (target === "list:macos") {
  await bootstrapDevelopment(repoRoot, { environment })
  await runXcodebuild(
    repoRoot,
    "macos",
    ["-list", "-project", "apps/macos/Codevisor.xcodeproj", ...forwardedArguments],
    { environment, layout }
  )
} else {
  console.error(
    "usage: bun scripts/build-native.mjs <macos|pixelbook|list:macos> [xcodebuild arguments]"
  )
  process.exitCode = 2
}
