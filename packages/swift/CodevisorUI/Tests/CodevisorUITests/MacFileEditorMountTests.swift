#if canImport(AppKit)
  import AppKit
  import CodevisorClient
  import SwiftUI
  import Testing
  @testable import CodevisorUI

  @MainActor
  struct MacFileEditorMountTests {
    @Test func remountPreservesTheEditorInAFreshRootView() {
      let editor = MacFileEditor()
      editor.text = "preview contents"

      let first = FileEditorMountView(editor: editor)
      #expect(editor.container.superview === first)

      // 模拟右栏关闭后重开：旧根视图失效，编辑器迁入新的根视图。
      let second = FileEditorMountView(editor: editor)
      #expect(first !== second)
      #expect(editor.container.superview === second)
      #expect(editor.text == "preview contents")
    }

    @Test func editorReturnsToTheHostAfterSwiftUIRemount() {
      _ = NSApplication.shared
      let document = FileDocumentModel(
        path: "/preview.txt",
        read: {
          ServerFileDocument(path: "/preview.txt", content: "preview contents", version: "1", size: 16, writable: true)
        },
        write: { text, _ in
          ServerFileDocument(path: "/preview.txt", content: text, version: "2", size: text.count, writable: true)
        }
      )
      let session = FileEditorSession(document: document)
      let storage = session.storage
      let pane = { AnyView(FileSourceEditor(session: session)) }
      let host = NSHostingView(rootView: pane())
      host.frame = NSRect(x: 0, y: 0, width: 480, height: 300)
      host.layoutSubtreeIfNeeded()
      #expect(storage.native.container.isDescendant(of: host))
      #expect(storage.native.container.bounds.width > 0)
      #expect(storage.native.container.bounds.height > 0)

      host.rootView = AnyView(EmptyView())
      host.layoutSubtreeIfNeeded()
      host.rootView = pane()
      host.layoutSubtreeIfNeeded()
      #expect(storage.native.container.isDescendant(of: host))
      #expect(storage.native.container.bounds.width > 0)
      #expect(storage.native.container.bounds.height > 0)
    }
  }
#endif
