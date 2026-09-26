#if DEBUG
  import CodevisorCore
  import CodevisorUI
  import SwiftUI

  /// The production sidebar rows, populated from the same records as iOS.
  struct AppStoreScreenshotSidebar: View {
    let scene: String
    let store: SessionStore

    var body: some View {
      VStack(spacing: 0) {
        SidebarActionRow(
          title: "New chat", systemImage: "square.and.pencil", isSelected: scene == "new-chat", isHoverEnabled: false
        ) {}
        .padding(.top, 8)
        ScrollView {
          VStack(alignment: .leading, spacing: 1) {
            ForEach(AppStoreScreenshotData.sections) { section in
              HStack(spacing: 8) {
                Image(systemName: "chevron.down").font(.caption2)
                Image(systemName: "folder")
                Text(section.name).font(.subheadline.weight(.semibold))
                Spacer()
                Image(systemName: "plus")
              }
              .padding(.horizontal, 10)
              .frame(height: 32)
              ForEach(section.rows.filter { $0.session != nil }) { row in
                SidebarWorkspaceHeader(
                  name: row.title, machineName: nil,
                  isSelected: scene == "conversation" && row.id == AppStoreScreenshotData.id(11),
                  isReordering: false, onActivate: {}, onArchive: {}, onRename: {}, onNewTab: {}
                )
                .padding(.leading, 20)
              }
            }
          }
        }
        .scrollContentBackground(.hidden)
      }
      .padding(.horizontal, 8)
      .themedSurface(.sidebar)
    }
  }

  private extension ScreenshotSidebarTabRow {
    var session: ChatSession? {
      guard case let .chat(harnessId, _) = icon else { return nil }
      return ChatSession(
        id: id, projectId: AppStoreScreenshotData.projectID,
        serverId: AppStoreScreenshotData.machineID, harnessId: harnessId,
        title: title, createdAt: AppStoreScreenshotData.date, updatedAt: AppStoreScreenshotData.date,
        sidebarState: status == .inProgress ? .inProgress : (status == .unread ? .unread : .idle),
        unreadCount: status == .unread ? 1 : 0
      )
    }
  }
#endif
