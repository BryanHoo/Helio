import { afterEach, expect, it, vi } from "vitest"

import { fleet } from "../infra/shared-accounts-test-support.js"
import { jsonRequest, makeServices, run, runningServers, startWithApp } from "../test-support.js"
afterEach(() => vi.useRealTimers())

it("manages shared accounts through authenticated HTTP without exposing credential material", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(100_000)
  const f = fleet(),
    m = await f.machine("a")
  const server = await startWithApp(m.services)
  runningServers.push(server)
  const send = (body: unknown, harness = "codex") =>
    jsonRequest(server, `/v1/harnesses/${harness}/shared-accounts`, {
      method: "POST",
      body: JSON.stringify(body)
    })
  expect((await send({ action: "list" })).body).toEqual({ accounts: [] })
  const created = await send({ action: "create", label: "Work" })
  expect(created.status).toBe(201)
  const accountId = (created.body as { account: { id: string } }).account.id
  const login = await send({
    action: "login",
    accountId,
    methodId: "apiKey",
    apiKey: "only-in-request"
  })
  expect(login.status).toBe(200)
  const list = await send({ action: "list" })
  expect(JSON.stringify(list.body)).not.toContain("only-in-request")
  const id = (list.body as { accounts: Array<{ id: string; label: string }> }).accounts[0]!.id
  expect((list.body as { accounts: Array<{ label: string }> }).accounts[0]?.label).toBe("Work")
  for (const action of ["probe", "activate", "inherit"])
    expect((await send({ action, accountId: id })).status).toBe(200)
  expect((await send({ action: "rename", accountId: id, label: "Personal" })).status).toBe(200)
  expect((await send({ action: "rename", accountId: id, label: " " })).status).toBe(400)
  expect((await send({ action: "probe", accountId: id }, "claude-code")).status).toBe(404)
  expect((await send({ action: "probe" })).status).toBe(404)
  expect((await send({ action: "list" }, "pi")).status).toBe(404)
  expect((await send({ action: "list" }, "gemini")).status).toBe(404)
  expect((await send({ action: "login", accountId: id })).status).toBe(201)
  expect(m.auth.beginLogin).toHaveBeenCalledWith(id, undefined, undefined)
  expect((await send({ action: "answer", accountId: id })).status).toBe(400)
  expect((await send({ action: "answer", accountId: id, flowId: "flow" })).status).toBe(400)
  expect(
    (await send({ action: "answer", accountId: id, flowId: "flow", code: "answer" })).status
  ).toBe(200)
  expect(m.auth.answerLogin).toHaveBeenCalledWith("flow", "answer")
  expect((await send({ action: "cancel", accountId: id })).status).toBe(400)
  expect((await send({ action: "cancel", accountId: id, flowId: "flow" })).status).toBe(200)
  expect(m.auth.cancelLogin).toHaveBeenCalledWith("flow")
  expect((await send({ action: "logout", accountId: id })).status).toBe(200)
  expect((await send({ action: "list" })).body).toEqual({ accounts: [] })
  const second = await m.shared.create("codex")
  expect((await send({ action: "remove", accountId: second.id })).status).toBe(200)
  await run(
    m.db.saveHarnessAccount({
      id: "legacy",
      harnessId: "codex",
      label: "Legacy",
      profileKind: "default",
      authState: "unauthenticated",
      canLogin: true,
      canLogout: false
    })
  )
  expect((await send({ action: "activate", accountId: "legacy" })).status).toBe(404)
  expect((await send({ action: "login", accountId: "legacy", methodId: "apiKey" })).status).toBe(
    500
  )
  expect((await jsonRequest(server, "/v1/harnesses/codex/shared-accounts")).status).toBe(404)
})
it("requires both the shared service and authentication support", async () => {
  const { services } = await makeServices()
  const server = await startWithApp(services)
  runningServers.push(server)
  expect(
    (
      await jsonRequest(server, "/v1/harnesses/codex/shared-accounts", {
        method: "POST",
        body: JSON.stringify({ action: "list" })
      })
    ).status
  ).toBe(501)
})

it("reconciles received credentials and protects the loopback gateway at the real server router", async () => {
  const f = fleet(),
    a = await f.machine("source"),
    b = await f.machine("target")
  const placeholder = await a.shared.create("claude-code", "Shared")
  await a.shared.saveApiKey(placeholder.id, "fixture-key")
  const server = await startWithApp(b.services)
  runningServers.push(server)
  expect((await jsonRequest(server, "/harness/claude/v1/models")).status).toBe(401)
  expect(
    (await jsonRequest(server, "/harness/provider-token", { method: "POST", body: "{}" })).status
  ).toBe(404)
  const merged = await jsonRequest(server, "/v1/sync/harness-shared-accounts", {
    method: "PUT",
    body: JSON.stringify({ entries: await a.shared.store.entries() })
  })
  expect(merged.status).toBe(200)
  expect(await b.shared.accounts("claude-code", true)).toHaveLength(1)
  expect(
    (await jsonRequest(server, "/v1/sync/credentials/reconcile", { method: "POST", body: "{}" }))
      .status
  ).toBe(200)
  const { services } = await makeServices()
  const old = await startWithApp(services)
  runningServers.push(old)
  expect((await jsonRequest(old, "/harness/claude/v1/models")).status).toBe(501)
  expect(
    (await jsonRequest(old, "/harness/provider-token", { method: "POST", body: "{}" })).status
  ).toBe(404)
})
