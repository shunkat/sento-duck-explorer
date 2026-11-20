import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "include-third-party-notices",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "THIRD_PARTY_NOTICES.md",
          source: readFileSync(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5173 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
