import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,mts}",
      "tests/**/*.{test,spec}.{ts,mts}",
    ],
    environment: "node",
    passWithNoTests: false,
  },
});
