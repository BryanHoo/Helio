import { describe, expect, it } from "vitest"

import { CodeExecutionToolError, makeCodeExecutor, type CodeToolInvoker } from "./code-executor.js"

const unavailableTool: CodeToolInvoker = {
  invoke: async ({ path }) => {
    throw new Error(`Unexpected tool call: ${path}`)
  }
}

describe.sequential("Codevisor code executor", () => {
  it("executes TypeScript, lazy tool calls, logs, and emitted content", async () => {
    const calls: Array<{ readonly path: string; readonly args: unknown }> = []
    const result = await makeCodeExecutor().execute(
      `async (): Promise<number> => {
        const response = await tools.codevisor.search({ query: "session" });
        console.log("matches", response.count);
        emit({ type: "text", text: "visible output" });
        return response.count + 1;
      }`,
      {
        invoke: async (call) => {
          calls.push(call)
          return { count: 2 }
        }
      }
    )

    expect(result).toMatchObject({
      result: 3,
      logs: ["[log] matches 2"],
      output: [{ type: "content", content: { type: "text", text: "visible output" } }]
    })
    expect(calls).toEqual([{ path: "codevisor.search", args: { query: "session" } }])
  })

  it("does not charge time waiting for a host tool against the active execution budget", async () => {
    let now = 0
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const execution = makeCodeExecutor({ activeTimeoutMs: 1000, now: () => now }).execute(
      `async () => (await tools.codevisor.choose({})).answer`,
      {
        invoke: async () => {
          entered.resolve()
          await release.promise
          return { answer: "chrome" }
        }
      }
    )
    await entered.promise
    now += 60_000
    release.resolve()
    const result = await execution

    expect(result).toMatchObject({ result: "chrome" })
    expect(result.error).toBeUndefined()
  })

  it("still interrupts code that exhausts its active execution budget", async () => {
    let now = 0
    const result = await makeCodeExecutor({ activeTimeoutMs: 100, now: () => now++ }).execute(
      `async () => { while (true) {} }`,
      unavailableTool
    )

    expect(result.error).toBe("QuickJS active execution timed out after 100ms")
  })

  it("lets sandbox code catch intentional tool errors without leaking defects", async () => {
    const visible = await makeCodeExecutor().execute(
      `async () => tools.codevisor.click({}).catch(error => error.message)`,
      {
        invoke: async () => {
          throw new CodeExecutionToolError("The click target is unavailable")
        }
      }
    )
    const hidden = await makeCodeExecutor().execute(
      `async () => tools.codevisor.click({}).catch(error => error.message)`,
      {
        invoke: async () => {
          throw new Error("secret internal detail")
        }
      }
    )

    expect(visible.result).toBe("The click target is unavailable")
    expect(hidden.result).toBe("Internal tool error")
  })

  it("cancels a suspended execution without waiting for its host tool", async () => {
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>()
    const execution = makeCodeExecutor().execute(
      `async () => tools.codevisor.choose({})`,
      {
        invoke: () => {
          entered.resolve()
          return new Promise(() => undefined)
        }
      },
      { signal: controller.signal }
    )
    await entered.promise
    controller.abort()

    await expect(execution).resolves.toMatchObject({
      error: "QuickJS execution was cancelled"
    })
  })

  it("does not expose Node or network globals", async () => {
    const result = await makeCodeExecutor().execute(
      `async () => ({
        process: typeof process,
        require: typeof require,
        fetch: (() => { try { fetch("https://example.com"); } catch (error) { return error.message; } })()
      })`,
      unavailableTool
    )

    expect(result.result).toEqual({
      process: "undefined",
      require: "undefined",
      fetch: "fetch is disabled in Codevisor code execution"
    })
  })
})
