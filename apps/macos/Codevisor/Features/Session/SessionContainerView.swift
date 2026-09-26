import SwiftUI
import CodevisorCore
import CodevisorUI

/// Hosts one workspace below the native toolbar (which follows the active
/// pane): either a resolved chat session and its controller, or the workspace
/// alone when it has never hosted a chat.
struct SessionContainerView: View {
  /// What this container is mounted on. A workspace owns its layout, server
  /// identity and pane persistence with or without a chat; the chat case adds
  /// the anchor session and its controller. There is no third state, so no
  /// call site has to invent a session to show a workspace.
  enum Mount {
    /// Resolved synchronously with the navigation selection so the destination
    /// shell never waits for this view's asynchronous setup task to run.
    case chat(ChatSession, SessionController)
    /// The mount-time snapshot; the live record is re-read from the repository.
    case workspace(Workspace)
  }

  let mount: Mount
  let project: Project
  let store: SessionStore

  /// The anchor chat, when there is one. Chat focus, read and open reporting,
  /// and anything keyed by a session identity, all go through this.
  var session: ChatSession? {
    if case let .chat(session, _) = mount { return session }
    return nil
  }
  var controller: SessionController? {
    if case let .chat(_, controller) = mount { return controller }
    return nil
  }
  /// Fired when a new chat becomes the visible middle-column conversation.
  /// Non-chat focus in the right pane leaves the sidebar route unchanged.
  var onFocusedChatChanged: ((UUID) -> Void)? = nil
  @Environment(AppEnvironment.self) var environment
  @Environment(\.accessibilityReduceMotion) var reduceMotion
  @Environment(\.theme) var theme
  /// Global geometry + pointer state for rearranging split leaves inside
  /// the selected top tab by dragging their headers.
  @State var splitDragCoordinator = WorkspaceSplitDragCoordinator()
  /// The middle chat and right-side tools share one keyboard focus coordinator.
  @State var sessionFocus = TerminalFocusController()
  @ClientPreference("workspace.rightPane.collapsed", default: true) var rightPaneCollapsed
  @State var rightPaneID: UUID?
  @State var attachmentImages: AttachmentImageStore?

  /// Divider previews are valid only for the persisted tab they started
  /// from. A navigation or remote layout change takes effect immediately.
  @State private var centerTreePreview: WorkspaceTreePreview?

  var liveCenterTree: SplitNode? {
    get { centerTreePreview?.tree(in: selectedWorkspace) }
    nonmutating set {
      centerTreePreview = newValue.map {
        WorkspaceTreePreview(workspace: selectedWorkspace, tree: $0)
      }
    }
  }

  /// Re-runs the container's setup task when the mounted thing changes.
  var mountIdentity: UUID {
    switch mount {
    case let .chat(session, _): return session.id
    case let .workspace(snapshot): return snapshot.id
    }
  }

  var selectedWorkspace: Workspace {
    let _ = (workspaceRevision, store.workspaceLayoutRevision, environment.workspaceSync.revision)
    switch mount {
    case let .chat(session, _):
      return store.workspace(for: session, project: project)
    case let .workspace(snapshot):
      // The repository owns the live record; the snapshot covers the window
      // between a remote deletion and the selection moving away.
      return environment.workspaces.workspace(id: snapshot.id) ?? snapshot
    }
  }

  var activeLeafId: UUID? {
    selectedWorkspace.selectedCenterTab?.resolvedActiveLeafId(preferred: nil)
  }
  /// Repository writes are intentionally non-observable. Structural tab
  /// changes bump this token so the sidebar and selected tree re-read truth.
  @State var workspaceRevision = 0
  /// Suppresses per-leaf dissolve while a whole top tab is closing.
  @State var closingCenterTabId: UUID?
  /// Presentation-only state for a locally inserted split. Its destination
  /// stays blank and inert until the opening geometry reaches its final size.
  @State var openingSplit: WorkspaceSplitOpening?
  /// Identifies this mounted container independently of its cached chat.
  @State var focusSourceId = UUID()
  @State var isVisible = false

  var body: some View {
    titledContentColumn
      .navigationSubtitle(activePaneSubtitle)
      .toolbar(removing: paneControlsReplaceTitle ? .title : nil)
      .toolbar {
        if !rightPaneCollapsed, let model = activeFileModel {
          FilePaneToolbar(model: model, onNewTab: addCenterTab)
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: toggleRightPane) {
            Image(systemName: "sidebar.right")
          }
          .help(rightPaneCollapsed ? "Show Right Sidebar" : "Hide Right Sidebar")
          .accessibilityLabel(rightPaneCollapsed ? "Show Right Sidebar" : "Hide Right Sidebar")
        }
      }
      .focusedSceneValue(\.filePane, activeFileModel)
      .focusedSceneValue(
        \.workspaceLayoutActions,
        WorkspaceLayoutActions(
          workspaceId: selectedWorkspace.id,
          newTab: addCenterTab,
          closeSplit: closeActiveLeaf,
          closeTab: {
            if let pane = activeRightPane { closeRightPane(pane.id) }
          },
          reopenClosedPane: reopenClosedPane,
          previousTab: { selectRelativeCenterTab(offset: -1) },
          nextTab: { selectRelativeCenterTab(offset: 1) },
          previousSplit: { focusRelativeSplit(offset: -1) },
          nextSplit: { focusRelativeSplit(offset: 1) },
          split: splitActiveLeaf,
          focus: focusAdjacentLeaf
        )
      )
      // Keep background terminals synchronized across all of a workspace's
      // chats, including persisted terminal descriptors from older layouts.
      .environment(\.openFileDocument, openFileDocument)
      .onChange(of: backgroundTaskFingerprint, initial: true) { _, _ in
        syncWorkspaceBackgroundTerminals()
      }
      .onChange(of: environment.workspaceSync.revision, initial: true) { _, _ in
        synchronizeMountedPaneGroups()
      }
      // Every structural tab write bumps the local token; mirror it to the
      // store so the sidebar re-reads the repository.
      .onChange(of: workspaceRevision) { _, _ in
        store.workspaceLayoutRevision += 1
      }
      // Structural commands may arrive as this workspace is mounting.
      // Navigation itself has already committed before view construction.
      .onChange(of: store.centerTabRequest, initial: true) { _, request in
        guard let request, store.centerTabRequest == request,
          request.workspaceId == selectedWorkspace.id
        else { return }
        store.centerTabRequest = nil
        performCenterTabRequest(request)
      }
      .onChange(of: activePaneDescriptor?.id, initial: true) { _, _ in
        if activePaneDescriptor?.id == activeRightPane?.id {
          focusSelectedCenterPane()
        } else {
          restoreRightPaneSelection()
        }
      }
      .onChange(of: selectedWorkspace.selectedCenterTabId) { _, _ in
        restoreRightPaneSelection()
      }
      .onChange(of: selectedWorkspace.rightPaneDescriptors.map(\.id)) { _, _ in
        if !rightPaneCollapsed { ensureRightPaneContent() }
      }
      .onChange(of: rightPaneCollapsed, initial: true) { _, collapsed in
        if !collapsed { ensureRightPaneContent() }
      }
      .onChange(of: controller?.previewCacheNamespace, initial: true) { _, _ in
        installAttachmentImageStoreIfNeeded()
      }
      .onChange(of: session?.id, initial: true) { _, _ in
        sessionFocus.persistentChatId = session?.id
        sessionFocus.canFocusChat = { chatId in
          isVisible && store.navigationWorkspaceId == selectedWorkspace.id
            && session?.id == chatId
        }
      }
      .onChange(of: selectedWorkspace.selectedCenterTabId) { _, _ in
        openingSplit = nil
      }
      .onChange(of: activeLeafId) { _, leafId in
        if let openingSplit, openingSplit.leafId != leafId { self.openingSplit = nil }
      }
      .onAppear {
        isVisible = true
        store.navigationWorkspaceId = selectedWorkspace.id
        sessionFocus.navigationRevision = { store.navigationRevision }
        sessionFocus.workspaceCommandHandler = handleWorkspaceCommand
        sessionFocus.startTypeToFocus()
        focusSelectedCenterPane()
      }
      // Read = focus: publish the chat pane facing the user in this
      // window (selected pane of the active split leaf). The store
      // combines it with window-key state and feeds the app-wide
      // attention coordinator, which marks the focused chat read.
      .onChange(of: focusedChatCandidate, initial: true) { _, candidate in
        store.setFocusedChat(
          candidate, serverId: selectedWorkspace.serverId, sourceId: focusSourceId,
          workspaceId: selectedWorkspace.id, isVisible: isVisible
        )
      }
      // The incoming container can publish before this one disappears.
      .onDisappear {
        isVisible = false
        sessionFocus.stopTypeToFocus()
        store.clearFocusedChat(sourceId: focusSourceId)
      }
      .task(id: mountIdentity) {
        splitDragCoordinator.canResolve = { sourceLeafId, resolution, canvasSize in
          canMoveSplitLeaf(
            sourceLeafId,
            relativeTo: resolution.targetLeafId,
            edge: resolution.edge,
            canvasSize: canvasSize
          )
        }
        splitDragCoordinator.onResolve = { sourceLeafId, resolution in
          moveSplitLeaf(
            sourceLeafId,
            relativeTo: resolution.targetLeafId,
            edge: resolution.edge
          )
        }
        // Upward focus feedback: clicking into any chat's composer
        // makes its group the active one (terminals do the same through
        // their surface responder callbacks) — and the sidebar's chat
        // selection follows the focused chat.
        sessionFocus.onChatComposerFocused = { chatId in
          guard isVisible,
            store.navigationWorkspaceId == selectedWorkspace.id
          else { return }
          rememberWorkspaceDefaults(from: chatId)
          if chatId != session?.id {
            onFocusedChatChanged?(chatId)
          }
        }
        // Opening is a chat event: a workspace mount has nothing to mark read.
        if let session {
          store.markOpened(session.id, serverId: session.serverId)
        }
      }
  }

  /// 聊天固定在中栏，工具面板以可折叠的右栏展示。
  var contentColumn: some View {
    GeometryReader { geometry in
      if rightPaneCollapsed {
        chatColumn
      } else if geometry.size.width >= 780 {
        HSplitView {
          chatColumn
            .frame(minWidth: 400, maxWidth: .infinity, maxHeight: .infinity)
          rightColumn
            .frame(minWidth: 300, idealWidth: 390, maxWidth: 560)
        }
      } else {
        chatColumn
          .overlay {
            Color.black.opacity(0.12)
              .contentShape(Rectangle())
              .onTapGesture { rightPaneCollapsed = true }
          }
          .overlay(alignment: .trailing) {
            rightColumn
              .frame(width: min(400, geometry.size.width - 24))
              .shadow(color: .black.opacity(0.18), radius: 14, x: -3)
          }
      }
    }
    .background(theme.contentBackground)
    // The sidebar stays seamless under the toolbar; the content has a hairline.
    .overlay(alignment: .top) {
      theme.separator
        .frame(height: 1)
        .frame(maxWidth: .infinity)
    }
  }
}
