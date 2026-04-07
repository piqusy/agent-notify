import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry:   ["packages/core/src/index.ts"],
    outDir:  "packages/core/dist",
    format:  ["esm"],
    dts:     true,
    clean:   true,
    tsconfig: "packages/core/tsconfig.json",
  },
  {
    entry:    ["packages/opencode/src/index.ts"],
    outDir:   "packages/opencode/dist",
    format:   ["esm"],
    dts:      true,
    clean:    true,
    external: ["@agent-notify/core"],
    tsconfig: "packages/opencode/tsconfig.json",
  },
  {
    entry:    ["cli/src/index.ts"],
    outDir:   "cli/dist",
    format:   ["esm"],
    dts:      false,
    clean:    true,
    external: ["@agent-notify/core"],
    tsconfig: "cli/tsconfig.json",
    banner:   { js: "#!/usr/bin/env node" },
  },
])
