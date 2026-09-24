# Cross-Platform Changes

- Keep shared Swift behavior in `packages/swift`; place platform-specific views and entitlements in `apps/macos` or `apps/ios`.
- Check both Xcode projects when shared Swift APIs or resources change.
- Run repository scripts via `bun run`; use `python3` for Python tools. Native build and simulator verification require macOS/Xcode.
