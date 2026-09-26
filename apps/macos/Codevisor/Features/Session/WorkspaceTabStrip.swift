import CodevisorCore
import SwiftUI

/// The visible navigation for a workspace's persisted center tabs.
struct WorkspaceTabStrip: View {
  let workspace: Workspace
  let sessions: [ChatSession]
  let onSelect: (UUID) -> Void
  let onClose: (UUID) -> Void
  let onNewTab: () -> Void
  let onRename: (UUID, String) -> Void

  @State private var renameTabID: UUID?
  @State private var renameTitle = ""

  var body: some View {
    HStack(spacing: 0) {
      ScrollViewReader { reader in
        ScrollView(.horizontal) {
          HStack(spacing: 2) {
            ForEach(workspace.centerTabs) { tab in
              tabButton(tab)
                .id(tab.id)
            }
          }
          .padding(.horizontal, 6)
        }
        .scrollIndicators(.hidden)
        .onChange(of: workspace.selectedCenterTabId, initial: true) { _, id in
          reader.scrollTo(id, anchor: .center)
        }
      }

      Button(action: onNewTab) {
        Image(systemName: "plus")
          .frame(width: 28, height: 28)
      }
      .buttonStyle(.plain)
      .help("New Tab")
      .accessibilityLabel("New Tab")
      .padding(.trailing, 6)
    }
    .frame(height: 38)
    .overlay(alignment: .bottom) { Divider() }
    .alert(
      "Rename Tab",
      isPresented: Binding(
        get: { renameTabID != nil },
        set: { if !$0 { renameTabID = nil } }
      )
    ) {
      TextField("Title", text: $renameTitle)
      Button("Rename") {
        if let renameTabID { onRename(renameTabID, renameTitle) }
        renameTabID = nil
      }
      Button("Cancel", role: .cancel) { renameTabID = nil }
    }
  }

  private func tabButton(_ tab: WorkspaceTab) -> some View {
    let descriptor =
      tab.root.group(id: tab.activeLeafId)?.selectedPane
      ?? tab.root.allGroups.first?.state.selectedPane
    let session = descriptor?.chatSessionId.flatMap { id in
      sessions.first { $0.id == id && $0.serverId == workspace.serverId }
    }
    let title = tab.displayTitle(for: descriptor, chatTitle: session?.title)
    let selected = workspace.selectedCenterTabId == tab.id
    return HStack(spacing: 0) {
      Button {
        onSelect(tab.id)
      } label: {
        HStack(spacing: 7) {
          Image(systemName: icon(for: descriptor?.kind))
            .frame(width: 16)
            .foregroundStyle(selected ? .primary : .secondary)
          Text(title)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 9)
        .frame(width: 142, height: 29)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(title)
      .accessibilityAddTraits(selected ? .isSelected : [])

      Button {
        onClose(tab.id)
      } label: {
        Image(systemName: "xmark")
          .font(.caption2.weight(.semibold))
          .frame(width: 20, height: 24)
      }
      .buttonStyle(.plain)
      .help("Close \(title)")
      .accessibilityLabel("Close \(title)")
      .padding(.trailing, 3)
    }
    .frame(width: 174, height: 30)
    .background(selected ? Color.accentColor.opacity(0.13) : Color.primary.opacity(0.035))
    .clipShape(RoundedRectangle(cornerRadius: 6))
    .contextMenu {
      Button("Rename") {
        renameTitle = title
        renameTabID = tab.id
      }
      Button("Close") { onClose(tab.id) }
    }
    .help(title)
  }

  private func icon(for kind: PaneKind?) -> String {
    switch kind {
    case .chat: "text.bubble"
    case .terminal: "terminal"
    case .document: "doc.text"
    case .newTab, .none: "square.dashed"
    }
  }
}
