import Foundation
import Observation

@MainActor
@Observable
public final class PluginAccessController {
  private let store: any PersistenceStore
  private let preferencesKey = "pluginAccess.blockedPublishers"
  public let catalog: PluginCatalogClient
  private var currentPolicy: PluginAccessPolicy?
  public private(set) var revision = 0
  public private(set) var blockedPublishers: [String] = []

  public init(
    store: any PersistenceStore = InMemoryStore(),
    catalog: PluginCatalogClient = PluginCatalogClient()
  ) {
    self.store = store
    self.catalog = catalog
    // 用户屏蔽名单只读写本机数据库，不需要账号会话。
    self.blockedPublishers =
      store.loadData(forKey: preferencesKey)
      .flatMap { try? JSONDecoder().decode([String].self, from: $0) } ?? []
  }

  public func snapshot() async throws -> (PluginAccessPolicy, PluginPreferences) {
    let policy = try await refreshPolicy()
    return (policy, PluginPreferences(blockedPublishers: blockedPublishers))
  }

  @discardableResult
  public func refreshPolicy() async throws -> PluginAccessPolicy {
    let policy = try await catalog.policy()
    currentPolicy = policy
    return policy
  }

  public func review(_ plugin: ServerPluginRemoteDiscovery) async throws -> Bool {
    let (policy, preferences) = try await snapshot()
    if let reason = policy.restriction(
      pluginId: plugin.id, ageRating: plugin.ageRating, blockedPublishers: preferences.blockedPublishers)
    {
      throw PluginAccessError(reason)
    }
    let registry = try await catalog.index()
    return registry.entries.contains { $0.id == plugin.id && $0.repo.lowercased() == plugin.sourceRepo?.lowercased() }
  }

  public func ageRating(pluginId: String, declared: Int?) -> Int? {
    currentPolicy?.ageRating(pluginId: pluginId, declared: declared) ?? declared
  }

  public func requireAccess(to plugin: ServerPluginSummary) async throws {
    try await requireEligible(pluginId: plugin.id, ageRating: plugin.ageRating)
  }

  public func requireEligible(pluginId: String, ageRating: Int?) async throws {
    let (policy, preferences) = try await snapshot()
    if let reason = policy.restriction(
      pluginId: pluginId, ageRating: ageRating, blockedPublishers: preferences.blockedPublishers)
    {
      throw PluginAccessError(reason)
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
