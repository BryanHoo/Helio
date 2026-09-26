import Foundation
import Observation

public struct PluginAccessError: LocalizedError {
  public var errorDescription: String? { message }
  public let message: String
  public init(_ message: String) { self.message = message }
}

@MainActor
@Observable
public final class PluginAccessController {
  private let store: any PersistenceStore
  private let preferencesKey = "pluginAccess.blockedPublishers"
  public private(set) var revision = 0
  public private(set) var blockedPublishers: [String] = []

  public init(store: any PersistenceStore = InMemoryStore()) {
    self.store = store
    // 用户屏蔽名单只读写本机数据库，不需要账号会话。
    self.blockedPublishers =
      store.loadData(forKey: preferencesKey)
      .flatMap { try? JSONDecoder().decode([String].self, from: $0) } ?? []
  }

  public func ageRating(pluginId: String, declared: Int?) -> Int? {
    declared
  }

  public func requireAccess(to plugin: ServerPluginSummary) async throws {
    try await requireEligible(pluginId: plugin.id, ageRating: plugin.ageRating)
  }

  public func requireEligible(pluginId: String, ageRating: Int?) async throws {
    let publisher = String(pluginId.split(separator: ".").first ?? "")
    if blockedPublishers.contains(publisher) {
      throw PluginAccessError("You blocked this publisher.")
    }
    // 仅依赖插件声明与本机偏好，不请求远端审核服务。
    guard let ageRating, [4, 9, 13, 16].contains(ageRating) else {
      throw PluginAccessError("This plugin needs a supported age rating to open on iOS.")
    }
  }

  public func recordConsent(pluginId: String, consentKey: String?, metadata: PluginConsentMetadata) async throws {
    guard let consentKey else { throw PluginAccessError("Update the connected machine to install this plugin.") }
    struct Consent: Encodable {
      let pluginId: String; let consentKey: String; let metadata: PluginConsentMetadata; let noticeVersion = 1
    }
    let body = try JSONEncoder().encode(Consent(pluginId: pluginId, consentKey: consentKey, metadata: metadata))
    // 保存每次安装所确认的条款；本地安装不依赖云端回执。
    try store.saveData(body, forKey: "pluginConsent.\(pluginId).\(consentKey)")
    revision += 1
  }

  public func report(id: UUID, pluginId: String, name: String, reason: String, details: String) async throws {
    throw PluginAccessError("Plugin reporting requires an account service.")
  }

  public func setPublisherBlocked(_ publisher: String, blocked: Bool) async throws {
    guard !publisher.isEmpty, publisher.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }) else {
      throw PluginAccessError("This publisher could not be identified.")
    }
    var updated = Set(blockedPublishers)
    if blocked { updated.insert(publisher) } else { updated.remove(publisher) }
    let sorted = updated.sorted()
    try store.saveData(JSONEncoder().encode(sorted), forKey: preferencesKey)
    blockedPublishers = sorted
    revision += 1
  }
}
