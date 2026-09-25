# Backend

`apps/server/src` owns the local server and CLI; `apps/cloud/src` owns Cloudflare worker endpoints. Supporting runtime, adapters, persistence, and integration packages live under `packages/*/src`.

The local server does not expose `/v1/cloud` registration routes or a cloud device ID in `/v1/info`; `/v1/sync` remains available for local config reconciliation.
The CLI does not provide `auth` cloud commands; `setup` must not request cloud registration.
The local server does not expose `/v1/screen-sharing`, VNC sockets, or WebRTC sharing capabilities; Computer Use remains available through agent tools and the native bridge.

- [Placement](./directory-structure.md)
- [Verification](./quality-guidelines.md)
