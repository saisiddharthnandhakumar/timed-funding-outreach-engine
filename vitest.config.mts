import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"], environment: "node", testTimeout: 30_000,
    // Pipeline integration tests share one database and the single-run pipeline lock, so files run one at a time.
    fileParallelism: false,
  },
});
