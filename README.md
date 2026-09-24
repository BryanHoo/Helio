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

Internal package names, CLI commands, and existing on-disk data paths still use `codevisor`.

## License

This project is released under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
