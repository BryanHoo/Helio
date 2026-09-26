import CodevisorClient
import Foundation
import Testing

@testable import CodevisorUI

@MainActor struct FileExplorerModelTests {
  @Test func directoryLoadsOnceUntilRefreshed() async throws {
    var requests = 0
    let model = FileExplorerModel(root: "/project") { path in
      requests += 1
      let data = try JSONSerialization.data(withJSONObject: [
        "path": path,
        "entries": [
          ["name": "main.swift", "path": path + "/main.swift", "isDirectory": false, "isSymbolicLink": false]
        ],
      ])
      return try JSONDecoder().decode(ServerFileListing.self, from: data)
    }

    await model.loadIfNeeded("/project")
    await model.loadIfNeeded("/project")
    #expect(requests == 1)
    #expect(model.listings["/project"]?.map(\.name) == ["main.swift"])

    await model.load("/project")
    #expect(requests == 2)
  }
}
