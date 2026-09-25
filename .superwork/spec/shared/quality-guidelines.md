# Shared Quality

- Test a contract change in its owning package and at least one affected consumer.
- Run `bun run boundaries` and `bun run typecheck` for workspace dependency or TypeScript API changes.
- Run `bun run swift:test` for shared Swift behavior; use `bun run swift:build:ios` when an iOS-facing API changes.
- For screen sharing and VNC, follow `.agents/skills/vnc-change/SKILL.md` and its validation requirements.
- The embedded macOS runtime restores only the local machine. Keep project, session, workspace, and local config replicas durable; never reintroduce cloud registration or a periodic fleet sweep as a prerequisite for local startup.
