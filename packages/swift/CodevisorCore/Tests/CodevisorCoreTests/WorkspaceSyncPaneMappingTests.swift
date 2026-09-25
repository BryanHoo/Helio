import Foundation
import Testing
@testable import CodevisorCore

/// The pane<->server-record mapping behind workspace sync: only supported
/// workspace pane kinds are restored from server records.
@MainActor
@Suite("WorkspaceSyncModel pane mapping")
struct WorkspaceSyncPaneMappingTests {
  private let workspaceId = UUID()

  @Test("First-send server acknowledgement retains the mounted chat pane", arguments: [false, true])
  func firstSendKeepsPaneIdentity(promotedDraft: Bool) throws {
    let sessionId = UUID()
    let repository = DefaultWorkspaceRepository(store: InMemoryStore())
    var workspace = repository.ensureWorkspace(
      for: WorkspaceSessionSeed(
        sessionId: sessionId, initialName: "Project", serverId: "local",
        projectId: UUID(), rootDirectory: nil
      ), legacyGroups: nil
    )
    if promotedDraft {
      var group = PaneGroupState()
      let draft = group.addChatPane()
      group.assignChatSession(paneId: draft.id, sessionId: sessionId, name: "Hello")
      workspace.centerTree = .leaf(group)
    }
    let group = try #require(workspace.centerTree.allGroups.first?.state)
    let paneId = try #require(group.selectedPaneId)
    let tabId = workspace.selectedCenterTabId
    let leafId = workspace.centerTree.allGroups.first?.id
    // A new workspace's first chat is created by /open using the session
    // id. An existing draft is promoted with its already-published pane id.
    let record = ServerWorkspacePane(
      id: (promotedDraft ? paneId : sessionId).uuidString.lowercased(),
      workspaceId: workspace.id.uuidString.lowercased(), providerId: "codevisor",
      paneType: "chat", title: "Hello", resourceKind: "session",
      resourceId: sessionId.uuidString.lowercased(), createdAt: "2026-01-01T00:00:00.000Z"
    )

    WorkspaceSyncModel.reconcilePanes(in: &workspace, records: [record], protectedLocalPaneIds: [])

    #expect(workspace.selectedCenterTabId == tabId)
    #expect(workspace.centerTree.allGroups.first?.id == leafId)
    let acknowledged = try #require(workspace.centerTree.allGroups.first?.state)
    #expect(acknowledged.selectedPaneId == paneId)
    #expect(acknowledged.panes.map(\.id) == [paneId])
    #expect(acknowledged.selectedPane?.chatSessionId == sessionId)
    #expect(acknowledged.selectedPane?.name == "Hello")
  }

  @Test("Unknown and retired providers still drop silently")
  func unknownProvidersDrop() {
    func record(providerId: String, paneType: String = "diff") -> ServerWorkspacePane {
      ServerWorkspacePane(
        id: UUID().uuidString,
        workspaceId: workspaceId.uuidString,
        providerId: providerId,
        paneType: paneType,
        title: "Pane",
        createdAt: "2026-01-01T00:00:00.000Z"
      )
    }
    #expect(WorkspaceSyncModel.descriptor(from: record(providerId: "somebody-else")) == nil)
    #expect(WorkspaceSyncModel.descriptor(from: record(providerId: "plugin:example")) == nil)
    #expect(WorkspaceSyncModel.descriptor(from: record(providerId: "plugin:")) == nil)
    // Unknown codevisor pane types remain forward-compatible drops.
    #expect(
      WorkspaceSyncModel.descriptor(
        from: record(providerId: "codevisor", paneType: "hologram")
      ) == nil
    )
  }

  @Test("Native codevisor panes keep their existing mapping; New Tab rows are ignored")
  func codevisorPanesStillMap() {
    let id = UUID()
    func record(paneType: String, title: String) -> ServerWorkspacePane {
      ServerWorkspacePane(
        id: id.uuidString,
        workspaceId: workspaceId.uuidString,
        providerId: "codevisor",
        paneType: paneType,
        title: title,
        createdAt: "2026-01-01T00:00:00.000Z"
      )
    }
    #expect(WorkspaceSyncModel.descriptor(from: record(paneType: "browser", title: "Browser")) == nil)
    // 旧版本共享 pane 不再进入工作台。
    #expect(WorkspaceSyncModel.descriptor(from: record(paneType: "screen-sharing", title: "Screen Sharing")) == nil)
    let pluginPane = ServerWorkspacePane(
      id: id.uuidString, workspaceId: workspaceId.uuidString,
      providerId: "plugin:example", paneType: "panel", title: "Panel",
      createdAt: "2026-01-01T00:00:00.000Z"
    )
    #expect(WorkspaceSyncModel.descriptor(from: pluginPane) == nil)
    // The New Tab page is device-local. A row from a client that still
    // publishes it means nothing here.
    #expect(WorkspaceSyncModel.descriptor(from: record(paneType: "new-tab", title: "New tab")) == nil)
  }
}
