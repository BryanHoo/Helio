import CodevisorCore
import CodevisorUI
import SwiftUI

/// The Plugins pane: a native machine list that pushes each machine's
/// plugins — install, update, restart, and uninstall all act on that
/// machine.
struct PluginsSettingsView: View {
  @Environment(AppEnvironment.self) private var environment
  @Environment(\.theme) private var theme
  @State private var activeSheet: PluginsRootSheet?
  @State private var actionError: String?

  private enum PluginsRootSheet: Identifiable {
    case install(initialSource: String?)
    var id: String { "install" }
  }

  /// Fleet-level installs land on the local machine; registry plugins
  /// sync out from there.
  private var localClient: any CodevisorServerClienting {
    environment.machines.client(for: CodevisorMachine.local.id)
  }

  var body: some View {
    Form {
      MachineListSection(pane: .plugins, badge: badge) { machine in
        PluginMachinePane(machine: machine)
      } footer: {
        SettingsListActions(message: actionError) {
          Button {
            activeSheet = .install(initialSource: nil)
          } label: {
            Label("Install Plugin…", systemImage: "plus")
          }
          .settingsActionTint(theme)
        }
      }
    }
    .settingsPaneFormStyle(theme)
    .background {
      if !theme.isSystem { theme.windowBackground }
    }
    .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .install(let initialSource):
        PluginInstallSheet(
          initialSource: initialSource,
          discover: { source in
            try await localClient.discoverRemotePlugin(source: source)
          },
          onInstall: { source in
            do {
              _ = try await localClient.importRemotePlugin(source: source)
              actionError = nil
            } catch {
              actionError = ErrorReporter.userFacingMessage(for: error)
              throw error
            }
          }
        )
      }
    }
  }

  /// The disclosure-row badge, from the machine's own readiness report:
  /// blocked plugins (missing prerequisites) need the user; a fleet
  /// plugin not yet materialized there is still converging.
  private func badge(_ machine: CodevisorMachine) -> MachineSyncBadge {
    if environment.machines.statusByMachineId[machine.id]?.isReachable == false {
      return .attention("Unreachable")
    }
    guard let key = environment.machines.syncKey(forMachineId: machine.id),
      let rows = PluginFleet.readiness(environment.configSync)[key]
    else { return .syncing }
    if rows.contains(where: { $0.state == "blocked" }) { return .attention("Needs attention") }
    if rows.contains(where: { $0.state == "notInstalled" }) { return .syncing }
    return .synced
  }
}

#Preview("Plugins Settings") {
  PluginsSettingsView()
    .environment(AppEnvironment.preview())
    .frame(width: 560, height: 460)
}
