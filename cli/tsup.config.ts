import { defineConfig } from "tsup"

export default defineConfig({
  entry:    ["src/index.ts"],
  outDir:   "dist",
  format:   ["esm"],
  dts:      false,
  clean:    true,
  external: ["@agent-notify/core"],
})
