import CodevisorCore
import CodevisorUI
import SwiftUI

extension SessionContainerView {
  var activeRightPane: PaneDescriptorState? {
    let panes = selectedWorkspace.rightPaneDescriptors
    return panes.first(where: { $0.id == rightPaneID })
      ?? panes.first(where: { $0.id == activePaneDescriptor?.id })
      ?? panes.first
  }

  var activeRightLeafID: UUID? {
    guard let pane = activeRightPane else { return nil }
    return selectedWorkspace.centerTabs.lazy.compactMap {
      $0.root.groupId(containingPane: pane.id)
    }.first
  }

  private var activeRightTab: WorkspaceTab? {
    guard let pane = activeRightPane else { return nil }
    return selectedWorkspace.centerTabs.first {
      $0.root.groupId(containingPane: pane.id) != nil
    }
  }

  @ViewBuilder
  var rightColumn: some View {
    VStack(spacing: 0) {
      WorkspaceRightTabStrip(
        panes: selectedWorkspace.rightPaneDescriptors,
        selectedID: activeRightPane?.id,
        onSelect: selectRightPane,
        onClose: closeRightPane,
        onNewTab: addCenterTab,
        onRename: renameRightPane
      )
      if let pane = activeRightPane, let leafID = activeRightLeafID,
        let tab = activeRightTab, let tree = tab.rightPaneTree
      {
        let model = configuredCenterModel(leafId: leafID)
        if model.state.selectedPane?.id == pane.id {
          WorkspaceSplitView(
            node: tree == tab.root ? (liveCenterTree ?? tree) : tree,
            activeLeafId: leafID,
            groupModel: configuredCenterModel,
            paneTitle: paneTitle,
            sessionStore: store,
            dragCoordinator: tree == tab.root ? splitDragCoordinator : nil,
            onSplitLeaf: splitLeaf,
            onRenameLeaf: renameLeaf,
            onCloseLeaf: closeLeaf,
            openingSplit: openingSplit,
            onOpeningFinished: finishSplitOpening,
            onTreeChanged: { updated in
              if tree == tab.root { saveSelectedTree(updated, workspaceId: selectedWorkspace.id) }
            },
            onLiveTreeChanged: { updated in
              if tree == tab.root { liveCenterTree = updated }
            }
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .background(theme.contentBackground)
  }

  func toggleRightPane() {
    rightPaneCollapsed.toggle()
    if rightPaneCollapsed {
      if let session { sessionFocus.requestComposerFocus(forChat: session.id) }
    } else {
      ensureRightPaneContent()
    }
  }

  func ensureRightPaneContent() {
    guard !rightPaneCollapsed else { return }
    if let pane = activeRightPane {
      selectRightPane(pane.id)
    } else {
      addCenterTab()
    }
  }

  func restoreRightPaneSelection() {
    guard !rightPaneCollapsed, let pane = activeRightPane,
      activePaneDescriptor?.id != pane.id
    else { return }
    selectRightPane(pane.id)
  }

  func selectRightPane(_ paneID: UUID) {
    guard selectedWorkspace.rightPaneDescriptors.contains(where: { $0.id == paneID }) else { return }
    rightPaneCollapsed = false
    rightPaneID = paneID
    guard store.selectDestination(.pane(paneID), in: selectedWorkspace.id),
      let leafID = activeRightLeafID
    else { return }
    let model = configuredCenterModel(leafId: leafID)
    sessionFocus.centerGroup = model
    model.requestSelectedPaneFocus()
  }

  func closeRightPane(_ paneID: UUID) {
    if let pane = activeRightPane, pane.id == paneID,
      pane.kind == .newTab, selectedWorkspace.rightPaneDescriptors.count == 1
    {
      rightPaneCollapsed = true
      return
    }
    guard
      let leafID = selectedWorkspace.centerTabs.lazy.compactMap({
        $0.root.groupId(containingPane: paneID)
      }).first
    else { return }
    configuredCenterModel(leafId: leafID).closePane(id: paneID)
    if rightPaneID == paneID { rightPaneID = nil }
    ensureRightPaneContent()
  }

  func renameRightPane(_ paneID: UUID, to title: String) {
    guard
      let leafID = selectedWorkspace.centerTabs.lazy.compactMap({
        $0.root.groupId(containingPane: paneID)
      }).first
    else { return }
    configuredCenterModel(leafId: leafID).renamePane(id: paneID, to: title)
  }
}
