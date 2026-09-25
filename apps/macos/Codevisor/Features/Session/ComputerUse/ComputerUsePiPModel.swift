//  Drives the picture-in-picture preview of the window a chat's agent is
//  controlling through Computer Use. Local chats watch the in-process
//  stream. The viewer
//  owns the frame source and must always be detached.

import AppKit
import CodevisorCore
import CodevisorCoreMac
import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class ComputerUsePiPModel {
  /// Dismissals survive tab switches (which rebuild the chat view) but not
  /// new work: the preview returns when the agent next controls an app.
  private static var dismissedSessions: Set<UUID> = []
  /// Where the user last left each session's card; survives tab switches.
  private static var cornerBySession: [UUID: ComputerUseLivePreviewCorner] = [:]

  static let hideDelay: Duration = .seconds(2)

  let chatSessionID: UUID
  private let preview: ComputerUseLivePreview
  private(set) var viewer: ComputerUseLivePreviewViewer?
  private(set) var isDismissed: Bool
  var corner: ComputerUseLivePreviewCorner {
    didSet { Self.cornerBySession[chatSessionID] = corner }
  }
  /// Local only: true from a stop until the hide delay elapses, so the card
  /// shows the stopped state briefly instead of vanishing mid-glance.
  private(set) var isLingering = false
  @ObservationIgnored private var hideTask: Task<Void, Never>?

  /// `preview` defaults to the shared facade. It is resolved here rather
  /// than as a default argument, which would be evaluated off the main actor.
  init(chatSessionID: UUID, preview: ComputerUseLivePreview? = nil) {
    self.chatSessionID = chatSessionID
    self.preview = preview ?? .shared
    isDismissed = Self.dismissedSessions.contains(chatSessionID)
    corner = Self.cornerBySession[chatSessionID] ?? .topTrailing
  }

  var activity: ComputerUseLivePreview.Activity? {
    preview.activity(forChatSession: chatSessionID)
  }

  // MARK: Presentation

  var isVisible: Bool {
    guard !isDismissed, let viewer else { return false }
    guard let activity else { return false }
    return activity.state != .stopped || isLingering
  }

  var title: String {
    activity?.appName ?? viewer?.title ?? ""
  }

  var tint: Color {
    activity.map { Color(nsColor: $0.tint) } ?? .accentColor
  }

  var isLive: Bool {
    guard let viewer, viewer.phase == .live else { return false }
    return activity?.state == .active
  }

  /// The agent cursor as a 0…1 fraction of the frame, when known.
  var cursor: CGPoint? {
    isLive ? activity?.cursor : nil
  }

  var statusText: String? {
    guard let viewer else { return nil }
    switch viewer.phase {
    case .searching, .connecting: return "Connecting…"
    case .reconnecting: return "Reconnecting…"
    case .stopped(let message): return message
    case .live: break
    }
    guard let activity else { return viewer.frameSize == nil ? "Starting…" : nil }
    switch activity.state {
    case .active: return viewer.frameSize == nil ? "Starting…" : nil
    case .idle: return "Idle"
    case .stopped: return "Stopped"
    }
  }

  var canActivateTarget: Bool { activity != nil }

  // MARK: Lifecycle

  /// Reconciles the viewer with the current state. Call on appear and
  /// whenever local activity changes.
  func sync() {
    syncLocal()
  }

  func dismiss() {
    isDismissed = true
    Self.dismissedSessions.insert(chatSessionID)
    releaseViewer()
  }

  func activateTarget() {
    guard let pid = activity?.pid else { return }
    NSRunningApplication(processIdentifier: pid)?.activate()
  }

  func teardown() {
    hideTask?.cancel()
    hideTask = nil
    isLingering = false
    releaseViewer()
  }

  private func syncLocal() {
    guard let activity else {
      teardown()
      return
    }
    switch activity.state {
    case .active, .idle:
      hideTask?.cancel()
      hideTask = nil
      isLingering = false
      guard !isDismissed, viewer == nil, activity.state == .active else { return }
      viewer = preview.makeLocalViewer(chatSession: chatSessionID)
    case .stopped:
      // A later activity is a new request for attention.
      if isDismissed {
        isDismissed = false
        Self.dismissedSessions.remove(chatSessionID)
      }
      guard viewer != nil, hideTask == nil else { return }
      isLingering = true
      hideTask = Task { [weak self] in
        try? await Task.sleep(for: Self.hideDelay)
        guard !Task.isCancelled, let self else { return }
        self.isLingering = false
        self.releaseViewer()
        self.hideTask = nil
      }
    }
  }

  private func releaseViewer() {
    viewer?.detach()
    viewer = nil
  }
}
