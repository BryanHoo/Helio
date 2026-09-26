# Backend

`apps/server/src` owns the local server and CLI; `apps/cloud/src` owns Cloudflare worker endpoints. Supporting runtime, adapters, persistence, and integration packages live under `packages/*/src`.

The local server does not expose `/v1/cloud` registration routes or a cloud device ID in `/v1/info`; `/v1/sync` remains available for local config reconciliation.
The CLI does not provide `auth` cloud commands; `setup` must not request cloud registration.
The local server does not expose `/v1/screen-sharing`, VNC sockets, or WebRTC sharing capabilities; Computer Use remains available through agent tools and the native bridge.
The local server does not expose a hosted plugin registry or catalog-driven update routes. Plugin installs and reinstalls require an explicit local path or Git source; locally installed plugins retain enable/disable and backup restore controls.

Codex 会话通过独立的 `sandbox` 和 `approval` 配置项选择权限；`Plan` 仅切换协作模式，不改变权限。`thread/tokenUsage/updated` 中的 `last.totalTokens` 是当前上下文占用，`total.totalTokens` 是会话累计用量。
新会话继承同一机器上用户最近一次明确选择的权限；历史会话优先恢复自身持久化配置，缺失时采用 Codex `thread/resume` 返回的生效权限。首次无记忆时使用 `thread/start` 返回的生效权限，不硬编码沙盒和审批默认值。

- [Placement](./directory-structure.md)
- [Verification](./quality-guidelines.md)
