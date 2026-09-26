import ACPKit
import Foundation
import Testing

@testable import CodevisorCore

@MainActor
@Suite("Codex permission defaults")
struct CodexPermissionDefaultsTests {
  @Test("A new chat uses the latest explicit permissions across workspaces")
  func newChatInheritsLatestPermissions() async {
    let store = InMemoryStore()
    let defaults = ComposerDefaultsStore(store: store)
    let serverId = "machine-a"
    let sourceScope = ComposerDefaultsStore.Scope.workspace(id: UUID(), serverId: serverId)
    let source = controller(
      defaults: defaults,
      scope: sourceScope
    )
    await source.setConfigOption("sandbox", "read-only")
    await source.setConfigOption("approval", "never")

    let next = controller(defaults: defaults, scope: .newWorkspace(serverId: serverId))
    next.seedRememberedConfig()
    #expect(next.configOptions.first(where: { $0.id == "sandbox" })?.currentValue == "read-only")
    #expect(next.configOptions.first(where: { $0.id == "approval" })?.currentValue == "never")

    // 旧工作区快照不能覆盖较新的明确选择。
    let older = controller(
      defaults: defaults,
      scope: .workspace(id: UUID(), serverId: serverId)
    )
    await older.setConfigOption("sandbox", "danger-full-access")
    let newChatInOldWorkspace = controller(defaults: defaults, scope: sourceScope)
    newChatInOldWorkspace.seedRememberedConfig()
    #expect(
      newChatInOldWorkspace.configOptions.first(where: { $0.id == "sandbox" })?.currentValue
        == "danger-full-access"
    )
    #expect(
      defaults.configSelections(forHarness: "codex", onServer: serverId)["sandbox"]
        == "danger-full-access"
    )
    let reopened = ComposerDefaultsStore(store: store)
    #expect(
      reopened.configSelections(forHarness: "codex", onServer: serverId)["sandbox"]
        == "danger-full-access"
    )
    #expect(reopened.configSelections(forHarness: "codex", onServer: serverId)["approval"] == "never")
    #expect(reopened.configSelections(forHarness: "codex", onServer: "machine-b").isEmpty)
  }

  private func controller(
    defaults: ComposerDefaultsStore,
    scope: ComposerDefaultsStore.Scope
  ) -> SessionController {
    let serverId = scope.serverId
    let controller = SessionController(
      project: Project.fromFolder(URL(fileURLWithPath: "/tmp/codex-permissions"), serverId: serverId),
      configCache: ConfigOptionCache(store: InMemoryStore()),
      composerDefaults: defaults,
      composerDefaultsScope: scope
    )
    controller.selectedHarnessId = "codex"
    controller.configOptionsByHarness["codex"] = [
      SessionConfigOption(
        id: "sandbox",
        name: "Sandbox",
        category: SessionConfigOption.Category.permission,
        currentValue: "workspace-write",
        options: [
          SessionConfigSelectOption(value: "read-only", name: "Read-only"),
          SessionConfigSelectOption(value: "workspace-write", name: "Workspace write"),
          SessionConfigSelectOption(value: "danger-full-access", name: "Full access"),
        ]
      ),
      SessionConfigOption(
        id: "approval",
        name: "Approvals",
        category: SessionConfigOption.Category.permission,
        currentValue: "on-request",
        options: [
          SessionConfigSelectOption(value: "on-request", name: "On request"),
          SessionConfigSelectOption(value: "never", name: "Never"),
        ]
      ),
    ]
    return controller
  }
}
