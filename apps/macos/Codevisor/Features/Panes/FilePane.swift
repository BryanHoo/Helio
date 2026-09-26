import CodevisorCore
import CodevisorUI
import SwiftUI

@MainActor
final class FilePane: Pane {
  let id: UUID
  let kind: PaneKind = .document
  var onGroupCommand: ((PaneGroupCommand) -> Void)?
  var onFocusChanged: ((Bool) -> Void)?
  var onNavigate: ((String) -> Void)?
  let model: FilePaneModel

  init(context: PaneContext, descriptor: PaneDescriptorState) {
    id = descriptor.id
    model = FilePaneModel(
      id: descriptor.id, path: descriptor.documentPath ?? "",
      rootPath: context.workspaceRootDirectory ?? context.session?.cwd ?? context.project.folderURL.path,
      machineId: context.machine.id,
      client: context.client ?? CodevisorServerClient(config: context.machine.serverConfig))
    model.onNavigate = { [weak self] path in self?.onNavigate?(path) }
  }

  func makeView() -> AnyView {
    // 文件树没有编辑器焦点回调，点击时通知所属分组变为活动面板。
    AnyView(
      FilePaneView(model: model)
        .simultaneousGesture(
          TapGesture().onEnded { [weak self] in
            guard let self, model.isBrowsing else { return }
            onFocusChanged?(true)
          }
        ))
  }

  func focus() { model.focusExplorer() }
  func visibilityChanged(_ visible: Bool) {}
  func willDelete() async { model.close() }
  func detach() { model.close() }
}
