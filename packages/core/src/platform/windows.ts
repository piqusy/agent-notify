import { execSync } from "child_process";
import type { NotifyPayload } from "../types.js";

function escapeSingleQuote(s: string): string {
  // PowerShell: escape single quotes by doubling
  return s.replace(/'/g, "''");
}

export function sendWindows(payload: NotifyPayload): void {
  try {
    const title = escapeSingleQuote(payload.title);
    const body = escapeSingleQuote(payload.body);
    // Try BurntToast first, fall back to MessageBox
    const script = `
      try {
        Import-Module BurntToast -ErrorAction Stop
        New-BurntToastNotification -Text '${title}', '${body}'
      } catch {
        [System.Windows.Forms.MessageBox]::Show('${body}', '${title}')
      }
    `;
    execSync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
  } catch {
    // swallow errors
  }
}
