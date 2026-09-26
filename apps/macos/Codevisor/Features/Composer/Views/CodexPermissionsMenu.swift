import ACPKit
import CodevisorCore
import CodevisorUI
import SwiftUI

/// Codex 权限属于当前会话，两个选择器分别更新下一轮的沙盒与审批策略。
struct CodexPermissionsMenu: View {
  @Bindable var controller: SessionController

  var body: some View {
    if let sandbox = option("sandbox"), let approval = option("approval") {
      HStack(spacing: 6) {
        permissionMenu(sandbox, symbol: "shield.lefthalf.filled")
        permissionMenu(approval, symbol: "hand.raised")
      }
    }
  }

  private func option(_ id: String) -> SessionConfigOption? {
    guard controller.activeHarnessId == "codex" else { return nil }
    return controller.configOptions.first { $0.id == id }
  }

  private func permissionMenu(_ option: SessionConfigOption, symbol: String) -> some View {
    Menu {
      ForEach(option.options, id: \.value) { choice in
        Button {
          Task { await controller.setConfigOption(option.id, choice.value) }
        } label: {
          if option.currentValue == choice.value {
            Label(choice.name, systemImage: "checkmark")
          } else {
            Text(choice.name)
          }
        }
      }
    } label: {
      PickerChip(text: option.currentName) {
        Image(systemName: symbol).font(.system(size: 12))
      }
    }
    .buttonStyle(HoverIconButtonStyle(shape: .chip))
    .help(option.name)
    .accessibilityLabel(option.name)
    .accessibilityValue(option.currentName)
  }
}
