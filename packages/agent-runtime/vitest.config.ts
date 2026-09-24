import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Adapter integration tests exercise the runtime through Claude and Codex.
// Source aliases keep runtime coverage attributed to this package.
const src = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@codevisor/agent-runtime": src("./src/index.ts"),
      "@codevisor/adapter-claude": src("../adapter-claude/src/index.ts"),
      "@codevisor/adapter-codex": src("../adapter-codex/src/index.ts")
    }
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "../adapter-claude/src/*.test.ts",
      "../adapter-codex/src/*.test.ts"
    ],
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["**/dist/**", "**/*.test.ts"],
      provider: "v8",
      thresholds: {
        branches: 55,
        functions: 84,
        lines: 81,
        statements: 78,
        // model-selection and stdio-transport moved here from providers/**
        // during the adapter extraction and keep their ratcheted floors
        // (raise as fakes grow, never lower). Everything else stays at 100%.
        "src/!(model-selection|stdio-transport).ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100
        },
        "src/model-selection.ts": {
          branches: 68,
          functions: 83,
          lines: 95,
          statements: 85
        },
        "src/stdio-transport.ts": {
          branches: 71,
          functions: 76,
          lines: 91,
          statements: 86
        }
      }
    }
  }
})
