import { fileURLToPath } from "node:url"

import { runOwnedTask } from "./owned-task.mjs"

runOwnedTask(fileURLToPath(new URL("./dev-owner.mjs", import.meta.url)), [
  "macos",
  ...process.argv.slice(2)
])
