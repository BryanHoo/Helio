# Backend Placement

- Keep transport entry points in `apps/server/src` or `apps/cloud/src`, and reusable runtime logic in its owning `packages/*/src` workspace.
- 服务仅注册 `adapter-claude` 和 `adapter-codex`；`packages/agent-runtime` 保留通用会话生命周期，内置目录仅包含 `claude-code`、`codex`。不要恢复 ACP、自定义 harness 路由或旧适配器包。
- Database schema and migrations belong to `packages/db` or `apps/cloud/drizzle`, according to the store they change.
- Keep root automation in `scripts`; inspect existing scripts before adding another command.
