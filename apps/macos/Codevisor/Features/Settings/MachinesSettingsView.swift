import CodevisorCore
import CodevisorUI
import SwiftUI

/// 本地版本只展示 Mac 自带的 server，不提供远程机器配对入口。
struct MachinesSettingsView: View {
  @Environment(AppEnvironment.self) private var environment
  @Environment(\.theme) private var theme

  private var machine: CodevisorMachine { .local }

  var body: some View {
    Form {
      Section("This Mac") {
        HStack(spacing: 10) {
          Image(systemName: "desktopcomputer")
            .frame(width: 20)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(machine.name).fontWeight(.medium)
            Text(machine.baseURL.absoluteString)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          Spacer(minLength: 12)
          if let status = environment.machines.statusByMachineId[machine.id] {
            Circle()
              .fill(status.isReachable ? theme.statusOK : theme.statusError)
              .frame(width: 7, height: 7)
              .accessibilityHidden(true)
            Text(status.label).font(.caption).foregroundStyle(.secondary)
          } else {
            ProgressView().controlSize(.mini)
          }
        }
      }
    }
    .settingsPaneFormStyle(theme)
    .task { await environment.machines.refreshStatus(for: machine.id) }
  }
}

#Preview("Machines") {
  NavigationStack {
    MachinesSettingsView()
  }
  .environment(AppEnvironment.preview())
  .frame(width: 580, height: 560)
}
