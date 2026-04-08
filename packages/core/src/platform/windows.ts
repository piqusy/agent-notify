import { spawnSync } from "child_process";
import type { NotifyPayload } from "../types.js";

function escapeSingleQuote(s: string): string {
  // PowerShell: escape single quotes by doubling
  return s.replace(/'/g, "''");
}

export function sendWindows(payload: NotifyPayload): void {
  try {
    const title = escapeSingleQuote(payload.title);
    const body = escapeSingleQuote(payload.body);
    // Try BurntToast first, fall back to MessageBox.
    // Use -EncodedCommand to pass the script as base64 UTF-16LE — avoids all
    // shell quoting issues when PowerShell is invoked via spawnSync.
    const script = `
      try {
        Import-Module BurntToast -ErrorAction Stop
        New-BurntToastNotification -Text '${title}', '${body}'
      } catch {
        [System.Windows.Forms.MessageBox]::Show('${body}', '${title}')
      }
    `;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    spawnSync("powershell", ["-EncodedCommand", encoded], { stdio: "ignore" });
  } catch {
    // swallow errors
  }
}
