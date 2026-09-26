import CodevisorCore
import SwiftUI

extension SidebarView {
  var projectSections: [ProjectWorkspaceSection] {
    let workspaces = workspaceItems.map(\.workspace)
    return ProjectWorkspaceSection.sections(
      projects: list.fleetActiveProjectGroupsByWorkspaceRecency(workspaces),
      workspaces: workspaces,
      scratchProjects: list.projects.filter(\.isScratch)
    )
  }

  private var defaultExpandedProjectIDs: [String] {
    projectSections.first.map { [$0.id] } ?? []
  }

  func isProjectExpanded(_ id: String) -> Bool {
    (expandedProjectIDs ?? defaultExpandedProjectIDs).contains(id)
  }

  func toggleProject(_ id: String) {
    var ids = expandedProjectIDs ?? defaultExpandedProjectIDs
    if ids.contains(id) {
      ids.removeAll { $0 == id }
    } else {
      ids.append(id)
    }
    expandedProjectIDs = ids
  }

  func expandProject(_ id: String) {
    guard !isProjectExpanded(id) else { return }
    expandedProjectIDs = (expandedProjectIDs ?? defaultExpandedProjectIDs) + [id]
  }

  @ViewBuilder
  func projectSection(_ section: ProjectWorkspaceSection) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Button {
        toggleProject(section.id)
      } label: {
        HStack(spacing: 8) {
          Image(systemName: isProjectExpanded(section.id) ? "chevron.down" : "chevron.right")
            .font(.caption2.weight(.semibold))
            .frame(width: 12)
          Image(systemName: section.project == nil ? "tray" : "folder")
            .frame(width: 18)
          Text(section.project?.name ?? "Temporary Tasks")
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.subheadline.weight(.semibold))
        .padding(.horizontal, 10)
        .frame(height: 32)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(section.project?.name ?? "Temporary Tasks")
      .accessibilityValue(isProjectExpanded(section.id) ? "Expanded" : "Collapsed")

      if isProjectExpanded(section.id) {
        if section.workspaces.isEmpty {
          Text("No tasks yet")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.leading, 38)
            .frame(height: 28)
        }
        ForEach(section.workspaces) { workspace in
          if let item = workspaceItems.first(where: { $0.workspace.id == workspace.id }) {
            workspaceSection(item)
              .padding(.leading, 20)
          }
        }
      }
    }
  }

  func section(containing workspaceID: UUID) -> ProjectWorkspaceSection? {
    projectSections.first { $0.workspaces.contains { $0.id == workspaceID } }
  }
}
