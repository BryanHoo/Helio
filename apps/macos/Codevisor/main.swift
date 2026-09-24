import SwiftUI

#if DEBUG
  if AppStoreScreenshotData.isEnabled {
    AppStoreScreenshotApp.main()
  } else {
    CodevisorApp.main()
  }
#else
  CodevisorApp.main()
#endif
