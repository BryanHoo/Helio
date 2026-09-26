import CodevisorCore
import CodevisorUI
import SwiftUI

/// 输入栏的配置从左向右排列，发送与停止始终留在最右侧。
struct ComposerToolbar: View {
  @Bindable var controller: SessionController
  let isAcceptingSubmission: Bool
  let hasVisibleSlashMatches: Bool
  let onPickFiles: () -> Void
  let onSubmit: () -> Void

  @Environment(\.isAppUpdateInProgress) private var isAppUpdateInProgress
  @State private var isStopButtonHovered = false

  var body: some View {
    HStack(spacing: 10) {
      if controller.isGoalEditing {
        Text("esc to cancel")
          .font(.caption2)
          .foregroundStyle(.tertiary)
        Spacer(minLength: 0)
        HStack(spacing: 4) {
          goalEditBackButton
          sendButton
        }
      } else {
        attachButton
        CodexPermissionsMenu(controller: controller)
        ModelConfigMenu(controller: controller)
        if controller.hasPlanMode, controller.isPlanModeOn {
          ModeChip(
            label: "Plan",
            systemImage: "map",
            isRemoveDisabled: controller.isPlanModeUpdatePending
          ) {
            Task { await controller.togglePlanMode() }
          }
        }
        if controller.canEditGoal, controller.isGoalComposerArmed {
          ModeChip(label: "Goal", systemImage: "target") {
            withAnimation(.snappy(duration: 0.15)) { controller.exitGoalComposer() }
          }
        }
        UsageRingButton(
          usage: controller.usage,
          limits: controller.usageLimits,
          isLoadingLimits: controller.isLoadingUsageLimits,
          limitsError: controller.usageLimitsError,
          onRequestLimits: { await controller.loadUsageLimits() }
        )
        Spacer(minLength: 0)
        // 草稿仍可发送时，停止按钮与发送按钮并排显示。
        HStack(spacing: 4) {
          if controller.isSending, !hasComposerDraft {
            stopButton
          } else {
            stopButton
            sendButton
          }
        }
      }
    }
    .font(.callout)
  }

  private var goalEditBackButton: some View {
    ComposerNavigationButton(
      systemImage: "arrow.left",
      help: "Back — keep the current goal (esc)",
      accessibilityLabel: "Back"
    ) {
      withAnimation(.snappy(duration: 0.15)) { controller.exitGoalComposer() }
    }
    .accessibilityHint("Keep the current goal. Keyboard shortcut: Escape")
  }

  private var attachButton: some View {
    Button(action: onPickFiles) {
      Image(systemName: "paperclip")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.secondary)
        .frame(width: 26, height: 26)
        .contentShape(Rectangle())
    }
    .buttonStyle(HoverIconButtonStyle())
    .help("Attach files")
    .accessibilityLabel("Attach files")
  }

  private var hasComposerDraft: Bool {
    !controller.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !controller.composerAttachments.isEmpty
  }

  @ViewBuilder
  private var stopButton: some View {
    if controller.isSending {
      if controller.isCancelling {
        ProgressView()
          .controlSize(.small)
          .frame(width: 26, height: 26)
          .help("Stopping…")
      } else {
        Button {
          Task { await controller.stop() }
        } label: {
          Image(systemName: "stop.fill")
            .font(.system(size: 10, weight: .bold))
            .frame(width: 26, height: 26)
            .background(
              Circle().fill(isStopButtonHovered ? Color.primary.opacity(0.06) : .clear)
            )
            .overlay(
              Circle()
                .strokeBorder(Color.secondary.opacity(isStopButtonHovered ? 0.55 : 0.35), lineWidth: 1)
            )
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(isStopButtonHovered ? .primary : .secondary)
        .onHover { isStopButtonHovered = $0 }
        .help("Stop")
        .accessibilityLabel("Stop")
      }
    }
  }

  @ViewBuilder
  private var sendButton: some View {
    if isAcceptingSubmission || controller.isResolvingQuestion {
      ProgressView()
        .controlSize(.small)
        .frame(width: 26, height: 26)
        .background(Circle().fill(Color.secondary.opacity(0.16)))
        .help(controller.isResolvingQuestion ? "Submitting response…" : "Sending…")
    } else {
      let hasSubmittableContent =
        controller.isGoalComposerArmed
        ? !controller.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        : hasComposerDraft || hasVisibleSlashMatches
      let isBlockedByCapabilities = hasSubmittableContent && controller.isConnectingToHarness
      let isEnabled =
        !isAppUpdateInProgress
        && controller.isServerReady
        && (controller.isGoalComposerArmed
          ? hasSubmittableContent
            && (controller.isConnected || controller.selectedHarness != nil)
            && !controller.isConnecting
            && !controller.isConnectingToHarness
          : !controller.isConnectingToHarness
            && (controller.canSend || hasVisibleSlashMatches))
      ComposerSubmitButton(
        isEnabled: isEnabled,
        help: isAppUpdateInProgress
          ? "Updating… you can send once the update finishes."
          : isBlockedByCapabilities
            ? "Connecting to harness…"
            : controller.isConnecting
              ? "Connecting… you can send once the agent is ready."
              : "Send (↩)",
        accessibilityLabel: "Send",
        action: onSubmit
      )
    }
  }
}
