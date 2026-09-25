import Foundation

extension WorkspaceSyncModel {
  private struct NativePaneMetadata: Codable {
    var attachOnly: Bool
    var ownerChatSessionId: UUID?
  }

  static func panePublicationKey(serverId: String, paneId: UUID) -> String {
    "workspace-pane-published-v1:\(serverId):\(paneId.uuidString.lowercased())"
  }

  static func serverWorkspace(from workspace: Workspace) -> ServerWorkspace {
    ServerWorkspace(
      id: workspace.id.uuidString,
      serverId: workspace.serverId,
      projectId: workspace.projectId.uuidString,
      name: workspace.name,
      hasCustomName: workspace.hasCustomName,
      rootDirectory: workspace.rootDirectory,
      isArchived: workspace.isArchived,
      createdAt: ServerDateCoding.string(from: workspace.createdAt),
      sidebarPosition: workspace.sidebarPosition,
      sidebarOrderRevision: workspace.sidebarOrderRevision > 0 ? workspace.sidebarOrderRevision : nil
    )
  }

  static func serverPane(
    from pane: PaneDescriptorState,
    workspaceId: UUID,
    createdAt: Date
  ) -> ServerWorkspacePane {
    let paneType: String
    let resourceKind: String?
    let resourceId: String?
    var metadata: String?
    switch pane.kind {
    case .chat:
      paneType = "chat"
      resourceKind = pane.chatSessionId == nil ? nil : "session"
      resourceId = pane.chatSessionId?.uuidString
    case .terminal:
      paneType = "terminal"
      resourceKind = "terminal"
      resourceId = pane.terminalKey
      let value = NativePaneMetadata(
        attachOnly: pane.attachOnly,
        ownerChatSessionId: pane.ownerChatSessionId
      )
      if let data = try? JSONEncoder().encode(value) {
        metadata = String(data: data, encoding: .utf8)
      }
    case .newTab:
      paneType = "new-tab"
      resourceKind = nil
      resourceId = nil
    case .document:
      paneType = "file"
      resourceKind = "file"
      resourceId = pane.documentPath
    }
    return ServerWorkspacePane(
      id: pane.id.uuidString,
      workspaceId: workspaceId.uuidString,
      providerId: "codevisor",
      paneType: paneType,
      title: pane.name,
      resourceKind: resourceKind,
      resourceId: resourceId,
      metadata: metadata,
      createdAt: ServerDateCoding.string(from: createdAt)
    )
  }

  static func descriptor(from record: ServerWorkspacePane) -> PaneDescriptorState? {
    guard let id = UUID(uuidString: record.id) else { return nil }
    // Unknown providers still drop silently: the registry remains
    // forward-compatible; renderer support is a client capability.
    guard record.providerId == "codevisor" else { return nil }
    switch record.paneType {
    case "file", "markdown":
      guard record.resourceKind == "file", let path = record.resourceId, !path.isEmpty else {
        return nil
      }
      return PaneDescriptorState(
        id: id, kind: .document, name: record.title,
        terminalKey: id.uuidString, documentPath: path
      )
    case "chat":
      let sessionId =
        record.resourceKind == "session"
        ? record.resourceId.flatMap(UUID.init(uuidString:))
        : nil
      return PaneDescriptorState(
        id: id,
        kind: .chat,
        name: record.title,
        terminalKey: sessionId?.uuidString ?? id.uuidString,
        chatSessionId: sessionId
      )
    case "terminal":
      let decoded = record.metadata
        .flatMap { $0.data(using: .utf8) }
        .flatMap { try? JSONDecoder().decode(NativePaneMetadata.self, from: $0) }
      return PaneDescriptorState(
        id: id,
        kind: .terminal,
        name: record.title,
        terminalKey: record.resourceId ?? id.uuidString,
        attachOnly: decoded?.attachOnly ?? false,
        ownerChatSessionId: decoded?.ownerChatSessionId
      )
    case "new-tab":
      // A row a client that predates local-only New Tab pages may still
      // publish. The page is device-local now; the registry entry means
      // nothing here.
      return nil
    default:
      // The registry remains forward-compatible; renderer support is a
      // separate client capability and arrives with extension panes.
      return nil
    }
  }
}
