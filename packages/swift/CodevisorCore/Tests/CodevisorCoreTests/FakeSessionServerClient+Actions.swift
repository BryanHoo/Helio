import ACPKit
import Foundation

@testable import CodevisorCore

extension FakeSessionServerClient {
  func nextEnvelopeId() -> Int {
    lock.withLock {
      defer { _nextEnvelopeId += 1 }
      return _nextEnvelopeId
    }
  }

  func cancelSession(id: UUID) async throws {
    lock.withLock { _cancelCount += 1 }
  }

  func setSessionMode(id: UUID, modeId: String) async throws {
    lock.withLock { _runtimeRequests.append("mode:\(modeId)") }
  }

  func setSessionConfig(id: UUID, configId: String, value: String) async throws {
    let (gate, shouldFail) = lock.withLock {
      _runtimeRequests.append("config:\(configId):\(value)")
      _configUpdates.append((configId, value))
      let shouldFail = _nextConfigUpdateShouldFail
      _nextConfigUpdateShouldFail = false
      return (_configUpdateGate, shouldFail)
    }
    if let gate {
      for await _ in gate { break }
    }
    if shouldFail {
      throw CodevisorServerClientError.invalidResponse
    }
  }

  @discardableResult
  func setSessionGoal(
    id: UUID,
    objective: String?,
    status: GoalStatus?,
    tokenBudget: TokenBudgetUpdate
  ) async throws -> SessionGoal {
    if objective == "goal fails" {
      throw CodevisorServerClientError.invalidResponse
    }
    let goal = SessionGoal(
      objective: objective ?? goalUpdates.last?.0 ?? "existing objective",
      status: status ?? .active,
      tokenBudget: {
        switch tokenBudget {
        case .keep: return goalUpdates.isEmpty ? nil : lastBudget
        case .clear: return nil
        case let .set(budget): return budget
        }
      }(),
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z"
    )
    lock.withLock {
      _goalUpdates.append((objective, status, tokenBudget))
      _lastBudget = goal.tokenBudget
    }
    return goal
  }

  func clearSessionGoal(id: UUID) async throws {
    let shouldFail = lock.withLock {
      defer { _nextGoalClearShouldFail = false }
      if !_nextGoalClearShouldFail {
        _goalClearCount += 1
      }
      return _nextGoalClearShouldFail
    }
    if shouldFail { throw CodevisorServerClientError.invalidResponse }
  }

  func answerSessionQuestion(
    id: UUID,
    questionId: String,
    outcome: String,
    answers: [String: QuestionAnswerEntry]?
  ) async throws {
    if questionId == "question-fails" {
      throw CodevisorServerClientError.invalidResponse
    }
    lock.withLock { _questionAnswers.append((questionId, outcome, answers)) }
    if let gate = lock.withLock({ _questionAnswerGate }) {
      for await _ in gate { break }
    }
  }
}
