import CodevisorCore
import CodevisorCoreMac
import CodevisorUI
import ComposableArchitecture
import SwiftUI

extension SessionContainerView {
  @ViewBuilder
  var titledContentColumn: some View {
    if let model = activeFileModel {
      // Keep the window's document title while the toolbar supplies a browse button.
      contentColumn.navigationTitle(model.title)
    } else {
      contentColumn.navigationTitle(activePaneTitle)
    }
  }

  /// Resolve within the selected tab, even during the frame between a tab
  /// change and its focus callback. A stale split must never own pane controls.
  private var activeToolbarGroup: PaneGroupModel? {
    let _ = (workspaceRevision, store.workspaceLayoutRevision, environment.workspaceSync.revision)
    guard let leafId = activeRightLeafID else { return nil }
    return configuredCenterModel(leafId: leafId)
  }

  var activePaneDescriptor: PaneDescriptorState? {
    guard let leafId = activeLeafId else { return nil }
    return selectedWorkspace.selectedPane(inLeaf: leafId)
  }

  var activeFileModel: FilePaneModel? {
    guard !rightPaneCollapsed, activeRightPane?.kind == .document,
      let group = activeToolbarGroup, group.state.selectedPane?.kind == .document
    else { return nil }
    return (group.selectedPane as? FilePane)?.model
  }

  var paneControlsReplaceTitle: Bool {
    activeFileModel != nil
  }

  /// Chats retain the editable title and context previously used in Nous.
  /// File controls replace the title.
  var activePaneTitle: Binding<String> {
    Binding(
      get: {
        session?.title ?? selectedWorkspace.name
      },
      set: { title in
        guard let session else { return }
        environment.projectList.renameSession(session, to: title)
      }
    )
  }

  var activePaneSubtitle: String {
    guard session != nil else { return "" }
    let workspace = selectedWorkspace
    let candidates: [String?] = [
      workspace.name,
      project.name,
      workspace.worktreeName,
      environment.machines.fleetMachineName(for: workspace.serverId),
    ]
    var parts: [String] = []
    for candidate in candidates {
      guard let candidate, !candidate.isEmpty, !parts.contains(candidate) else { continue }
      parts.append(candidate)
    }
    return parts.joined(separator: " · ")
  }
}
