#if canImport(AppKit)
  import CodevisorCore
  import SwiftUI

  /// Project Files 标签中的文件树。每层目录首次展开时读取，收起后保留列表。
  public struct ProjectFileTreeView: View {
    private let paneModel: FilePaneModel
    private let model: FileExplorerModel
    private let onOpen: (String) -> Void
    @FocusState private var treeFocused: Bool

    public init(model: FilePaneModel, onOpen: @escaping (String) -> Void) {
      paneModel = model
      self.model = model.explorer
      self.onOpen = onOpen
    }

    public var body: some View {
      VStack(spacing: 0) {
        HStack(spacing: 8) {
          Image(systemName: "folder")
            .foregroundStyle(.secondary)
          Text(model.rootName)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .truncationMode(.middle)
          Spacer(minLength: 4)
          Button {
            Task { await model.load(model.root) }
          } label: {
            Image(systemName: "arrow.clockwise")
              .frame(width: 24, height: 24)
          }
          .buttonStyle(.plain)
          .disabled(model.loading.contains(model.root))
          .help("Refresh Files")
          .accessibilityLabel("Refresh Files")
        }
        .padding(.horizontal, 12)
        .frame(height: 36)
        Divider()
        ScrollView {
          ProjectFileTreeDirectory(model: model, path: model.root, onOpen: onOpen)
            .padding(.vertical, 4)
        }
        .focusable()
        .focused($treeFocused)
        .focusEffectDisabled()
      }
      .accessibilityIdentifier("projectFileTree")
      .onChange(of: paneModel.explorerFocusRequests, initial: true) { _, _ in
        treeFocused = true
      }
    }
  }

  private struct ProjectFileTreeDirectory: View {
    let model: FileExplorerModel
    let path: String
    let onOpen: (String) -> Void

    var body: some View {
      LazyVStack(alignment: .leading, spacing: 0) {
        if let error = model.errors[path] {
          HStack {
            Text(error).font(.caption).foregroundStyle(.secondary)
            Button("Retry") { Task { await model.load(path) } }
          }
          .padding(.horizontal, 12)
        } else if let entries = model.listings[path] {
          if entries.isEmpty {
            Text("Empty Folder")
              .font(.caption).foregroundStyle(.secondary)
              .padding(.horizontal, 12)
          }
          ForEach(entries) { entry in
            if entry.isDirectory {
              ProjectFileTreeFolder(model: model, entry: entry, onOpen: onOpen)
            } else {
              Button {
                onOpen(entry.path)
              } label: {
                ProjectFileTreeLabel(entry: entry, expanded: nil)
              }
              .buttonStyle(.plain)
              .help(entry.path)
            }
          }
        } else if model.loading.contains(path) {
          ProgressView()
            .controlSize(.small)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
      }
      .task(id: path) { await model.loadIfNeeded(path) }
    }
  }

  private struct ProjectFileTreeFolder: View {
    let model: FileExplorerModel
    let entry: ServerFileEntry
    let onOpen: (String) -> Void
    @State private var expanded = false

    var body: some View {
      VStack(alignment: .leading, spacing: 0) {
        Button {
          expanded.toggle()
        } label: {
          ProjectFileTreeLabel(entry: entry, expanded: expanded)
        }
        .buttonStyle(.plain)
        .help(entry.path)
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
        if expanded {
          ProjectFileTreeDirectory(model: model, path: entry.path, onOpen: onOpen)
            .padding(.leading, 14)
        }
      }
    }
  }

  private struct ProjectFileTreeLabel: View {
    let entry: ServerFileEntry
    let expanded: Bool?

    var body: some View {
      HStack(spacing: 6) {
        if let expanded {
          Image(systemName: expanded ? "chevron.down" : "chevron.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 12)
        } else {
          Color.clear.frame(width: 12, height: 12)
        }
        FileIcon(path: entry.path, isDirectory: entry.isDirectory, size: 16)
          .frame(width: 18, height: 18)
        Text(entry.name)
          .lineLimit(1)
          .truncationMode(.middle)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .frame(height: 26)
      .contentShape(Rectangle())
    }
  }
#endif
