import { defineConfig } from "vitest/config"

// Auth and lifecycle modules orchestrate external CLIs and update feeds.
// Test support is excluded from production coverage.
export default defineConfig({
  test: {
    // 只运行源码测试，避免 tsc 产出的 dist 测试重复执行。
    include: ["src/**/*.test.ts"],
    // These tests spawn fake harness CLIs and auth servers per test; on a loaded CI runner — where every
    // package's suite runs in parallel — they need well past vitest's 5s default.
    testTimeout: 30_000,
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.test.ts",
        "src/claude-conversation-storage.ts",
        "src/harness-auth.ts",
        "src/harness-auth-accounts.ts",
        "src/harness-auth-core.ts",
        "src/harness-auth-decoration.ts",
        "src/harness-auth-logins.ts",
        "src/harness-auth-probes.ts",
        "src/harness-auth-support.ts",
        "src/harness-lifecycle.ts",
        "src/harness-lifecycle-bundled-app.ts",
        "src/harness-lifecycle-core.ts",
        "src/harness-lifecycle-detection.ts",
        "src/harness-lifecycle-execution.ts",
        "src/harness-lifecycle-support.ts",
        "src/harness-lifecycle-test-support.ts",
        "src/harness-lifecycle-updates.ts",
        "src/shared-credential-vault-test-support.ts"
      ],
      provider: "v8",
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 }
    }
  }
})
