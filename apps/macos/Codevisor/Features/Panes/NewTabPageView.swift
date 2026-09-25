//  The Chrome-style "New tab" page: what a group shows when its last real
//  pane closes. The empty state IS a tab (the strip never lies about what's
//  open); this page offers what to open in its place — choosing converts
//  the placeholder pane in place, so the tab slot and selection carry over.
//  Everything opens in the workspace's one working directory.
//
//  The offer is an Autocomplete popup rendered inline: type to filter, ↑↓
//  to move, Return to open — the same picker the composer uses for models.

import Autocomplete
import CodevisorCore
import CodevisorUI
import SwiftUI

/// One thing the New Tab page can open.
private struct NewTabOption: Identifiable, Equatable {
  enum Kind: Equatable {
    case chat
    case terminal
    case files
  }

  let id: String
  let title: String
  let kind: Kind
}

struct NewTabPageView: View {
  @Environment(AppEnvironment.self) private var environment
  @Environment(\.theme) private var theme
  /// The placeholder pane this page belongs to.
  let paneId: UUID
  /// The owning group; conversion happens through it.
  let group: PaneGroupModel?
  /// Creates the chat SESSION eagerly and converts the placeholder into
  /// an established chat pane (wired by the container, which owns session
  /// creation). Nil (previews) falls back to a draft conversion.
  var onNewChat: (() -> Void)? = nil
  @State private var query = ""
  /// Focusing this pane focuses the picker's input — never on appearance,
  /// only when the group says the pane is the one the user is working in.
  @State private var inputFocus = Autocomplete.InputFocus()

  private static let popupCornerRadius: CGFloat = 18

  private var options: [NewTabOption] {
    [
      NewTabOption(id: "chat", title: "New Chat", kind: .chat),
      NewTabOption(id: "terminal", title: "New Terminal", kind: .terminal),
      NewTabOption(id: "files", title: "Open File", kind: .files),
    ]
  }

  var body: some View {
    // Scrolls when the pane is too short for the popup — fixed-height
    // content would otherwise fight the group's layout and squeeze the tab
    // bar. Centered while it fits.
    GeometryReader { geometry in
      ScrollView {
        popup
          .padding(20)
          .frame(maxWidth: .infinity)
          .frame(minHeight: geometry.size.height)
      }
    }
    .background(theme.paneBackground)
    // The page has no editor of its own, so whitespace clicks explicitly
    // activate the group, which routes focus to the picker's input.
    .simultaneousGesture(
      TapGesture().onEnded {
        group?.onActivated?()
        group?.requestSelectedPaneFocus()
      }
    )
    .onAppear {
      group?.registerNewTabFocus(paneId: paneId) {
        inputFocus.focus { [weak group] in
          group?.canFocusSelectedPane == true && group?.state.selectedPaneId == paneId
        }
      }
    }
    .onDisappear {
      group?.unregisterNewTabFocus(paneId: paneId)
    }
  }

  private var popup: some View {
    Autocomplete.Suggestions(query: $query, focus: inputFocus) {
      for option in options {
        switch option.kind {
        case .chat:
          Autocomplete.Action(option.title, id: option.id, systemImage: "text.bubble") { open(option) }
        case .terminal:
          Autocomplete.Action(option.title, id: option.id, systemImage: "terminal") { open(option) }
        case .files:
          Autocomplete.Action(option.title, id: option.id, systemImage: "doc.text.magnifyingglass") { open(option) }
        }
      }
    }
    .autocompleteSearchLabel("Search new tab options")
    .autocompleteEmptyMessage("No matching options")
    .composerGlassSurface(cornerRadius: Self.popupCornerRadius)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("New tab")
  }

  private func open(_ option: NewTabOption) {
    switch option.kind {
    case .files:
      group?.openFiles(id: paneId)
    case .chat:
      if let onNewChat {
        onNewChat()
      } else {
        group?.convertNewTabPane(id: paneId, to: .chat)
      }
    case .terminal:
      group?.convertNewTabPane(id: paneId, to: .terminal)
    }
  }

}

#if DEBUG
  #Preview {
    NewTabPageView(
      paneId: UUID(),
      group: nil
    )
    .frame(width: 700, height: 480)
  }
#endif
