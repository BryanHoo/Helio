# Backend Verification

- Run the affected workspace's `test` and `typecheck` scripts first.
- Run `bun run dev:scripts:test` or `bun run release:scripts:test` for matching root scripts.
- Run `bun run check:js` for broad TypeScript integration; use `.agents/skills/vnc-change/SKILL.md` for VNC work.
- Mac app-owned 服务（包括 LaunchAgent）必须绑定 `127.0.0.1`、无需远端 bearer token，并禁用配对凭据、网络发现、直连及云连接；独立 CLI 服务仍可使用其远端模式。修改启动参数时同时验证 Swift 启动配置和真实服务进程的监听地址。
