import Foundation

/// Wrapper making pane-array decoding element-lenient: an element that fails
/// to decode (a pane kind from a NEWER build) yields nil instead of throwing,
/// so one unknown pane never nukes a whole persisted group.
struct LenientPaneDescriptorState: Decodable {
  let pane: PaneDescriptorState?

  init(from decoder: Decoder) throws {
    pane = try? PaneDescriptorState(from: decoder)
  }
}
