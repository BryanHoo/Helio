import type { IncomingMessage, ServerResponse } from "node:http"

import {
  AnswerHarnessAuthRequest as AnswerHarnessAuthRequestSchema,
  CreateHarnessAccountRequest as CreateHarnessAccountRequestSchema,
  StartHarnessLoginRequest as StartHarnessLoginRequestSchema,
  UpdateHarnessAccountRequest as UpdateHarnessAccountRequestSchema
} from "@codevisor/api"

import {
  HttpFailure,
  matchRoute,
  matchRouteParams,
  readSchema,
  writeJson
} from "../server-context.js"
import type { CodevisorServerServices } from "../server-context.js"
import { discoverHarnesses } from "./harnesses.js"
import { routeSharedHarnessAccounts } from "./shared-harness-accounts.js"

/// Harness authentication routes: auth refresh and per-harness account management.

export const routeHarnessAuth = async (
  services: CodevisorServerServices,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> => {
  if (await routeSharedHarnessAccounts(services, request, response, url)) return true
  if (request.method === "POST" && url.pathname === "/v1/harnesses/auth/refresh") {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    const harnessId = url.searchParams.get("harnessId")?.trim() || undefined
    await services.auth.refresh(harnessId)
    // Settings consumes this — keep lifecycle fields so a sign-in doesn't
    // wipe the row's update state.
    writeJson(
      response,
      200,
      await discoverHarnesses(services, harnessId === undefined, harnessId, true)
    )
    return true
  }

  const accountLoginAnswer = matchRouteParams(
    url.pathname,
    "/v1/harnesses/:id/accounts/:accountId/login/:flowId/answer"
  )
  if (accountLoginAnswer !== undefined && request.method === "POST") {
    if (services.auth === undefined) {
      throw new HttpFailure(501, "Harness authentication unavailable")
    }
    const payload = await readSchema(request, AnswerHarnessAuthRequestSchema)
    writeJson(
      response,
      200,
      await services.auth.answerLogin(accountLoginAnswer.flowId!, payload.code)
    )
    return true
  }

  const accountLoginCancel = matchRouteParams(
    url.pathname,
    "/v1/harnesses/:id/accounts/:accountId/login/:flowId"
  )
  if (accountLoginCancel !== undefined && request.method === "DELETE") {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    await services.auth.cancelLogin(accountLoginCancel.flowId!)
    writeJson(response, 204, undefined)
    return true
  }

  const accountAction = matchRouteParams(
    url.pathname,
    "/v1/harnesses/:id/accounts/:accountId/:action"
  )
  if (accountAction !== undefined && request.method === "POST") {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    const harnessId = accountAction.id!
    const accountId = accountAction.accountId!
    switch (accountAction.action) {
      case "activate":
        await services.auth.activateAccount(harnessId, accountId)
        writeJson(response, 200, await services.auth.accounts(harnessId))
        return true
      case "login": {
        const payload = await readSchema(request, StartHarnessLoginRequestSchema)
        writeJson(
          response,
          201,
          await services.auth.beginLogin(accountId, payload.methodId, payload.apiKey)
        )
        return true
      }
      case "logout":
        writeJson(response, 200, await services.auth.logout(accountId))
        return true
      default:
        break
    }
  }

  const accountProbe = matchRouteParams(
    url.pathname,
    "/v1/harnesses/:id/accounts/:accountId/auth/probe"
  )
  if (accountProbe !== undefined && request.method === "POST") {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    writeJson(response, 200, await services.auth.probeAccount(accountProbe.accountId!, true))
    return true
  }

  const accountRoute = matchRouteParams(url.pathname, "/v1/harnesses/:id/accounts/:accountId")
  if (accountRoute !== undefined) {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    if (request.method === "PATCH") {
      const payload = await readSchema(request, UpdateHarnessAccountRequestSchema)
      if (payload.label === undefined) throw new HttpFailure(400, "Account label is required")
      writeJson(
        response,
        200,
        await services.auth.renameAccount(accountRoute.accountId!, payload.label)
      )
      return true
    }
    if (request.method === "DELETE") {
      await services.auth.removeAccount(accountRoute.accountId!)
      writeJson(response, 204, undefined)
      return true
    }
  }

  const accountsHarnessId = matchRoute(url.pathname, "/v1/harnesses/:id/accounts")
  if (accountsHarnessId !== undefined) {
    if (services.auth === undefined)
      throw new HttpFailure(501, "Harness authentication unavailable")
    if (request.method === "GET") {
      writeJson(response, 200, await services.auth.accounts(accountsHarnessId))
      return true
    }
    if (request.method === "POST") {
      const payload = await readSchema(request, CreateHarnessAccountRequestSchema)
      writeJson(response, 201, await services.auth.createAccount(accountsHarnessId, payload.label))
      return true
    }
  }

  return false
}
