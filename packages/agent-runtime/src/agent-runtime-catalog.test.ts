import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it, vi } from "vitest"

import { AgentRuntime, makeAgentRuntime, toEventEnvelope } from "./index.js"
import {
  AgentRuntimeError,
  type AgentProvider,
  type AgentSessionHandle,
  type HarnessDefinition,
  type RuntimeEmit
} from "./types.js"

const embedded: HarnessDefinition = {
  id: "embedded",
  name: "Embedded",
  provider: "codex",
  symbolName: "terminal",
  detectBinaries: ["missing"],
  fallbackPaths: ["~/embedded"],
  installHint: "install embedded",
  launch: { kind: "npx", packageName: "embedded", args: [] }
}

const handle = (overrides: Partial<AgentSessionHandle> = {}): AgentSessionHandle => ({
  prompt: () => Effect.succeed({ stopReason: "end_turn" }),
  cancel: Effect.succeed({ runtimeState: "reusable" }),
  setMode: () => Effect.void,
  setConfigOption: () => Effect.succeed([]),
  close: Effect.void,
  ...overrides
})

const provider = (overrides: Partial<AgentProvider> = {}): AgentProvider => ({
  id: "codex",
  readiness: () => ({ state: "ready" }),
  createSession: () =>
    Effect.succeed({ metadata: { sessionId: "s", configOptions: [] }, handle: handle() }),
  loadSession: () => Effect.succeed({ sessionId: "s", handle: handle() }),
  ...overrides
})

describe("agent runtime catalog and provider boundaries", () => {
  it("swaps custom definitions without shadowing builtins and reports readiness", async () => {
    const runtime = makeAgentRuntime({
      extraHarnesses: [{ ...embedded, id: "codex" }, embedded],
      providers: { codex: provider() },
      env: { HOME: "/home/first" },
      locateExecutable: (name, env) =>
        name === "~/embedded" && env.HOME === "/home/first" ? "/bin/embedded" : undefined,
      readVersionOutput: async () => "embedded 1.2.3"
    })
    expect(runtime.catalog.filter(({ id }) => id === "codex")).toHaveLength(1)
    await Effect.runPromise(runtime.refreshEnvironment)
    const entry = (await Effect.runPromise(runtime.discoverHarnesses)).find(
      ({ id }) => id === "embedded"
    )
    expect(entry).toMatchObject({
      source: "custom",
      launchKind: "npx",
      installHint: "install embedded",
      readiness: { state: "ready", path: "/bin/embedded", version: "1.2.3" }
    })
    runtime.setExtraHarnesses([{ ...embedded, disabledReason: "disabled" }])
    expect((await Effect.runPromise(runtime.discoverHarnesses)).at(-1)?.readiness).toEqual({
      detail: "disabled",
      state: "unavailable"
    })
    await expect(
      Effect.runPromise(runtime.createAgentSession("embedded", "/tmp", () => undefined))
    ).rejects.toThrow("Embedded is unavailable: disabled")
    runtime.setExtraHarnesses([])
    expect(runtime.catalog.map(({ id }) => id)).toEqual(["claude-code", "codex"])
  })

  it("shares concurrent environment refreshes and passes live environment to factories", async () => {
    let resolveRefresh: ((env: NodeJS.ProcessEnv) => void) | undefined
    const resolveEnv = vi.fn(
      () => new Promise<NodeJS.ProcessEnv>((resolve) => (resolveRefresh = resolve))
    )
    let observed: (() => NodeJS.ProcessEnv) | undefined
    const runtime = makeAgentRuntime({
      env: { PATH: "initial" },
      extraHarnesses: [embedded],
      providerFactories: [
        (environment) => {
          observed = () => environment.env
          return provider({
            readiness: () => ({
              state: environment.executableExists("embedded", environment.env)
                ? "ready"
                : "unavailable"
            })
          })
        }
      ],
      locateExecutable: (_name, env) => (env.PATH === "updated" ? "/bin/embedded" : undefined),
      resolveEnv,
      readVersionOutput: async () => "1.0.0"
    })
    expect(observed?.().PATH).toBe("initial")
    const first = Effect.runPromise(runtime.refreshEnvironment)
    const second = Effect.runPromise(runtime.refreshEnvironment)
    expect(resolveEnv).toHaveBeenCalledOnce()
    resolveRefresh?.({ PATH: "updated" })
    await Promise.all([first, second])
    expect(observed?.().PATH).toBe("updated")
    expect((await Effect.runPromise(runtime.discoverHarnesses)).at(-1)?.readiness).toMatchObject({
      state: "ready",
      path: "/bin/embedded"
    })
    const third = Effect.runPromise(runtime.refreshEnvironment)
    expect(resolveEnv).toHaveBeenCalledTimes(2)
    resolveRefresh?.({ PATH: "updated" })
    await third
  })

  it("exposes optional provider capabilities and rejects unknown harnesses", async () => {
    const option = {
      id: "model",
      name: "Model",
      currentValue: "old",
      options: [{ value: "new", name: "New" }]
    }
    const custom = provider({
      listAgentSessions: async () => [],
      reconcileConfigValue: (_option, value) => `mapped:${value}`,
      probeAuth: () => Effect.succeed({ state: "authenticated", methods: [], canLogout: true }),
      authenticate: () => Effect.void,
      logout: () => Effect.void
    })
    const runtime = makeAgentRuntime({ extraHarnesses: [embedded], providers: { codex: custom } })
    expect(await Effect.runPromise(runtime.listAgentSessions("embedded"))).toEqual([])
    expect(runtime.reconcileConfigValue("embedded", option, "old")).toBe("mapped:old")
    expect(await Effect.runPromise(runtime.probeHarnessAuth("embedded"))).toMatchObject({
      state: "authenticated"
    })
    await Effect.runPromise(runtime.authenticateHarness("embedded", "apiKey"))
    await Effect.runPromise(runtime.logoutHarness("embedded"))
    await expect(Effect.runPromise(runtime.listAgentSessions("unknown"))).rejects.toThrow(
      "Unknown harness"
    )
    expect(runtime.reconcileConfigValue("unknown", option, "old")).toBeUndefined()

    const bare = makeAgentRuntime({ providers: { codex: provider() } })
    expect(await Effect.runPromise(bare.listAgentSessions("codex"))).toEqual([])
    expect(await Effect.runPromise(bare.probeHarnessAuth("codex"))).toEqual({
      state: "notRequired",
      methods: [],
      canLogout: false
    })
    const usage = await Effect.runPromise(bare.readHarnessUsageLimits("codex", "/tmp"))
    expect(usage).toMatchObject({ state: "unavailable", harnessId: "codex", windows: [] })
    await expect(Effect.runPromise(bare.authenticateHarness("codex", "apiKey"))).rejects.toThrow(
      "Authentication is not supported"
    )
    await expect(Effect.runPromise(bare.logoutHarness("codex"))).rejects.toThrow(
      "Logout is not supported"
    )
  })

  it("preserves provider usage and lists sessions for disabled custom definitions", async () => {
    const sessions = [{ sessionId: "native", cwd: "/tmp" }]
    const { installHint: _hint, ...withoutHint } = embedded
    const runtime = makeAgentRuntime({
      extraHarnesses: [{ ...withoutHint, disabledReason: "removed" }],
      providers: {
        codex: provider({
          listAgentSessions: async () => sessions,
          readUsageLimits: () =>
            Effect.succeed({
              state: "available",
              harnessId: "embedded",
              windows: [],
              fetchedAt: "2026-01-01T00:00:00Z"
            })
        })
      },
      locateExecutable: () => "/bin/embedded",
      readVersionOutput: async () => "embedded 1.0.0"
    })
    expect(await Effect.runPromise(runtime.listAgentSessions("embedded"))).toEqual(sessions)
    runtime.setExtraHarnesses([withoutHint])
    expect(
      await Effect.runPromise(runtime.readHarnessUsageLimits("embedded", "/tmp"))
    ).toMatchObject({
      state: "available"
    })
    expect((await Effect.runPromise(runtime.discoverHarnesses)).at(-1)).toMatchObject({
      readiness: { state: "ready", path: "/bin/embedded" }
    })
  })

  it("inspects selectable configuration in model-first order and closes temporary handles", async () => {
    const calls: Array<string> = []
    const closed = vi.fn()
    const configOptions = [
      { id: "model", name: "Model", currentValue: "old", options: [{ value: "new", name: "New" }] },
      {
        id: "mode",
        name: "Mode",
        currentValue: "a",
        options: [{ group: "modes", name: "Modes", options: [{ value: "b", name: "B" }] }]
      }
    ]
    const custom = provider({
      createSession: (_definition, _cwd, _emit, _account, _gateway, options) => {
        expect(options?.modelListTimeoutMs).toBe(3_000)
        return Effect.succeed({
          metadata: { sessionId: "inspection", configOptions },
          handle: handle({
            setConfigOption: (id, value) => {
              calls.push(`${id}:${value}`)
              return Effect.succeed(
                configOptions.map((option) =>
                  option.id === id ? { ...option, currentValue: value } : option
                )
              )
            },
            close: Effect.sync(closed)
          })
        })
      }
    })
    const runtime = makeAgentRuntime({
      providers: { codex: custom },
      harnessInspectionTimeoutMs: 1_000
    })
    const inspected = await Effect.runPromise(
      runtime.inspectHarness("codex", "/tmp", undefined, {
        mode: "b",
        model: "new",
        missing: "x",
        ignored: "x"
      })
    )
    expect(calls).toEqual(["model:new", "mode:b"])
    expect(inspected.configOptions.find(({ id }) => id === "mode")?.currentValue).toBe("b")
    expect(closed).toHaveBeenCalledOnce()
  })

  it("reports inspection option failures without claiming they were applied", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const options = [
        {
          id: "model",
          name: "Model",
          currentValue: "old",
          options: [{ value: "new", name: "New" }]
        }
      ]
      const runtime = makeAgentRuntime({
        providers: {
          codex: provider({
            createSession: () =>
              Effect.succeed({
                metadata: { sessionId: "inspection", configOptions: options },
                handle: handle({
                  setConfigOption: () =>
                    Effect.fail(
                      new AgentRuntimeError({
                        operation: "setConfigOption",
                        message: "rejected"
                      })
                    ),
                  close: Effect.sync(() => {
                    throw new Error("inspection close failed")
                  })
                })
              })
          })
        }
      })
      expect(
        (
          await Effect.runPromise(
            runtime.inspectHarness("codex", "/tmp", undefined, {
              model: "new"
            })
          )
        ).configOptions
      ).toEqual(options)
      expect(log).toHaveBeenCalledWith(expect.stringContaining("could not apply model=new"))
    } finally {
      log.mockRestore()
    }
  })

  it("propagates provider inspection failures and tolerates replacement close failures", async () => {
    const failed = makeAgentRuntime({
      providers: {
        codex: provider({
          createSession: () =>
            Effect.fail(new AgentRuntimeError({ operation: "create", message: "startup failed" }))
        })
      }
    })
    await expect(Effect.runPromise(failed.inspectHarness("codex", "/tmp"))).rejects.toThrow(
      "startup failed"
    )

    const runtime = makeAgentRuntime({
      providers: {
        codex: provider({
          createSession: () =>
            Effect.succeed({
              metadata: { sessionId: "s", configOptions: [] },
              handle: handle({
                close: Effect.sync(() => {
                  throw new Error("retired close failed")
                })
              })
            })
        })
      }
    })
    await Effect.runPromise(runtime.createAgentSession("codex", "/tmp", () => undefined))
    expect(
      await Effect.runPromise(runtime.loadAgentSession("codex", "s", "/different", () => undefined))
    ).toEqual({ configOptions: [], sessionId: "s" })
  })

  it("times out an unresponsive inspection using a controlled clock", async () => {
    const runtime = makeAgentRuntime({
      providers: { codex: provider({ createSession: () => Effect.never }) }
    })
    const inspection = Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(runtime.inspectHarness("codex", "/tmp"))
      yield* TestClock.adjust("15 seconds")
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer()))
    await expect(Effect.runPromise(inspection)).rejects.toThrow(
      "Harness inspection timed out after 15000ms"
    )
  })

  it("uses default inspection selections and preserves a replacement during pending output", async () => {
    let runtime: ReturnType<typeof makeAgentRuntime>
    let emit: RuntimeEmit | undefined
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sinkStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const custom = provider({
      createSession: (_definition, _cwd, eventEmitter) => {
        emit = eventEmitter
        return Effect.succeed({ metadata: { sessionId: "s", configOptions: [] }, handle: handle() })
      },
      loadSession: () => Effect.succeed({ sessionId: "s", handle: handle() })
    })
    runtime = makeAgentRuntime({ providers: { codex: custom } })
    expect(
      (await Effect.runPromise(runtime.inspectHarness("codex", "/tmp"))).configOptions
    ).toEqual([])
    await Effect.runPromise(
      runtime.createAgentSession("codex", "/tmp", async () => {
        started?.()
        await gate
        await Effect.runPromise(runtime.createAgentSession("codex", "/tmp", () => undefined))
      })
    )
    const output = emit?.({ kind: "session.output", subjectId: "s", payload: "queued" })
    await sinkStarted
    const loading = Effect.runPromise(
      runtime.loadAgentSession("codex", "s", "/different", () => undefined)
    )
    release?.()
    await output
    await loading
    expect(runtime.loadedAgentSessionIds()).toEqual(["s"])
  })

  it("provides an Effect layer and envelopes runtime events", async () => {
    const runtime = await Effect.runPromise(AgentRuntime.pipe(Effect.provide(AgentRuntime.layer())))
    expect(runtime.catalog.map(({ id }) => id)).toEqual(["claude-code", "codex"])
    expect(
      toEventEnvelope("server", 7, { kind: "session.output", subjectId: "s", payload: "hello" })
    ).toMatchObject({
      serverId: "server",
      id: 7,
      kind: "session.output",
      subjectId: "s",
      payload: "hello"
    })
  })
})

describe("agent runtime managed sessions", () => {
  it("routes output in order, updates metadata, and rebonds a live session sink", async () => {
    let emit: RuntimeEmit | undefined
    const received: Array<string> = []
    const replacement: Array<string> = []
    const sessionHandle = handle({
      prompt: (input) =>
        Effect.promise(async () => {
          await emit?.({ kind: "session.output", subjectId: "s", payload: input })
          return { stopReason: "end_turn" }
        }),
      setMode: vi.fn(() => Effect.void),
      setConfigOption: vi.fn(() => Effect.succeed([]))
    })
    const runtime = makeAgentRuntime({
      providers: {
        codex: provider({
          createSession: (_definition, _cwd, emitter) => {
            emit = emitter
            return Effect.succeed({
              metadata: {
                sessionId: "s",
                configOptions: [],
                modes: { currentModeId: "ask", availableModes: [{ id: "ask", name: "Ask" }] }
              },
              handle: sessionHandle
            })
          }
        })
      }
    })
    const account = { id: "account", profileKind: "managed" as const }
    expect(
      await Effect.runPromise(
        runtime.createAgentSession(
          "codex",
          "/tmp",
          (event) => {
            received.push(String(event.payload))
          },
          account
        )
      )
    ).toBe("s")
    expect(await Effect.runPromise(runtime.prompt("s", "hello"))).toEqual({
      stopReason: "end_turn"
    })
    expect(received).toEqual(["hello"])
    await emit?.({
      kind: "session.updated",
      subjectId: "s",
      payload: {
        modeId: "autoEdit",
        configOptions: [{ id: "model", name: "Model", currentValue: "a", options: [] }]
      }
    })
    await emit?.({
      kind: "session.output",
      subjectId: "s",
      payload: {
        sessionUpdate: "current_mode_update",
        currentModeId: "fullAccess"
      }
    })
    expect(
      (
        await Effect.runPromise(
          runtime.loadAgentSession(
            "codex",
            "s",
            "/tmp",
            (event) => {
              replacement.push(event.kind)
            },
            account
          )
        )
      ).modes?.currentModeId
    ).toBe("fullAccess")
    expect(replacement).toEqual([])
    await emit?.({ kind: "session.output", subjectId: "s", payload: "after reconnect" })
    expect(replacement).toEqual(["session.output"])
    expect(runtime.loadedAgentSessionIds()).toEqual(["s"])
    await Effect.runPromise(runtime.setMode("s", "ask"))
    await Effect.runPromise(runtime.setConfigOption("s", "model", "a"))
    expect(sessionHandle.setMode).toHaveBeenCalledWith("ask")
    expect(sessionHandle.setConfigOption).toHaveBeenCalledWith("model", "a")
  })
})
