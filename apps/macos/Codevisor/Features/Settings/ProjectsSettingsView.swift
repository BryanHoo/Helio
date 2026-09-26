import CodevisorCore
import CodevisorUI
import SwiftUI

struct ProjectsSettingsView: View {
  @Environment(AppEnvironment.self) private var environment
  @Environment(\.theme) private var theme
  @State private var showingAdd = false

  private var groups: [ProjectGroup] {
    environment.projectList.fleetActiveProjectGroups
      .filter { $0.serverIds.contains(CodevisorMachine.local.id) }
      .sorted {
        let order = $0.name.localizedStandardCompare($1.name)
        return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
      }
  }

  private var readyMachineIds: [String] {
    environment.machines.availability(for: CodevisorMachine.local.id) == .ready
      ? [CodevisorMachine.local.id] : []
  }

  var body: some View {
    Form {
      Section {
        if groups.isEmpty {
          ContentUnavailableView(
            "No Projects", systemImage: "folder",
            description: Text("Add a folder or clone a repository to get started.")
          )
        } else {
          ForEach(groups) { group in
            let localProject = group.member(on: CodevisorMachine.local.id) ?? group.primary
            NavigationLink(value: SettingsPaneRoute.project(group.id)) {
              HStack(spacing: 10) {
                Image(systemName: EntitySystemSymbol.project)
                  .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 3) {
                  Text(group.name)
                  Text(group.repoKey ?? localProject.folderURL.path)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                }
              }
            }
          }
        }
      } footer: {
        SettingsListActions {
          Button {
            showingAdd = true
          } label: {
            Label("Add Project…", systemImage: "plus")
          }
          .settingsActionTint(theme)
        }
      }
    }
    .settingsPaneFormStyle(theme)
    .sheet(isPresented: $showingAdd) {
      NewProjectSheet { project in
        SettingsRouter.shared.panePath = [.project(ProjectGroup.groupID(for: project))]
      }
    }
    .task(id: readyMachineIds) {
      await withTaskGroup(of: Void.self) { tasks in
        for serverId in readyMachineIds {
          let client = environment.machines.client(for: serverId)
          tasks.addTask { @MainActor in
            await environment.projectList.refreshFromServer(serverId: serverId, client: client)
          }
        }
      }
    }
  }

}

#Preview("Projects") {
  NavigationStack {
    ProjectsSettingsView()
  }
  .environment(AppEnvironment.preview())
  .frame(width: 580, height: 560)
}
