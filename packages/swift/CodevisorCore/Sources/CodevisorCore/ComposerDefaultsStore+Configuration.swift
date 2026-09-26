import Foundation

extension ComposerDefaultsStore {
  /// The remembered option ids and values for one harness on this machine.
  public func configSelections(
    forHarness harnessId: String,
    onServer serverId: String
  ) -> [String: String] {
    configSelections(forHarness: harnessId, in: .newWorkspace(serverId: serverId))
  }

  /// The remembered option ids and values for one harness in this scope.
  public func configSelections(
    forHarness harnessId: String,
    in scope: Scope
  ) -> [String: String] {
    let selected: [String: String]
    switch scope {
    case let .newWorkspace(serverId):
      selected = defaults.machines[serverId]?.configSelections[harnessId] ?? [:]
    case let .workspace(id, serverId):
      selected =
        workspaceDefaults(id: id, serverId: serverId)?
        .configSelections[harnessId] ?? [:]
    }
    // 用户最近的明确选择优先于旧工作区快照。
    let latestPermissions =
      defaults.machines[scope.serverId]?
      .permissionSelections?[harnessId] ?? [:]
    return selected.merging(latestPermissions) { _, latest in latest }
  }

  public func rememberPermissionSelection(
    serverId: String,
    harnessId: String,
    configId: String,
    value: String
  ) {
    guard configId == "sandbox" || configId == "approval" else { return }
    var machine = defaults.machines[serverId] ?? MachineDefaults()
    var byHarness = machine.permissionSelections ?? [:]
    byHarness[harnessId, default: [:]][configId] = value
    machine.permissionSelections = byHarness
    defaults.machines[serverId] = machine
    persist()
  }

  /// Merges the latest known model/reasoning/speed values for one harness.
  /// Missing ids are retained because some options (notably speed) disappear
  /// temporarily when the selected model does not support them.
  public func rememberConfigSelections(
    serverId: String,
    harnessId: String?,
    configValues: [String: String]
  ) {
    rememberConfigSelections(
      in: .newWorkspace(serverId: serverId),
      harnessId: harnessId,
      configValues: configValues
    )
  }

  /// Merges explicit picker changes into the relevant profile.
  public func rememberConfigSelections(
    in scope: Scope,
    harnessId: String?,
    configValues: [String: String]
  ) {
    guard let harnessId, !harnessId.isEmpty, !configValues.isEmpty else { return }
    switch scope {
    case let .newWorkspace(serverId):
      var machine = defaults.machines[serverId] ?? MachineDefaults()
      var selections = machine.configSelections[harnessId] ?? [:]
      selections.merge(configValues) { _, latest in latest }
      machine.configSelections[harnessId] = selections
      defaults.machines[serverId] = machine
    case let .workspace(id, serverId):
      var workspace =
        workspaceDefaults(id: id, serverId: serverId)
        ?? WorkspaceDefaults(serverId: serverId)
      var selections = workspace.configSelections[harnessId] ?? [:]
      selections.merge(configValues) { _, latest in latest }
      workspace.serverId = serverId
      workspace.configSelections[harnessId] = selections
      defaults.workspaces[id.uuidString] = workspace
    }
    persist()
  }
}
