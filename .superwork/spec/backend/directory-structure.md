# Backend Placement

- Keep transport entry points in `apps/server/src` or `apps/cloud/src`, and reusable runtime logic in its owning `packages/*/src` workspace.
- Database schema and migrations belong to `packages/db` or `apps/cloud/drizzle`, according to the store they change.
- Keep root automation in `scripts`; inspect existing scripts before adding another command.
