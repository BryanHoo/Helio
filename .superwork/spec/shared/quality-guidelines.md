# Shared Quality

- Test a contract change in its owning package and at least one affected consumer.
- Run `bun run boundaries` and `bun run typecheck` for workspace dependency or TypeScript API changes.
- Run `bun run swift:test` for shared Swift behavior; use `bun run swift:build:ios` when an iOS-facing API changes.
- Workspace panes only restore agent chats, files, and terminals; retired screen-sharing and plugin pane records must be ignored. Computer Use remains an agent tool with native permission checks and a local preview, not a workspace sharing transport.
- The embedded macOS runtime restores only the local machine. Keep project, session, workspace, and local config replicas durable; never reintroduce cloud registration or a periodic fleet sweep as a prerequisite for local startup.
