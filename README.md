# Helio

Helio is a native macOS workspace for local coding agents. The Mac app runs with a local server; no cloud account, website, mobile app, or browser extension is required.

## Development

Requires macOS, Xcode, and Bun 1.4.2.

```sh
bun run dev:macos
```

The development server listens on `127.0.0.1` and keeps its data under `tmp/` in this checkout. To compile without launching the app:

```sh
bun run build:macos
```

To build a signed, self-contained Release DMG for the current Mac architecture:

```sh
bun run package:macos
```

The DMG is written to `tmp/build/release/`. This requires a Developer ID Application signing identity; local packaging does not notarize the DMG.

Internal package names, CLI commands, and existing on-disk data paths still use `codevisor`.

## License

This project is released under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
