import CodevisorCore
import SwiftUI

/// 文件、终端和空白入口共用的右栏标签条。
struct WorkspaceRightTabStrip: View {
  let panes: [PaneDescriptorState]
  let selectedID: UUID?
  let onSelect: (UUID) -> Void
  let onClose: (UUID) -> Void
  let onNewTab: () -> Void
  let onRename: (UUID, String) -> Void

  @State private var renameID: UUID?
  @State private var renameTitle = ""

  var body: some View {
    HStack(spacing: 0) {
      ScrollViewReader { reader in
        ScrollView(.horizontal) {
          HStack(spacing: 2) {
            ForEach(panes, id: \.id) { pane in
              tabButton(pane)
                .id(pane.id)
            }
          }
          .padding(.horizontal, 6)
        }
        .scrollIndicators(.hidden)
        .onChange(of: selectedID, initial: true) { _, id in
          if let id { reader.scrollTo(id, anchor: .center) }
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
        get: { renameID != nil },
        set: { if !$0 { renameID = nil } }
      )
    ) {
      TextField("Title", text: $renameTitle)
      Button("Rename") {
        if let renameID { onRename(renameID, renameTitle) }
        renameID = nil
      }
      Button("Cancel", role: .cancel) { renameID = nil }
    }
  }

  private func tabButton(_ pane: PaneDescriptorState) -> some View {
    let selected = pane.id == selectedID
    return HStack(spacing: 0) {
      Button {
        onSelect(pane.id)
      } label: {
        HStack(spacing: 7) {
          Image(systemName: icon(for: pane.kind))
            .frame(width: 16)
            .foregroundStyle(selected ? .primary : .secondary)
          Text(pane.name)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 9)
        .frame(width: 124, height: 29)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(pane.name)
      .accessibilityAddTraits(selected ? .isSelected : [])

      Button {
        onClose(pane.id)
      } label: {
        Image(systemName: "xmark")
          .font(.caption2.weight(.semibold))
          .frame(width: 20, height: 24)
      }
      .buttonStyle(.plain)
      .help("Close \(pane.name)")
      .accessibilityLabel("Close \(pane.name)")
      .padding(.trailing, 3)
    }
    .frame(width: 156, height: 30)
    .background(selected ? Color.accentColor.opacity(0.13) : Color.primary.opacity(0.035))
    .clipShape(RoundedRectangle(cornerRadius: 6))
    .contextMenu {
      Button("Rename") {
        renameTitle = pane.name
        renameID = pane.id
      }
      Button("Close") { onClose(pane.id) }
    }
    .help(pane.name)
  }

  private func icon(for kind: PaneKind) -> String {
    switch kind {
    case .chat: "text.bubble"
    case .terminal: "terminal"
    case .document: "doc.text"
    case .newTab: "square.dashed"
    }
  }
}
