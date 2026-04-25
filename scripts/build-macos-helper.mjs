import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (process.platform !== "darwin") {
  process.exit(0);
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(rootDir, "packages", "macos-helper", "build.sh");

execFileSync("bash", [scriptPath], { stdio: "inherit" });
