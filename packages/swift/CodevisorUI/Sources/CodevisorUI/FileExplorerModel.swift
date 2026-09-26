import CodevisorCore
import Observation
import SwiftUI

/// Directory listings and filename search for one workspace root. The
/// platform browsers (a quick-open picker on Mac, folder pages on iPhone)
/// read listings from here and search on the machine that owns the files.
@MainActor @Observable
final class FileExplorerModel {
  let root: String
  var listings: [String: [ServerFileEntry]] = [:]
  var loading: Set<String> = []
  var errors: [String: String] = [:]
  @ObservationIgnored private let listing: @MainActor (String) async throws -> ServerFileListing
  @ObservationIgnored private let client: (any CodevisorServerClienting)?

  init(root: String, client: any CodevisorServerClienting) {
    self.root = root
    self.client = client
    listing = { path in try await client.fileEntries(path: path, showHidden: true) }
  }

  init(root: String, listing: @escaping @MainActor (String) async throws -> ServerFileListing) {
    self.root = root
    client = nil
    self.listing = listing
  }

  var rootName: String { (root as NSString).lastPathComponent }

  func relativePath(_ path: String) -> String {
    let prefix = root.hasSuffix("/") ? root : root + "/"
    guard path.hasPrefix(prefix) else { return path }
    return String(path.dropFirst(prefix.count))
  }

  func searchFiles(in directory: String, query: String) async throws -> ServerFileSearch {
    guard let client else { throw CocoaError(.fileReadUnknown) }
    return try await client.searchFileEntries(path: directory, query: query)
  }

  /// 展开目录时复用已取得的列表；刷新按钮仍可强制重新读取。
  func loadIfNeeded(_ path: String) async {
    guard listings[path] == nil else { return }
    await load(path)
  }

  func load(_ path: String) async {
    guard !loading.contains(path) else { return }
    loading.insert(path)
    defer { loading.remove(path) }
    do {
      let entries = try await listing(path).entries
      guard !Task.isCancelled else { return }
      listings[path] = entries
      errors[path] = nil
    } catch {
      if !isTaskCancellation(error) { errors[path] = serverErrorMessage(error) }
    }
  }
}
