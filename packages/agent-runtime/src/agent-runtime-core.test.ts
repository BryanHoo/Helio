import { Effect } from "effect"
import { expect, it, vi } from "vitest"

import { makeAgentRuntimeCore } from "./agent-runtime-core.js"
import { makeAgentSessionOperations } from "./agent-runtime-sessions.js"
import type { AgentSessionHandle } from "./types.js"

const handle = (overrides: Partial<AgentSessionHandle> = {}): AgentSessionHandle => ({
  prompt: () => Effect.succeed({ stopReason: "end_turn" }),
  cancel: Effect.succeed({ runtimeState: "reusable" }),
  setMode: () => Effect.void,
  setConfigOption: () => Effect.succeed([]),
  close: Effect.void,
  ...overrides
})

it("serializes operations on the same session and clears only its latest tail", async () => {
  const core = makeAgentRuntimeCore({})
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started: (() => void) | undefined
  const start = new Promise<void>((resolve) => {
    started = resolve
  })
  const order: Array<string> = []
  const first = core.withSessionLifecycle("s", async () => {
    order.push("first")
    started?.()
    await gate
    return 1
  })
  await start
  const second = core.withSessionLifecycle("s", async () => {
    order.push("second")
    return 2
  })
  expect(order).toEqual(["first"])
  release?.()
  expect(await Promise.all([first, second])).toEqual([1, 2])
  expect(order).toEqual(["first", "second"])
})

it("passes background terminal integration to factories and retires replaced handles", async () => {
  const terminals = {} as NonNullable<
    Parameters<typeof makeAgentRuntimeCore>[0]["backgroundTerminals"]
  >
  const factory = vi.fn((_environment, context) => {
    expect(context.backgroundTerminals).toBe(terminals)
    return {
      id: "codex" as const,
      readiness: () => ({ state: "ready" as const }),
      createSession: () => Effect.die("unused"),
      loadSession: () => Effect.die("unused")
    }
  })
  const core = makeAgentRuntimeCore({
    backgroundTerminals: terminals,
    providerFactories: [factory]
  })
  expect(factory).toHaveBeenCalledOnce()
  const closed = vi.fn()
  const first = handle({
    close: Effect.sync(() => {
      closed()
      throw new Error("old handle failed")
    })
  })
  const event = core.createSessionEmitter()
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    first,
    event.eventSource,
    () => undefined
  )
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    first,
    event.eventSource,
    () => undefined
  )
  expect(closed).not.toHaveBeenCalled()
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    handle(),
    event.eventSource,
    () => undefined
  )
  expect(closed).toHaveBeenCalledOnce()
})

it("keeps metadata and event delivery isolated by producer and payload", async () => {
  const core = makeAgentRuntimeCore({})
  const first = core.createSessionEmitter()
  const second = core.createSessionEmitter()
  const received: Array<unknown> = []
  const metadata = { sessionId: "s", configOptions: [] }
  core.manageSession("codex", metadata, "/tmp", handle(), first.eventSource, (event) => {
    received.push(event.payload)
  })
  await second.emit({ kind: "session.output", subjectId: "s", payload: "wrong producer" })
  await first.emit({ kind: "session.output", subjectId: "other", payload: "unknown" })
  await first.emit({ kind: "session.updated", subjectId: "s", payload: { modeId: "ask" } })
  await first.emit({ kind: "session.output", subjectId: "s", payload: { sessionUpdate: "other" } })
  await first.emit({ kind: "session.output", subjectId: "s", payload: null })
  expect(received).toEqual([{ modeId: "ask" }, { sessionUpdate: "other" }, null])
})

it("rejects optional controls on handles that do not implement them", async () => {
  const core = makeAgentRuntimeCore({})
  const event = core.createSessionEmitter()
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    handle(),
    event.eventSource,
    () => undefined
  )
  const operations = makeAgentSessionOperations(core)
  await expect(Effect.runPromise(operations.setGoal("s", { objective: "Ship" }))).rejects.toThrow(
    "Goals are not supported"
  )
  await expect(Effect.runPromise(operations.clearGoal("s"))).rejects.toThrow(
    "Goals are not supported"
  )
  await expect(
    Effect.runPromise(operations.answerQuestion("s", "q", { outcome: "cancelled" }))
  ).rejects.toThrow("Questions are not supported")
  expect(await Effect.runPromise(operations.cancel("s"))).toEqual({ runtimeState: "reusable" })
  expect(core.sessions.has("s")).toBe(true)
})

it("propagates close failures while retiring the failed handle", async () => {
  const core = makeAgentRuntimeCore({})
  const operations = makeAgentSessionOperations(core)
  const event = core.createSessionEmitter()
  const failing = handle({
    cancel: Effect.succeed({ runtimeState: "retire" }),
    close: Effect.sync(() => {
      throw new Error("close failed")
    })
  })
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    failing,
    event.eventSource,
    () => undefined
  )
  await expect(Effect.runPromise(operations.cancel("s"))).rejects.toThrow("close failed")
  expect(core.sessions.has("s")).toBe(false)
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    failing,
    event.eventSource,
    () => undefined
  )
  await expect(Effect.runPromise(operations.closeAgentSession("s"))).rejects.toThrow("close failed")
  expect(core.sessions.has("s")).toBe(false)
})

it("does not retire a replacement installed while a handle is closing", async () => {
  const core = makeAgentRuntimeCore({})
  const operations = makeAgentSessionOperations(core)
  const event = core.createSessionEmitter()
  const replacement = handle()
  const installReplacement = () => {
    const current = core.sessions.get("s")!
    core.sessions.set("s", { ...current, handle: replacement })
  }
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    handle({
      cancel: Effect.succeed({ runtimeState: "retire" }),
      close: Effect.sync(installReplacement)
    }),
    event.eventSource,
    () => undefined
  )
  await Effect.runPromise(operations.cancel("s"))
  expect(core.sessions.get("s")?.handle).toBe(replacement)
  core.manageSession(
    "codex",
    { sessionId: "s", configOptions: [] },
    "/tmp",
    handle({
      close: Effect.sync(installReplacement)
    }),
    event.eventSource,
    () => undefined
  )
  await Effect.runPromise(operations.closeAgentSession("s"))
  expect(core.sessions.get("s")?.handle).toBe(replacement)
})
