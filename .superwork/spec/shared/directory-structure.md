# Shared Directory Structure

- TypeScript workspace code belongs in `packages/<name>/src`; tests follow the owning workspace's layout.
- Swift module sources and tests live under `packages/swift/<Module>/Sources` and `packages/swift/<Module>/Tests` as declared in `packages/swift/Package.swift`.
- Keep platform-only code in `apps/macos/Codevisor` or `apps/ios/Codevisor`.
