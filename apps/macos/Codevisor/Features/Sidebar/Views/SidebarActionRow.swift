import SwiftUI

/// A pinned sidebar action ("New chat") with keyboard-accessible button behavior.
struct SidebarActionRow: View {
  let title: String
  let systemImage: String
  let isSelected: Bool
  let isHoverEnabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      SidebarHeaderRow(title: title, systemImage: systemImage)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .sidebarRowHover(isSelected: isSelected, isEnabled: isHoverEnabled)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}
