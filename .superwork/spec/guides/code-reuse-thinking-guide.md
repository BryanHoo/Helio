# Code Reuse

- Search `packages/*/src` and `packages/swift/*/Sources` before adding a helper to an app.
- Keep server-only behavior in `apps/server/src` or its owning package; move shared contracts into `packages/api` or the existing Swift module.
- Check Turbo dependencies in `turbo.json` before adding a workspace dependency.
