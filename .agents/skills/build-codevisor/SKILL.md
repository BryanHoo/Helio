---
name: build-codevisor
description: Build the Helio macOS app locally without launching it. Use when asked to compile or verify the Mac app.
---

# Build Helio

Run from the worktree root:

```sh
bun run build:macos
```

The command installs locked dependencies automatically and keeps Xcode output under `tmp/build/`. Do not invoke `xcodebuild` directly.

The macOS command fetches the pinned GhosttyKit artifact into `~/.codevisor-development/artifacts/ghostty/` and the pinned Chromium/CEF SDK plus its wrapper library into `~/.codevisor-development/artifacts/chromium/`, then links both into the worktree. These roots are shared by every worktree on the same pinned version; a lock file serializes concurrent first-time provisioning. Only when intentionally rebuilding GhosttyKit itself, run:

```sh
bun run ghostty:build
```
