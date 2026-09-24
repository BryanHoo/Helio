import { defineConfig } from "vitest/config"

// QuickJS and native desktop bridges are integration boundaries. The pure
// tool surfaces remain covered at 100%.
export default defineConfig({
  test: {
    // 只运行源码测试，避免 tsc 产出的 dist 测试重复执行。
    include: ["src/**/*.test.ts"],
    // Bound QuickJS workers alongside the other packages' suites.
    maxWorkers: 4,
    // Code-execution tests drive a QuickJS sandbox per test.
    testTimeout: 30_000,
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.test.ts",
        "src/code-executor-source.ts",
        "src/code-executor.ts",
        "src/computer-use-provider.ts",
        // Persistent desktop cells compile and execute code in QuickJS. Their
        // Sandbox API is covered by the REPL integration suite.
        "src/computer-use-repl-source.ts"
      ],
      provider: "v8",
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 }
    }
  }
})
