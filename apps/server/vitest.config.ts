import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Every test here boots a server (database, fake agent runtime, MCP
    // manager, terminals) and drives it over HTTP; on a loaded CI runner —
    // where every package suite runs in parallel — the heaviest scenarios need
    // well past vitest's 5s default.
    testTimeout: 30_000,
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.test.ts",
        // Shared test fixtures (fake agent runtime, server bootstrap, request
        // helpers) extracted from the old monolithic server.test.ts. Test
        // scaffolding, not product code: its defensive timeout/failure paths
        // only execute when a test fails.
        "src/test-support.ts",
        "src/changes-test-support.ts",
        "src/test-support-agents.ts",
        "src/test-support-stubs.ts",
        "src/cli/support-test-support.ts",
        "src/routes/harness-auth-test-support.ts",
        "src/infra/shared-accounts-test-support.ts",
        "src/routes/session-test-support.ts",
        // Process entry points and daemon bootstrap wiring: exercised by the
        // release smoke tests, not unit tests.
        "src/main.ts",
        "src/serve.ts",
        "src/serve-boot.ts",
        "src/serve-self-updater.ts",
        "src/cli.ts",
        "src/cli/wiring.ts",
        "src/bg-wrap.ts",
        "src/terminal-proxy.ts"
      ],
      provider: "v8",
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 }
    }
  }
})
