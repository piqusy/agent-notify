import { defineConfig } from "tsup"

export default defineConfig({
  entry:    ["src/index.ts"],
  outDir:   "dist",
  format:   ["esm"],
  dts:      true,
  clean:    true,
  bundle:   true,
  noExternal: ["@agent-notify/core"],
})
