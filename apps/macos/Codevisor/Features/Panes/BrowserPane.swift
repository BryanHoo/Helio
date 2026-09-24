import AppKit
import CodevisorCore
import CodevisorUI
import SwiftUI

/// 旧工作区中的 browser pane 仍可恢复网址，但网页交给系统默认浏览器。
@MainActor
final class BrowserPane: Pane {
  let id: UUID
  let kind: PaneKind = .browser
  var onGroupCommand: ((PaneGroupCommand) -> Void)?
  var onFocusChanged: ((Bool) -> Void)?
  private let address: String?

  init(descriptor: PaneDescriptorState) {
    id = descriptor.id
    address = descriptor.browserURL
  }

  func makeView() -> AnyView {
    AnyView(
      VStack(spacing: 14) {
        Image(systemName: "globe")
          .font(.largeTitle)
          .foregroundStyle(.secondary)
        if let address { Text(address).textSelection(.enabled) }
        Button("Open in Default Browser", systemImage: "arrow.up.right.square") {
          guard let address = self.address, let url = BrowserLocation.navigationURL(address) else { return }
          NSWorkspace.shared.open(url)
        }
        .disabled(address.flatMap(BrowserLocation.navigationURL) == nil)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    )
  }
  func focus() {}
  func visibilityChanged(_ visible: Bool) {}
  func willDelete() async {}
  func detach() {}
}
