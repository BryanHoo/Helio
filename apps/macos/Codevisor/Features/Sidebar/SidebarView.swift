import SwiftUI
import CodevisorCore
import CodevisorTheming
import CodevisorUI
import os

/// Projects and their workspace tasks; tabs live in the center column.
///
/// Built on `ScrollView` + `VStack` (not `List`), because the sidebar-styled
/// `List` outline coordinator crashes on the current macOS SDK.
struct SidebarView: View {
  @Environment(AppEnvironment.self) var environment
  @Environment(\.accessibilityReduceMotion) var reduceMotion
  @Binding var selection: SidebarSelection?
  var store: SessionStore? = nil
  var publishesSceneActions = true

  @State private var addProjectFlow = AddProjectFlow()
  @State private var pendingImport: PendingSessionImport?
  @State var renamingWorkspace: Workspace?
  @State var workspaceRenameTitle = ""
  @ClientPreference("sidebar.expandedProjects.v1", default: Optional<[String]>.none)
  var expandedProjectIDs: [String]?
  /// Bumped after workspace mutations (backfill sweep, renames) so the
  /// non-observable repository is re-read.
  @State var workspaceRevision = 0
  @State var workspaceDrag: SidebarWorkspaceDrag?
  @State var workspaceGeometry = SidebarWorkspaceGeometryStore()
  /// Collapsed by default: the archive is a place you go looking for
  /// something, not something that should crowd the live list.
  /// Page state is deliberately NOT persisted: reopening the archive should
  /// start at the newest page rather than restoring a deep scroll.
  /// The item a click is asking to restore, driving the confirmation alert.

  var list: ProjectListModel { environment.projectList }
  var isReordering: Bool { workspaceDrag != nil }
  var itemTitleFont: Font { .body }

  var isNewChatSelected: Bool {
    switch selection {
    case .newChat, .none: true
    case .session, .workspace: false
    }
  }

  var body: some View {
    sidebarConfiguredView
  }

  private var sidebarContent: some View {
    VStack(spacing: 0) {
      // Development identity and New chat stay pinned above the project tree.
      VStack(alignment: .leading, spacing: 1) {
        if CodevisorAppVariant.isDevelopment {
          SidebarDevelopmentWorktreeRow()
        }

        SidebarActionRow(
          title: "New chat",
          systemImage: "square.and.pencil",
          isSelected: isNewChatSelected,
          isHoverEnabled: !isReordering
        ) {
          selection = .newChat(nil)
        }
      }
      .padding(.horizontal, 8)
      .padding(.top, 8)

      HStack {
        Text("Projects")
          .font(.subheadline.weight(.semibold))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button(action: startAddProject) {
          Image(systemName: "plus")
            .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .help("Add Project")
        .accessibilityLabel("Add Project")
      }
      .padding(.leading, 16)
      .padding(.trailing, 12)
      .padding(.top, 14)
      .padding(.bottom, 4)

      ScrollView {
        // A plain VStack: lazy row materialization re-measures the
        // content mid-bounce, which reads as random overscroll snaps.
        VStack(alignment: .leading, spacing: 1) {
          // `.geometryGroup()` makes each section translate as one
          // rigid unit during reflows. Without it a row whose
          // content changes in the same transaction as its move
          // (the state change that reorders a task also restyles
          // its selection) animates each subview's position
          // independently, which reads as shearing/jitter.
          ForEach(projectSections) { section in
            projectSection(section)
              .geometryGroup()
              .transition(.identity)
          }

        }
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
        .animation(Motion.listReflow(reduceMotion: reduceMotion), value: projectSections.map(\.id))
        .animation(Motion.listReflow(reduceMotion: reduceMotion), value: workspaceItems.map(\.id))
      }
      .scrollContentBackground(.hidden)
      .scrollBounceBehavior(.basedOnSize)

      Divider()
      SettingsLink {
        Label("Settings", systemImage: "gearshape")
          .font(.subheadline)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .frame(height: 36)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help("Settings")
      .padding(.vertical, 6)

    }
    // Section frames and the reorder ghost share this space, so the ghost
    // can be placed over whichever row it was lifted from or lands on.
    .coordinateSpace(.named(Self.reorderSpace))
    .overlay(alignment: .topLeading) { workspaceReorderGhost }
    .task(id: settlingWorkspaceID) { await finishSettledWorkspaceDrag() }
  }

  private var sidebarInteractionView: some View {
    sidebarContent
      .themedSurface(.sidebar)
      .contentShape(Rectangle())
      .addProjectFlow(addProjectFlow) { project in
        expandProject(ProjectGroup.groupID(for: project))
        selection = .newChat(NewChatTarget(project))
        offerSessionImport(for: project)
      }
  }

  private var sidebarAlertsView: some View {
    sidebarInteractionView
      .modifier(
        SidebarAlertsModifier(
          pendingImport: $pendingImport,
          renamingWorkspace: $renamingWorkspace,
          workspaceRenameTitle: $workspaceRenameTitle,
          onImport: { environment.importSessions($0.sessions, into: $0.project) },
          onRenameWorkspace: { renamed in
            environment.workspaceSync.renameWorkspace(
              renamed, client: environment.machines.client(for: renamed.serverId)
            )
            workspaceRevision += 1
          },
        )
      )
  }

  private var sidebarChangeObserversView: some View {
    sidebarAlertsView
      // Keyed on assignments as well as ids: a chat created elsewhere can
      // arrive before the server's workspace membership does, and the
      // backfill must run again once it lands to re-home the chat.
      .onChange(of: sessionWorkspaceAssignments) { _, _ in
        ensureSessionWorkspaces()
      }
  }

  private var sidebarConfiguredView: some View {
    sidebarChangeObserversView
      .onAppear(perform: ensureSessionWorkspaces)
      .onChange(of: selection, initial: true) { _, route in
        let workspaceID: UUID?
        switch route {
        case let .workspace(_, id): workspaceID = id
        case let .session(_, id): workspaceID = environment.workspaces.workspaceId(forSession: id)
        case .newChat, .none: workspaceID = nil
        }
        guard let workspaceID, let section = section(containing: workspaceID),
          !isProjectExpanded(section.id)
        else { return }
        var ids = expandedProjectIDs ?? (projectSections.first.map { [$0.id] } ?? [])
        ids.append(section.id)
        expandedProjectIDs = ids
      }
      .focusedSceneValue(
        \.sidebarActions,
        // Navigation captures the store; wait until it is available before
        // publishing the closures retained by the scene's focused value.
        publishesSceneActions && store != nil
          ? SidebarActions(
            newChat: { selection = .newChat(nil) },
            newProject: { startAddProject() },
          )
          : nil
      )
  }

  /// One shared flow: pick a folder on the machine or clone a repository.
  private func startAddProject() {
    addProjectFlow.begin()
  }

  /// After a project is added, look for existing harness sessions in its
  /// folder and — only when some are found — offer to import them.
  private func offerSessionImport(for project: Project) {
    Task {
      let importable = await environment.findImportableSessions(
        for: project.folderURL,
        serverId: project.serverId
      )
      guard !importable.isEmpty else { return }
      pendingImport = PendingSessionImport(project: project, sessions: importable)
    }
  }

}

#Preview {
  @Previewable @State var selection: SidebarSelection?
  return NavigationSplitView {
    SidebarView(selection: $selection)
      .environment(AppEnvironment.preview())
  } detail: {
    Text("Detail")
  }
  .frame(width: 900, height: 600)
}
