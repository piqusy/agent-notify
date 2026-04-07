import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry:  ["packages/core/src/index.ts"],
    outDir: "packages/core/dist",
    format: ["esm"],
    dts:    true,
    clean:  true,
  },
  {
    entry:  ["packages/opencode/src/index.ts"],
    outDir: "packages/opencode/dist",
    format: ["esm"],
    dts:    true,
    clean:  true,
  },
  {
    entry:  ["cli/src/index.ts"],
    outDir: "cli/dist",
    format: ["esm"],
    dts:    false,
    clean:  true,
    banner: { js: "#!/usr/bin/env node" },
  },
])
