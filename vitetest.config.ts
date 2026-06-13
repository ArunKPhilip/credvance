import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/backend/app.ts",
        "src/backend/application/services/**/*.ts",
        "src/backend/domain/shared/**/*.ts",
        "src/backend/infrastructure/logging/**/*.ts",
        "src/backend/infrastructure/persistence/inMemoryIntakeSubmissionRepository.ts",
        "src/backend/interfaces/http/**/*.ts",
        "src/backend/observability/**/*.ts"
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
});
