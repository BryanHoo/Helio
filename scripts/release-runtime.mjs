import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
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
