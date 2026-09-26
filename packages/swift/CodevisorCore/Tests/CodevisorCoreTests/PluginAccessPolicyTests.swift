import Foundation
import Testing
@testable import CodevisorCore

@Suite("iOS plugin access policy")
struct PluginAccessPolicyTests {
  @Test("本地发布者偏好在重新创建控制器后保留")
  @MainActor
  func localPublisherPreferencesPersist() async throws {
    let store = InMemoryStore()
    let first = PluginAccessController(store: store)
    try await first.setPublisherBlocked("acme", blocked: true)

    let restored = PluginAccessController(store: store)
    #expect(restored.blockedPublishers == ["acme"])
    try await restored.setPublisherBlocked("acme", blocked: false)
    #expect(PluginAccessController(store: store).blockedPublishers.isEmpty)
  }

  @Test("本地年龄限制不依赖托管策略")
  @MainActor
  func ageRatings() async throws {
    let access = PluginAccessController(store: InMemoryStore())
    for age in [4, 9, 13, 16] {
      try await access.requireEligible(pluginId: "acme.notes", ageRating: age)
    }
    for age in [nil, 0, 17, 18] as [Int?] {
      await #expect(throws: PluginAccessError.self) {
        try await access.requireEligible(pluginId: "acme.notes", ageRating: age)
      }
    }
  }

  @Test("本地屏蔽的发布者不能打开插件")
  @MainActor
  func blockedPublisher() async throws {
    let access = PluginAccessController(store: InMemoryStore())
    try await access.setPublisherBlocked("muted", blocked: true)
    await #expect(throws: PluginAccessError.self) {
      try await access.requireEligible(pluginId: "muted.notes", ageRating: 4)
    }
    try await access.requireEligible(pluginId: "acme.notes", ageRating: 4)
  }
}
