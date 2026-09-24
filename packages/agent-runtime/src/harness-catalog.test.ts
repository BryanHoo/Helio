import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { harnessCatalog } from "./harness-catalog.js"
import { makeAgentRuntime } from "./index.js"
import { normalizePromptInput, type AgentProvider } from "./types.js"

describe("built-in harness catalog", () => {
  it("exposes only native harnesses while keeping the generic runtime", async () => {
    expect(harnessCatalog.map(({ id }) => id).sort()).toEqual(["claude-code", "codex"])
    expect(harnessCatalog.map(({ provider }) => provider).sort()).toEqual(["claude", "codex"])

    const runtime = makeAgentRuntime({ env: { PATH: "" }, locateExecutable: () => undefined })
    const discovered = await Effect.runPromise(runtime.discoverHarnesses)
    expect(discovered.map(({ id }) => id).sort()).toEqual(["claude-code", "codex"])
    await expect(
      Effect.runPromise(runtime.createAgentSession("cursor", "/tmp", () => undefined))
    ).rejects.toThrow("Unknown harness: cursor")
  })

  it("keeps the generic session lifecycle for injected native providers", async () => {
    const received: Array<string> = []
    const closed: Array<string> = []
    const provider: AgentProvider = {
      id: "codex",
      readiness: () => ({ state: "ready" }),
      createSession: (_definition, _cwd, emit) =>
        Effect.succeed({
          metadata: { sessionId: "embedded-session", configOptions: [] },
          handle: {
            prompt: (input) =>
              Effect.promise(async () => {
                const text = normalizePromptInput(input).text
                received.push(text)
                await emit({ kind: "session.output", subjectId: "embedded-session", payload: text })
                return { stopReason: "end_turn" }
              }),
            cancel: Effect.succeed({ runtimeState: "reusable" as const }),
            setMode: () => Effect.void,
            setConfigOption: () => Effect.succeed([]),
            close: Effect.sync(() => {
              closed.push("embedded-session")
            })
          }
        }),
      loadSession: () => Effect.die("not used")
    }
    const events: Array<unknown> = []
    const runtime = makeAgentRuntime({
      extraHarnesses: [
        {
          id: "embedded",
          name: "Embedded",
          provider: "codex",
          symbolName: "terminal",
          detectBinaries: ["embedded"]
        }
      ],
      providers: { codex: provider }
    })

    expect(
      await Effect.runPromise(
        runtime.createAgentSession("embedded", "/tmp", (event) => {
          events.push(event.payload)
        })
      )
    ).toBe("embedded-session")
    expect(await Effect.runPromise(runtime.prompt("embedded-session", "hello"))).toEqual({
      stopReason: "end_turn"
    })
    expect(received).toEqual(["hello"])
    expect(events).toEqual(["hello"])
    await Effect.runPromise(runtime.closeAgentSession("embedded-session"))
    expect(closed).toEqual(["embedded-session"])
    expect(runtime.loadedAgentSessionIds()).toEqual([])
  })
})
