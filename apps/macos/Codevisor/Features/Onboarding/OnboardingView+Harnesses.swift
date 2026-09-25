import SwiftUI
import AppKit
import CodevisorCore
import CodevisorCoreMac
import os
import CodevisorUI

extension OnboardingView {
  // MARK: - Harnesses

  /// The account's harness fleet, exactly as Settings › Harnesses shows it
  /// afterwards. On a first Mac that is this machine's catalog; on another
  /// it is the fleet this Mac just joined — every harness lists each
  /// machine, so what will install here and what this Mac contributes are
  /// the same rows, not two explanations.
  var harnessesStep: some View {
    VStack(spacing: 20) {
      stepHeader(
        symbol: "terminal",
        title: "Choose your harnesses",
        subtitle: "Choose the coding agents available on this Mac."
      )

      switch detection {
      case .connecting:
        progress("Checking agents…")
      case let .unreachable(message):
        VStack(spacing: 12) {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("Can't reach the Helio server").fontWeight(.medium)
              Text(message)
                .font(.callout).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
          } icon: {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(theme.statusWarn)
          }
          .padding(14)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(RoundedRectangle(cornerRadius: 12).fill(theme.cardBackground))
          Button {
            Task { await detectHarnesses() }
          } label: {
            Label("Try Again", systemImage: "arrow.clockwise")
          }
        }
      case .loaded:
        fleetCard
      }
    }
    .frame(maxWidth: .infinity)
  }

  private func progress(_ title: String) -> some View {
    VStack(spacing: 10) {
      ProgressView()
        .controlSize(.small)
      Text(title)
        .foregroundStyle(.secondary)
    }
    .padding(.vertical, 20)
  }

  /// Settings › Harnesses, verbatim — the same `Form`, section, rows, and
  /// footer — sized to the step so it scrolls on its own inside the page.
  private var fleetCard: some View {
    Form {
      if HarnessFleet.settings(environment.configSync).isEmpty {
        Section {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("No harnesses yet").fontWeight(.medium)
              Text("Add one to install it on this Mac. No restart needed.")
                .font(.callout).foregroundStyle(.secondary)
            }
          } icon: {
            Image(systemName: "terminal").foregroundStyle(.secondary)
          }
        }
      }
      HarnessGlobalSection(
        model: fleetModel,
        onAccounts: { fleetPresenter.showAccounts($0, startsSignIn: $1) },
        onSignIn: { fleetPresenter.showSignIn(machineId: $0, harnessId: $1, startsSignIn: $2) }
      ) { id, symbol in
        HarnessIcon(harnessId: id, fallbackSymbolName: symbol, size: 18)
      }
    }
    .settingsPaneFormStyle(theme)
    .frame(height: fleetListHeight)
  }

  /// Everything below the step header, so the list fills the page and the
  /// page itself never has to scroll behind it.
  private var fleetListHeight: CGFloat {
    max(280, viewportHeight - 64 - 190)
  }

  // MARK: - Detection

  /// Light refetch (no PATH re-resolve) when a lifecycle event invalidated
  /// the catalog — the seed and the new-chat picker follow installs live.
  func refreshHarnessList() async {
    guard detection == .loaded else { return }
    if let loaded = try? await environment.harnessService(for: CodevisorMachine.local.id).allHarnesses() {
      harnesses = loaded
      HarnessFleet.seed(from: harnesses, in: environment.configSync)
    }
  }

  /// Waits for the local server, loads this Mac's catalog with a short
  /// retry tail before the list renders. Onboarding shows on first launch — exactly when the server
  /// is cold-starting — so querying immediately used to hit a closed port
  /// and misreport "No harnesses found".
  func detectHarnesses() async {
    detection = .connecting
    projectSetup.isLoadingRecommendations = true
    if !AppPreview.isRunning {
      // Joins the root view's in-flight server start (ensureRunning
      // dedups concurrent callers) instead of racing ahead of it.
      await environment.prepareMachine(CodevisorMachine.local.id)
    }
    // Safety net past the health wait: a handful of quick retries, not
    // one instantly-failing shot.
    var loaded: [ServerHarness]?
    for attempt in 0..<8 {
      loaded = try? await environment.harnessService(for: CodevisorMachine.local.id).allHarnesses()
      if loaded != nil { break }
      if attempt < 7 {
        try? await Task.sleep(for: .milliseconds(500))
      }
    }
    guard let loaded else {
      projectSetup.isLoadingRecommendations = false
      detection = .unreachable(serverFailureMessage)
      return
    }
    harnesses = loaded
    HarnessFleet.seed(from: harnesses, in: environment.configSync)
    detection = .loaded
    // Suggest project folders from the user's most recent harness
    // sessions so the project step offers one-click choices.
    projectSetup.recommendations = await environment.recommendedProjectsWithFallback(
      serverId: CodevisorMachine.local.id
    )
    projectSetup.isLoadingRecommendations = false
  }

  private var serverFailureMessage: String {
    if case let .unavailable(message) = environment.localServer?.state {
      return message
    }
    return "The Helio server didn't respond. Try again, or check Settings → Machines."
  }
}
