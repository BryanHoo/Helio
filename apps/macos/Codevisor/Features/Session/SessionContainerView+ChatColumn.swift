import CodevisorCore
import CodevisorUI
import SwiftUI

extension SessionContainerView {
  @ViewBuilder
  var chatColumn: some View {
    Group {
      if let session,
        let descriptor = selectedWorkspace.pane(containingChat: session.id),
        let leafID = selectedWorkspace.centerTabs.lazy.compactMap({
          $0.root.groupId(containingChat: session.id)
        }).first
      {
        ChatPaneContentView(
          descriptor: descriptor,
          group: configuredCenterModel(leafId: leafID),
          focus: sessionFocus,
          session: session,
          hostWorkspace: selectedWorkspace,
          project: project,
          store: store,
          environment: environment
        )
      } else if let session, let controller {
        ChatScreen(
          controller: controller,
          focus: sessionFocus,
          presentationSurface: store.transcriptSurface(
            for: session, paneID: session.id, controller: controller
          )
        )
      } else {
        NewChatView(
          store: store,
          selection: .constant(nil),
          initialProjectTarget: NewChatTarget(project),
          paneDraftId: selectedWorkspace.id,
          onCreatedInPane: { created in
            // 无聊天的任务首次发送后，直接把新会话归入当前任务。
            var workspace = selectedWorkspace
            let state = PaneGroupState.centerInitial(sessionId: created.id)
            workspace.centerTabs.append(WorkspaceTab(root: .leaf(state)))
            environment.workspaces.save(workspace)
            if let pane = state.panes.first {
              environment.workspaceSync.promotePaneToChat(
                pane,
                session: created,
                workspaceId: workspace.id,
                client: environment.machines.client(for: workspace.serverId)
              )
            }
            store.selectChat(created)
            onFocusedChatChanged?(created.id)
          },
          hostWorkspaceId: selectedWorkspace.id
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .environment(\.attachmentImages, attachmentImages)
    .background(
      HostWindowCapture { [weak sessionFocus] window in
        sessionFocus?.hostWindow = window
      }
      .frame(width: 0, height: 0)
    )
  }

  func installAttachmentImageStoreIfNeeded() {
    guard let controller else {
      attachmentImages = nil
      return
    }
    let namespace = controller.previewCacheNamespace
    guard attachmentImages?.namespace != namespace else { return }
    attachmentImages = AttachmentImageStore(
      namespace: namespace,
      fetch: { [weak controller] source in
        guard let controller else { throw SessionControllerError.serverUnavailable }
        return try await controller.fileData(for: source)
      },
      fetchPreview: { [weak controller] source in
        guard let controller else { throw SessionControllerError.serverUnavailable }
        return try await controller.filePreview(for: source)
      },
      version: { [weak controller] source in
        guard let controller else { throw SessionControllerError.serverUnavailable }
        return try await controller.fileVersion(for: source)
      }
    )
  }
}
