import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "include-third-party-notices",
      generateBundle() {
        for (const fileName of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
          this.emitFile({
            type: "asset",
            fileName,
            source: readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8"),
          });
        }
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5173 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
