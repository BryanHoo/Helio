import CodevisorCore
import CodevisorUI
import SwiftUI

extension SidebarView {
  /// Applies a live reorder while a header is dragged. Each call persists
  /// optimistically; the sync model coalesces the server writes.
  func moveWorkspace(_ sourceID: UUID, toIndex index: Int) {
    guard let section = section(containing: sourceID) else { return }
    let groupIDs = section.workspaces.map(\.id)
    let reordered = ListReorder.moving(sourceID, to: index, in: groupIDs)
    guard reordered != groupIDs,
      let workspace = environment.workspaces.workspace(id: sourceID)
    else { return }
    var replacement = reordered.makeIterator()
    let visibleIDs = workspaceItems.map(\.workspace.id).map { id in
      groupIDs.contains(id) ? (replacement.next() ?? id) : id
    }
    withAnimation(Motion.listReflow(reduceMotion: reduceMotion)) {
      environment.workspaceSync.reorderWorkspace(
        id: sourceID, visibleIDs: visibleIDs,
        client: environment.machines.client(for: workspace.serverId)
      )
    }
  }
}
