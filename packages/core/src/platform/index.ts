import type { Config, NotifyPayload } from "../types.js";
import { detectMacOSBackend } from "./detect.js";
import { sendMacOS } from "./macos.js";
import { sendLinux } from "./linux.js";
import { sendWindows } from "./windows.js";

export { detectMacOSBackend };
export type { NotifyPayload };

export async function sendNotification(payload: NotifyPayload, config: Config): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    const backend = await detectMacOSBackend(config.backend);
    sendMacOS(payload, backend);
  } else if (platform === "linux") {
    sendLinux(payload);
  } else if (platform === "win32") {
    sendWindows(payload);
  }
  // other platforms: silently do nothing
}
