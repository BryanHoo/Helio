import type { IncomingMessage, ServerResponse } from "node:http"

import { Schema } from "effect"

import { sharedHarness } from "../infra/shared-account-store.js"
import {
  HttpFailure,
  matchRoute,
  readSchema,
  writeJson,
  run,
  type CodevisorServerServices
} from "../server-context.js"

const Action = Schema.Struct({
  action: Schema.Literals([
    "list",
    "create",
    "rename",
    "remove",
    "activate",
    "probe",
    "login",
    "answer",
    "cancel",
    "logout",
    "inherit"
  ]),
  accountId: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  methodId: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
  flowId: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  providerId: Schema.optional(Schema.String),
  inputs: Schema.optional(Schema.Record(Schema.String, Schema.String))
})

export const routeSharedHarnessAccounts = async (
  services: CodevisorServerServices,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> => {
  const harnessId = matchRoute(url.pathname, "/v1/harnesses/:id/shared-accounts")
  if (!harnessId || request.method !== "POST") return false
  const shared = services.sharedAccounts
  const auth = services.auth
  if (!shared || !auth) throw new HttpFailure(501, "Update this machine to sync accounts")
  const input = await readSchema(request, Action)
  response.setHeader("Cache-Control", "no-store")
  if (!sharedHarness(harnessId)) throw new HttpFailure(404, "Unknown harness")
  if (input.action === "list") {
    writeJson(response, 200, { accounts: await shared.accounts(harnessId, true) })
    return true
  }
  if (input.action === "create") {
    writeJson(response, 201, { account: await shared.create(harnessId, input.label) })
    return true
  }
  if (input.action === "inherit") {
    await shared.inherit(harnessId)
    writeJson(response, 200, { accounts: await shared.accounts(harnessId) })
    return true
  }
  const id = input.accountId
  const account = id ? await run(services.db.getHarnessAccount(id)) : undefined
  if (!account || account.harnessId !== harnessId) throw new HttpFailure(404, "Account not found")
  switch (input.action) {
    case "activate":
      if (!(await shared.activate(harnessId, account.id, true)))
        throw new HttpFailure(404, "Shared account not found")
      writeJson(response, 200, { accounts: await shared.accounts(harnessId, true) })
      break
    case "rename":
      if (!input.label?.trim()) throw new HttpFailure(400, "Enter an account name")
      writeJson(response, 200, { account: await shared.rename(account.id, input.label) })
      break
    case "remove":
    case "logout":
      writeJson(response, 200, { account: await shared.logout(account.id, true) })
      break
    case "probe":
      writeJson(response, 200, { account: await shared.probe(account.id, true) })
      break
    case "login":
      if (input.methodId === "apiKey") {
        await shared.saveApiKey(account.id, input.apiKey ?? "")
        writeJson(response, 200, {
          flow: { id: account.id, accountId: account.id, kind: "complete" }
        })
      } else
        writeJson(response, 201, {
          flow: await auth.beginLogin(account.id, input.methodId, input.apiKey)
        })
      break
    case "answer":
      if (!input.flowId || !input.code) throw new HttpFailure(400, "Enter the sign-in code")
      writeJson(response, 200, { flow: await auth.answerLogin(input.flowId, input.code) })
      break
    case "cancel":
      if (!input.flowId) throw new HttpFailure(400, "Sign-in not found")
      await auth.cancelLogin(input.flowId)
      writeJson(response, 200, {})
      break
  }
  return true
}
