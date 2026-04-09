import { defineConfig } from "tsup"
import pkg from "./package.json"

export default defineConfig({
  entry:    ["src/index.ts"],
  outDir:   "dist",
  format:   ["esm"],
  dts:      false,
  clean:    true,
  external: ["@agent-notify/core"],
  define:   { __CLI_VERSION__: JSON.stringify(pkg.version) },
})
