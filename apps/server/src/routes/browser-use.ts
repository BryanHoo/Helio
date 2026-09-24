import type { IncomingMessage, ServerResponse } from "node:http"

import { UpdateBrowserUseConfigurationRequest as UpdateBrowserUseConfigurationRequestSchema } from "@codevisor/api"

import {
  HttpFailure,
  readSchema,
  writeJson,
  type CodevisorServerServices
} from "../server-context.js"

/* v8 ignore start -- browser setup routes are exercised by native app integration tests. */
export const routeBrowserUse = async (
  services: CodevisorServerServices,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> => {
  if (!url.pathname.startsWith("/v1/browser-use")) return false
  const manager = services.mcp
  if (manager === undefined) throw new HttpFailure(501, "Browser Use is unavailable")
  if (url.pathname === "/v1/browser-use" && request.method === "GET") {
    writeJson(response, 200, await manager.browserConfiguration())
    return true
  }
  if (url.pathname === "/v1/browser-use" && request.method === "PATCH") {
    const payload = await readSchema(request, UpdateBrowserUseConfigurationRequestSchema)
    writeJson(
      response,
      200,
      await manager.setBrowserPreference(payload.preferredBrowser ?? undefined)
    )
    return true
  }
  throw new HttpFailure(404, "Browser Use route not found")
}
/* v8 ignore stop */
