# Icon Support

Custom notification icons have been removed.

Current behavior:

- **macOS** uses the bundled `AgentNotify.app` helper and its baked-in app icon.
- **Linux** uses the platform default notification icon.
- **Windows** uses the platform/backend default icon.

## macOS

On macOS, icon identity comes from the bundled native helper app:

- bundle: `AgentNotify.app`
- API: `UNUserNotificationCenter`
- icon source: bundled `app-icon.png` converted into the helper app icon at build time

This is the supported macOS path on modern macOS (Sequoia / Tahoe).

## Notes

- There is no `config.icon` setting anymore.
- There is no `--icon` CLI flag anymore.
- Per-tool persistent icons remain out of scope.
