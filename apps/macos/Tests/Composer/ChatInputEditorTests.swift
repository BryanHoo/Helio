import AppKit
import SwiftUI
import Testing
@testable import TranscriptSurface

@Suite("Composer input method")
@MainActor
struct ChatInputEditorTests {
  @Test("SwiftUI refresh preserves uncommitted input method text")
  func markedTextSurvivesRefresh() throws {
    _ = NSApplication.shared
    var textView: SubmittingTextView?
    func editor() -> ChatInputEditor {
      ChatInputEditor(
        text: .constant(""), calculatedHeight: .constant(40),
        selection: .constant(NSRange(location: 0, length: 0)), onSubmit: {},
        onTextViewReady: { textView = $0 })
    }
    let host = NSHostingView(rootView: editor())
    host.frame = NSRect(x: 0, y: 0, width: 400, height: 80)
    host.layoutSubtreeIfNeeded()
    let input = try #require(textView)

    // 模拟输入法尚未提交拼音时，其他 SwiftUI 状态触发编辑器刷新。
    input.setMarkedText(
      "ni", selectedRange: NSRange(location: 2, length: 0),
      replacementRange: NSRange(location: NSNotFound, length: 0))
    #expect(input.hasMarkedText())
    host.rootView = editor()
    host.layoutSubtreeIfNeeded()

    #expect(input.hasMarkedText())
    #expect(input.string == "ni")
    #expect(input.selectedRange() == NSRange(location: 2, length: 0))
  }
}
