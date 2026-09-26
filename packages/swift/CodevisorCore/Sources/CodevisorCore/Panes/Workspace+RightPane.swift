import Foundation

extension Workspace {
  /// 聊天属于中栏；右栏只展示工具面板与本地空白入口，保留原有持久化顺序。
  public var rightPaneDescriptors: [PaneDescriptorState] {
    centerTabs.flatMap { tab in
      tab.root.allGroups.flatMap { group in
        group.state.panes.filter { $0.kind != .chat }
      }
    }
  }
}

extension WorkspaceTab {
  /// 只投影当前会显示聊天的叶节点，原始分屏结构不被改写。
  public var rightPaneTree: SplitNode? {
    root.allGroups.reduce(Optional(root)) { tree, group in
      guard group.state.selectedPane?.kind == .chat else { return tree }
      return tree?.removingGroup(id: group.id)
    }
  }
}
