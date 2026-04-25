import type { Config, NotifyPayload } from "../types.js";
import { detectMacOSBackend, findMacOSHelperApp, findMacOSHelperBinary, MACOS_HELPER_BUNDLE_ID } from "./detect.js";
import { sendMacOS } from "./macos.js";
import { sendLinux } from "./linux.js";
import { sendWindows } from "./windows.js";

export { detectMacOSBackend, findMacOSHelperApp, findMacOSHelperBinary, MACOS_HELPER_BUNDLE_ID };
export type { NotifyPayload };

export async function sendNotification(payload: NotifyPayload, config: Config): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    const backend = await detectMacOSBackend(config.backend);
    sendMacOS(payload, backend, { helperAppPath: findMacOSHelperApp() ?? undefined });
  } else if (platform === "linux") {
    sendLinux(payload);
  } else if (platform === "win32") {
    sendWindows(payload);
  }
  // other platforms: silently do nothing
}
