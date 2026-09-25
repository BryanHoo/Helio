import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Command, Flag, Prompt } from "effect/unstable/cli"

import type { CliDeps } from "./support.js"
import { syncCommand } from "./sync.js"

/// CLI wiring split from cli.ts to keep the entry point within size
/// limits: shared flag helpers, the interactive prompt runner, and the
/// `sync` command group. Wiring only — its logic lives in sync.ts.

export const portFlag = Flag.integer("port").pipe(
  Flag.withDescription("Server port (defaults to CODEVISOR_PORT, the systemd unit, or 49361)"),
  Flag.optional
)

export const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional)

/// Interactive prompts, each provided its own platform services so they can
/// run from inside the Promise-based command seam. Ctrl-C exits like a shell
/// interrupt would.
export const runPrompt = async <A>(prompt: Prompt.Prompt<A>): Promise<A> => {
  try {
    return await Effect.runPromise(Prompt.run(prompt).pipe(Effect.provide(NodeServices.layer)))
  } catch {
    console.error("\nCancelled.")
    return process.exit(130)
  }
}

type RunCli = (command: (deps: CliDeps) => Promise<number>) => Effect.Effect<void>

export const makeSyncCommand = (runCli: RunCli) => {
  const status = Command.make("status", { port: portFlag }, ({ port }) =>
    runCli((deps) => syncCommand(deps, { port: Option.getOrUndefined(port) }))
  ).pipe(Command.withDescription("Show whether this machine participates in config sync"))

  const set = (name: "on" | "off", enabled: boolean) =>
    Command.make(name, { port: portFlag }, ({ port }) =>
      runCli((deps) => syncCommand(deps, { port: Option.getOrUndefined(port), enabled }))
    ).pipe(
      Command.withDescription(
        enabled
          ? "Join config sync: skills, MCP servers, and settings follow you here"
          : "Leave config sync: nothing is replicated to or from this machine"
      )
    )

  return Command.make("sync").pipe(
    Command.withDescription("This machine's config sync participation"),
    Command.withSubcommands([status, set("on", true), set("off", false)])
  )
}
