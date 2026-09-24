import { makeAgentRuntime } from "@codevisor/agent-runtime"
import { Effect } from "effect"
import { expect, it } from "vitest"

import { serverAgentProviders } from "./serve.js"
import { jsonRequest, makeServices, runningServers, startWithApp } from "./test-support.js"

it("registers only Claude and Codex providers", async () => {
  // 固定可执行文件边界，验证服务实际使用的适配器组合。
  const runtime = makeAgentRuntime({
    env: { PATH: "/opt/tools" },
    executableExists: () => true,
    locateExecutable: () => undefined,
    providerFactories: serverAgentProviders
  })

  const discovered = await Effect.runPromise(runtime.discoverHarnesses)
  expect(discovered.map(({ id }) => id).sort()).toEqual(["claude-code", "codex"])
  expect(
    discovered
      .filter(({ source }) => source === "registry")
      .map(({ id }) => id)
      .sort()
  ).toEqual(["claude-code", "codex"])
  expect(
    discovered
      .filter(({ readiness }) => readiness.state === "ready")
      .map(({ id }) => id)
      .sort()
  ).toEqual(["claude-code", "codex"])
})

it("does not expose the retired custom ACP harness API", async () => {
  const { services } = await makeServices("native-harnesses-only")
  const server = await startWithApp(services)
  runningServers.push(server)

  for (const [path, method] of [
    ["/v1/harnesses/custom", "GET"],
    ["/v1/harnesses/custom", "PUT"],
    ["/v1/harnesses/custom/test", "POST"]
  ] as const) {
    const response = await jsonRequest(server, path, { method })
    expect(response.status, `${method} ${path}`).toBe(404)
  }
})
