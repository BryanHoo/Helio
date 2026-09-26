import CodevisorCore
import Foundation

/// A workspace and the chat that can route into its tabs. The routing chat
/// may be archived when the workspace contains only non-chat content.
struct SidebarWorkspaceListItem: Identifiable {
  let workspace: Workspace
  let routingSession: ChatSession?

  var id: SidebarFleetItemID { .workspace(workspace) }

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
