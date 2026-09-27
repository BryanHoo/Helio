import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises"
import { join } from "node:path"

const exists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const bundledHarnessPackage = (name) =>
  name === "claude-code" || name === "codex" || name.startsWith("claude-agent-sdk-")

export async function removeBundledHarnessBinaries(runtimeRoot) {
  const nodeModules = [join(runtimeRoot, "node_modules")]
  for (const parent of ["apps", "packages"]) {
    const directory = join(runtimeRoot, parent)
    if (!(await exists(directory))) continue
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) nodeModules.push(join(directory, entry.name, "node_modules"))
    }
  }

  const store = join(runtimeRoot, "node_modules/.bun")
  if (await exists(store)) {
    nodeModules.push(join(store, "node_modules"))
    for (const entry of await readdir(store, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const match = entry.name.match(/^@(anthropic-ai|openai)\+([^@]+)@/)
      if (match === null || !bundledHarnessPackage(match[2])) continue
      // 删除平台原生包本体，避免发布包保留 SDK 自带的 Claude 可执行文件。
      await rm(join(store, entry.name), { recursive: true, force: true })
    }
    for (const entry of await readdir(store, { withFileTypes: true })) {
      if (entry.isDirectory()) nodeModules.push(join(store, entry.name, "node_modules"))
    }
  }

  for (const directory of nodeModules) {
    for (const scope of ["@anthropic-ai", "@openai"]) {
      const scoped = join(directory, scope)
      if (!(await exists(scoped))) continue
      for (const entry of await readdir(scoped, { withFileTypes: true })) {
        if (bundledHarnessPackage(entry.name)) {
          await rm(join(scoped, entry.name), { recursive: true, force: true })
        }
      }
    }
  }
}

export async function stageReleaseRuntime({
  repoRoot,
  runtimeRoot,
  nodeExecutable,
  version,
  buildNumber,
  sourceRevision
}) {
  await mkdir(runtimeRoot, { recursive: true })
  await Promise.all(
    ["package.json", "bun.lock"].map((name) =>
      copyFile(join(repoRoot, name), join(runtimeRoot, name))
    )
  )

  // 保留 workspace 布局，使 Bun 安装的包链接和 Node 的模块解析都留在应用包内。
  await Promise.all(
    ["apps", "packages"].map(async (parent) => {
      const sourceParent = join(repoRoot, parent)
      if (!(await exists(sourceParent))) return
      const entries = await readdir(sourceParent, { withFileTypes: true })
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const source = join(sourceParent, entry.name)
            if (!(await exists(join(source, "package.json")))) return
            const destination = join(runtimeRoot, parent, entry.name)
            await mkdir(destination, { recursive: true })
            await copyFile(join(source, "package.json"), join(destination, "package.json"))
            await Promise.all(
              ["dist", "resources"].map(async (name) => {
                if (!(await exists(join(source, name)))) return
                await cp(join(source, name), join(destination, name), {
                  recursive: true,
                  verbatimSymlinks: true
                })
              })
            )
          })
      )
    })
  )

  await mkdir(join(runtimeRoot, "bin"), { recursive: true })
  await copyFile(nodeExecutable, join(runtimeRoot, "bin/node"))
  await chmod(join(runtimeRoot, "bin/node"), (await stat(nodeExecutable)).mode)
  await symlink("apps/server/dist/main.js", join(runtimeRoot, "main.js"))

  // Swift 检查运行时根目录，Node 则从入口所在的 dist 读取同一份版本信息。
  const metadata = `${JSON.stringify({ buildNumber, sourceRevision })}\n`
  await Promise.all(
    [runtimeRoot, join(runtimeRoot, "apps/server/dist")].flatMap((directory) => [
      writeFile(join(directory, "VERSION"), `${version}\n`),
      writeFile(join(directory, "BUILD.json"), metadata)
    ])
  )
}
