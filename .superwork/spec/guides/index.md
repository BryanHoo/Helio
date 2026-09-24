# Project Guides

Codevisor uses Bun workspaces and Turbo for TypeScript, plus SwiftPM and Xcode for native clients. Start with the affected package and its tests.

- [Code reuse](./code-reuse-thinking-guide.md)
- [Cross-layer contracts](./cross-layer-thinking-guide.md)
- [Cross-platform changes](./cross-platform-thinking-guide.md)
- [Shared package rules](../shared/index.md)

For TypeScript, use the affected workspace's `test`, `typecheck`, and `build` scripts; the full gate is `bun run check:js`. For Swift, use `bun run swift:format:check`, `bun run swift:lint`, and `bun run swift:test`; macOS transcript and iOS build gates are separate root scripts. For native UX changes, follow `.agents/skills/tophat/SKILL.md`.
