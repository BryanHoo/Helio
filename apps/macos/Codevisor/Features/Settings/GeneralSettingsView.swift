import CodevisorCore
import CodevisorUI
import SwiftUI

/// Privacy and local data settings.
struct GeneralSettingsView: View {
  @Environment(AppEnvironment.self) private var environment
  @Environment(\.theme) private var theme
  @State private var showingConfirmation = false

  var body: some View {
    Form {
      Section {
        Toggle("Ask before quitting", isOn: confirmBeforeQuitting)
          .toggleStyle(.switch)
      } header: {
        Text("General")
      } footer: {
        Text("Shows a confirmation when you press ⌘Q, so a stray keystroke can't close every session at once.")
      }

      Section("Data") {
        HStack(alignment: .center, spacing: 16) {
          VStack(alignment: .leading, spacing: 3) {
            Text("Delete all data")
            Text("Removes all projects, chats, and settings, then restarts setup.")
              .font(.callout)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 8)
          Button("Delete…", role: .destructive) {
            showingConfirmation = true
          }
          .settingsActionTint(theme)
          .fixedSize()
        }
      }
    }
    .settingsPaneFormStyle(theme)
    .confirmationDialog(
      "Delete all Helio data?",
      isPresented: $showingConfirmation,
      titleVisibility: .visible
    ) {
      Button("Delete everything", role: .destructive) {
        environment.deleteAllData()
      }
      .settingsActionTint(theme)
      Button("Cancel", role: .cancel) {}
        .settingsActionTint(theme)
    } message: {
      Text("This can't be undone. You'll be taken back through setup.")
    }
  }

  private var confirmBeforeQuitting: Binding<Bool> {
    Binding(
      get: { environment.settings.confirmBeforeQuitting },
      set: { environment.settings.setConfirmBeforeQuitting($0) }
    )
  }
}
