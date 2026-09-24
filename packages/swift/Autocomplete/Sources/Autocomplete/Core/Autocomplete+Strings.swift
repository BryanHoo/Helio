import Foundation

extension Autocomplete {
  enum Strings {
    static func text(_ key: String) -> String { Bundle.module.localizedString(forKey: key, value: nil, table: nil) }
    static func resultCount(_ count: Int) -> String {
      // 使用 stringsdict 的格式键，让系统按数量选择复数形式。
      let format = Bundle.module.localizedString(forKey: "%lld results", value: nil, table: nil)
      let locale = Locale(identifier: Bundle.module.preferredLocalizations.first ?? "en")
      return String(format: format, locale: locale, arguments: [count])
    }
    static func position(_ index: Int, count: Int) -> String {
      String(localized: "\(index) of \(count)", bundle: .module)
    }
  }
}
