import CodevisorCore
import Foundation

/// A workspace and the chat that can route into its tabs. The routing chat
/// may be archived when the workspace contains only non-chat content.
struct SidebarWorkspaceListItem: Identifiable {
  let workspace: Workspace
  let routingSession: ChatSession?
  let sessions: [ChatSession]

  var id: SidebarFleetItemID { .workspace(workspace) }

  var lastActivityAt: Date {
    sessions.map { $0.updatedAt ?? $0.createdAt }.max()
      ?? routingSession.map { $0.updatedAt ?? $0.createdAt }
      ?? workspace.createdAt
  }

  var title: String {
    if workspace.hasCustomName { return workspace.name }
    if let chatTitle = routingSession?.title.trimmingCharacters(in: .whitespacesAndNewlines),
      !chatTitle.isEmpty
    {
      return chatTitle
    }
    return workspace.name
  }
}
