import SwiftUI
import AppKit
import CodevisorCore
import CodevisorCoreMac
import UniformTypeIdentifiers
import os
import CodevisorUI

extension OnboardingView {
  // MARK: - Content

  @ViewBuilder
  var content: some View {
    switch step {
    case .welcome: welcomeStep
    case .permissions: permissionsStep
    case .analytics: projectStep
    case .harnesses: harnessesStep
    case .project: projectStep
    case .account: harnessesStep
    }
  }

  // MARK: - Permissions

  /// Continue unlocks when both Computer Use permissions are granted;
  /// "Set Up Later" skips and turns Computer Use off until the user
  /// re-enters setup from the Computer Use toggle in Settings. Full Disk
  /// Access is optional and managed in System Settings.
  private var permissionsStep: some View {
    VStack(spacing: 20) {
      stepHeader(
        symbol: "lock.shield",
        title: "Allow access",
        subtitle: "Let Helio operate apps and work with protected files when you ask."
      )

      ComputerUsePermissionRowsView(model: permissions, includesFullDiskAccess: true)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: - Welcome

  private var welcomeStep: some View {
    VStack(spacing: 0) {
      Image(nsImage: NSApp.applicationIconImage)
        .resizable()
        .frame(width: 108, height: 108)
        .shadow(color: .black.opacity(0.22), radius: 14, y: 8)
        .accessibilityHidden(true)

      Text("Welcome to Helio")
        .font(.heroTitle)
        .padding(.top, 22)

      Text("All your coding agents, working in one place.")
        .font(.title3)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .padding(.top, 6)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: - Step header

  func stepHeader(symbol: String, title: String, subtitle: String) -> some View {
    VStack(spacing: 0) {
      Image(systemName: symbol)
        .font(.system(size: Typography.IconSize.hero, weight: .medium))
        .symbolRenderingMode(.hierarchical)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)

      Text(title)
        .font(.stepTitle)
        .padding(.top, 18)

      Text(subtitle)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: 420)
        .padding(.top, 6)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: - Projects

  private var projectStep: some View {
    VStack(spacing: 20) {
      stepHeader(
        symbol: "folder",
        title: "Choose your projects",
        subtitle: "Select the folders you want to work in."
      )

      // The same selection grid the new-chat empty state renders, so
      // both surfaces look and behave identically.
      ProjectSetupSelectionView(
        model: projectSetup,
        isLocalMachine: true,
        machineName: CodevisorMachine.local.name,
        onPickFolder: { showingFolderPicker = true },
        onCloneRepository: { showingGitClone = true }
      )
    }
    .frame(maxWidth: .infinity)
  }
}
