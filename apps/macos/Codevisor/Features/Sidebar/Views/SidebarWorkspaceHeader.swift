import SwiftUI
import CodevisorCore
import CodevisorUI

/// One selectable task under its project.
struct SidebarWorkspaceHeader: View {
  let name: String
  /// Where the workspace lives: a remote machine's name, or "This Mac" for
  /// local ones. Nil only when the workspace's machine is unknown.
  let machineName: String?
  let sessions: [ChatSession]
  let store: SessionStore?
  let lastActivityAt: Date
  let isSelected: Bool
  let isReordering: Bool
  let onActivate: () -> Void
  let onArchive: () -> Void
  let onRename: () -> Void
  let onNewTab: () -> Void

  /// Insets around the label. The reorder ghost reuses these so it can
  /// land pixel-for-pixel on the row it was lifted from.
  static let horizontalPadding: CGFloat = 10
  static let topPadding: CGFloat = 6
  static let bottomPadding: CGFloat = 6

  var body: some View {
    HoverableRow(isSelected: isSelected, isHoverEnabled: !isReordering, isHoverForced: false) { hovered in
      HStack(spacing: 4) {
        Button(action: onActivate) {
          HStack(spacing: 7) {
            if let statusSession {
              ChatSessionLeadingIcon(session: statusSession, store: store)
                .frame(width: 16)
            } else {
              Image(systemName: "square.stack")
                .font(.caption)
                .frame(width: 16)
                .foregroundStyle(.secondary)
            }
            SidebarWorkspaceHeaderLabel(name: name, machineName: machineName)
              .frame(maxWidth: .infinity, alignment: .leading)
            TimelineView(.periodic(from: .now, by: 60)) { context in
              Text(Self.age(since: lastActivityAt, now: context.date))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.tertiary)
                .frame(width: 42, alignment: .trailing)
            }
            .opacity(hovered && !isReordering ? 0 : 1)
            .help(lastActivityAt.formatted(date: .abbreviated, time: .shortened))
            .accessibilityLabel(
              "Last activity \(lastActivityAt.formatted(date: .abbreviated, time: .shortened))"
            )
            .accessibilityHidden(hovered && !isReordering)
          }
          .padding(.horizontal, Self.horizontalPadding)
          .padding(.top, Self.topPadding)
          .padding(.bottom, Self.bottomPadding)
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(title)")
      }
      .overlay(alignment: .trailing) {
        // 归档按钮覆盖时间的位置，不改变任务行的宽度或高度。
        Button(action: onArchive) {
          Image(systemName: "archivebox")
            .font(.caption2)
            .frame(width: 42, height: 20, alignment: .trailing)
        }
        .buttonStyle(.plain)
        .help("Archive task")
        .accessibilityLabel("Archive \(title)")
        .opacity(hovered && !isReordering ? 1 : 0)
        .allowsHitTesting(hovered && !isReordering)
        .accessibilityHidden(!hovered || isReordering)
        .padding(.trailing, Self.horizontalPadding)
      }
    }
    .contextMenu {
      Button(action: onNewTab) {
        Label("New Tab", systemImage: "plus")
          .labelStyle(.titleAndIcon)
      }
      Divider()
      Button(action: onRename) {
        Label("Rename", systemImage: "pencil")
          .labelStyle(.titleAndIcon)
      }
      Button(action: onArchive) {
        Label("Archive Task", systemImage: "archivebox")
          .labelStyle(.titleAndIcon)
      }
    }
  }

  private var title: String {
    SidebarWorkspaceHeaderLabel.title(for: name)
  }

  private var statusSession: ChatSession? {
    _ = store?.activityRevision
    guard let store else { return sessions.first }
    // 汇总同一任务内的会话，避免运行中的非首个聊天仍显示空闲图标。
    return sessions.first(where: store.isWaitingOnUser)
      ?? sessions.first(where: store.isInProgress)
      ?? sessions.first(where: store.hasUnreadError)
      ?? sessions.first(where: { store.unreadCount($0) > 0 })
      ?? sessions.first
  }

  static func age(since date: Date, now: Date) -> String {
    let minutes = max(1, Int(now.timeIntervalSince(date) / 60))
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h" }
    return "\(hours / 24)d"
  }
}

/// The header's name (and machine) text, shared with the reorder ghost so
/// the lifted row and its stand-in never drift apart in style.
struct SidebarWorkspaceHeaderLabel: View {
  let name: String
  let machineName: String?

  static func title(for name: String) -> String {
    name.isEmpty ? "Workspace" : name
  }

  private var title: String { Self.title(for: name) }

  var body: some View {
    // 4pt + the glyphs' side bearings lands at ~6pt of visible gap on
    // each side of the dot.
    HStack(spacing: 4) {
      Text(title)
        .truncationMode(.middle)
      if let machineName {
        // Separate view so the dot gets the same spacing on both sides;
        // inside the string it only had a ~3pt space on the right.
        Text("·")
          .foregroundStyle(.tertiary)
        Text(machineName)
          .foregroundStyle(.tertiary)
      }
    }
    .font(.subheadline.weight(.semibold))
    .lineLimit(1)
    .accessibilityElement(children: .combine)
    .help(machineName.map { "\(title) · \($0)" } ?? title)
  }
}
