# Frontend

`apps/www/src` is the React web app; `apps/cloud/src/pages` serves cloud pages. Native UI lives in `apps/macos/Codevisor`, `apps/ios/Codevisor`, and reusable Swift UI modules under `packages/swift`.

On macOS, `SidebarView` groups `Workspace` tasks under `ProjectGroup` projects. `SessionContainerView` presents each task's `Workspace.centerTabs` in the center column; closing a tab does not archive its workspace. Keep tab selection and keyboard commands scoped to the selected workspace.

Keep project creation in the shared `AddProjectFlow` and task creation in `New chat`. Project rows only disclose tasks; project deletion belongs in Project Settings. Open app settings through the native `SettingsLink`.

- [Placement](./directory-structure.md)
- [Verification](./quality-guidelines.md)
