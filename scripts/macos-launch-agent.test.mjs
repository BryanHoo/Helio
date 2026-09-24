import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

const project = JSON.parse(
  execFileSync(
    "plutil",
    ["-convert", "json", "-o", "-", "apps/macos/Codevisor.xcodeproj/project.pbxproj"],
    {
      encoding: "utf8"
    }
  )
)
const objects = project.objects
const app = Object.values(objects).find(
  (object) => object.isa === "PBXNativeTarget" && object.name === "Codevisor"
)

test("release app installs the managed server plist in Contents/Library/LaunchAgents", () => {
  assert.ok(app)
  const output =
    "$(TARGET_BUILD_DIR)/$(CONTENTS_FOLDER_PATH)/Library/LaunchAgents/com.851labs.Codevisor.ServerAgent.plist"
  const phase = app.buildPhases
    .map((id) => objects[id])
    .find(
      (object) => object.isa === "PBXShellScriptBuildPhase" && object.outputPaths?.includes(output)
    )
  assert.ok(phase)
  assert.ok(
    phase.inputPaths.includes(
      "$(SRCROOT)/Codevisor/LaunchAgents/com.851labs.Codevisor.ServerAgent.plist"
    )
  )
  assert.match(phase.shellScript, /SCRIPT_INPUT_FILE_0/)
  assert.match(phase.shellScript, /SCRIPT_OUTPUT_FILE_0/)

  const sourceGroup = Object.values(objects).find(
    (object) => object.isa === "PBXFileSystemSynchronizedRootGroup" && object.path === "Codevisor"
  )
  assert.ok(sourceGroup)
  assert.ok(
    sourceGroup.exceptions.some((id) =>
      objects[id].membershipExceptions?.includes(
        "LaunchAgents/com.851labs.Codevisor.ServerAgent.plist"
      )
    )
  )
})
