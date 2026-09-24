---
name: run-dev
description: Start the Helio local server and macOS app for development testing. Use when asked to run or launch the Mac development app.
---

# Run Helio

From the worktree root, use:

```sh
bun run dev
bun run dev:macos
```

Both commands run the same Mac-only workflow. The runner installs locked dependencies, resolves the shared GhosttyKit and Chromium/CEF artifacts under `~/.codevisor-development/artifacts/`, and keeps build/runtime state under this worktree's ignored `tmp/`. The local server binds `127.0.0.1`. Do not launch the server separately.

Keep at most one dev runner active per worktree. Track the task you start and stop it before restarting; never stop another worktree's instance. When the task is only a build, use [build-codevisor](../build-codevisor/SKILL.md) instead.

For a permission-grant restart that must preserve the existing signed binary, use `bun run dev:macos --reuse-macos-build`. It verifies the worktree app's identity and signature, skips the native rebuild, and starts the local server and app. Native source edits require a normal launch.
