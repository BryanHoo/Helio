import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { makeAgentRuntime } from "./index.js"
import type { AgentProvider, AgentSessionHandle, RuntimeEmit } from "./types.js"

const handle = (overrides: Partial<AgentSessionHandle> = {}): AgentSessionHandle => ({
  prompt: () => Effect.succeed({ stopReason: "end_turn" }),
  cancel: Effect.succeed({ runtimeState: "reusable" }),
  setMode: () => Effect.void,
  setConfigOption: () => Effect.succeed([]),
  close: Effect.void,
  ...overrides
})

const provider = (overrides: Partial<AgentProvider>): AgentProvider => ({
  id: "codex",
  readiness: () => ({ state: "ready" }),
  createSession: () =>
    Effect.succeed({ metadata: { sessionId: "s", configOptions: [] }, handle: handle() }),
  loadSession: () => Effect.succeed({ sessionId: "s", handle: handle() }),
  ...overrides
})

describe("agent runtime session operations", () => {
  it("replaces a mismatched account, discards retired output, and handles provider fallback metadata", async () => {
    const emitters: Array<RuntimeEmit> = []
    const closes: Array<string> = []
    const received: Array<string> = []
    const runtime = makeAgentRuntime({
      providers: {
        codex: provider({
          loadSession: (_definition, _id, _cwd, emit) => {
            emitters.push(emit)
            return Effect.succeed({
              sessionId: "s",
              handle: handle({
                close: Effect.sync(() => {
                  closes.push(`handle-${emitters.length}`)
                })
              })
            })
          }
        })
      }
    })
    await Effect.runPromise(
      runtime.loadAgentSession("codex", "s", "/tmp", (event) => {
        received.push(`old:${event.payload}`)
      })
    )
    expect(
      await Effect.runPromise(runtime.loadAgentSession("codex", "s", "/tmp", () => undefined))
    ).toEqual({ configOptions: [], sessionId: "s" })
    await Effect.runPromise(
      runtime.loadAgentSession("codex", "s", "/other", (event) => {
        received.push(`new:${event.payload}`)
      })
    )
    await emitters[0]?.({ kind: "session.output", subjectId: "s", payload: "stale" })
    await emitters[1]?.({ kind: "session.output", subjectId: "s", payload: "current" })
    expect(received).toEqual(["new:current"])
    expect(closes).toHaveLength(1)
    await Effect.runPromise(runtime.closeAgentSession("s"))
    await Effect.runPromise(runtime.closeAgentSession("s"))
    expect(runtime.loadedAgentSessionIds()).toEqual([])
  })

  it("passes goals and questions through and reports unsupported operations", async () => {
    const goals = {
      objective: "Ship",
      status: "active" as const,
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }
    const setGoal = vi.fn(() => Effect.succeed(goals))
    const answerQuestion = vi.fn(() => Effect.void)
    const runtime = makeAgentRuntime({
      providers: {
        codex: provider({
          createSession: () =>
            Effect.succeed({
              metadata: { sessionId: "s", configOptions: [] },
              handle: handle({
                setGoal,
                clearGoal: Effect.void,
                answerQuestion
              })
            })
        })
      }
    })
    await Effect.runPromise(runtime.createAgentSession("codex", "/tmp", () => undefined))
    expect(await Effect.runPromise(runtime.setGoal("s", { objective: "Ship" }))).toEqual(goals)
    await Effect.runPromise(runtime.clearGoal("s"))
    await Effect.runPromise(runtime.answerQuestion("s", "q", { outcome: "cancelled" }))
    expect(setGoal).toHaveBeenCalledOnce()
    expect(answerQuestion).toHaveBeenCalledWith("q", { outcome: "cancelled" })
    await expect(Effect.runPromise(runtime.prompt("missing", "hello"))).rejects.toThrow(
      "not loaded"
    )
    await Effect.runPromise(runtime.closeAgentSession("s"))
    await Effect.runPromise(runtime.createAgentSession("codex", "/tmp", () => undefined))
  })

  it("retires handles on forced cancellation and keeps reusable handles loaded", async () => {
    const close = vi.fn()
    const runtime = makeAgentRuntime({
      providers: {
        codex: provider({
          createSession: () =>
            Effect.succeed({
              metadata: { sessionId: "s", configOptions: [] },
              handle: handle({
                cancel: Effect.succeed({ runtimeState: "retire" }),
                close: Effect.sync(close)
              })
            })
        })
      }
    })
    await Effect.runPromise(runtime.createAgentSession("codex", "/tmp", () => undefined))
    expect(await Effect.runPromise(runtime.cancel("s"))).toEqual({ runtimeState: "retire" })
    expect(close).toHaveBeenCalledOnce()
    expect(runtime.loadedAgentSessionIds()).toEqual([])
    await expect(Effect.runPromise(runtime.cancel("s"))).rejects.toThrow("not loaded")
  })
})
