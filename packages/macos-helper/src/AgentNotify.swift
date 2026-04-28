import Cocoa
import UserNotifications

struct Options {
  var title = ""
  var body = ""
  var sound: String?
  var permissionStatusOnly = false
  var logFile: String?
  var clickTargetBase64: String?
  var keepAliveSeconds: TimeInterval?
}

enum AuthorizationState: String {
  case notDetermined
  case denied
  case authorized
  case provisional
  case ephemeral
  case unknown
}

func parseOptions() -> Options {
  var options = Options()
  var index = 1
  let args = CommandLine.arguments

  while index < args.count {
    let arg = args[index]
    switch arg {
    case "--title":
      if index + 1 < args.count {
        options.title = args[index + 1]
        index += 1
      }
    case "--body":
      if index + 1 < args.count {
        options.body = args[index + 1]
        index += 1
      }
    case "--sound":
      if index + 1 < args.count {
        options.sound = args[index + 1]
        index += 1
      }
    case "--permission-status":
      options.permissionStatusOnly = true
    case "--log-file":
      if index + 1 < args.count {
        options.logFile = args[index + 1]
        index += 1
      }
    case "--click-target":
      if index + 1 < args.count {
        options.clickTargetBase64 = args[index + 1]
        index += 1
      }
    case "--keep-alive-seconds":
      if index + 1 < args.count {
        options.keepAliveSeconds = TimeInterval(args[index + 1])
        index += 1
      }
    default:
      break
    }
    index += 1
  }

  return options
}

final class Logger {
  private let url: URL?

  init(path: String?) {
    self.url = path.map { URL(fileURLWithPath: $0) }
  }

  func log(_ message: String) {
    guard let url else { return }

    let data = (message + "\n").data(using: .utf8)!
    if FileManager.default.fileExists(atPath: url.path) {
      let handle = try! FileHandle(forWritingTo: url)
      try! handle.seekToEnd()
      try! handle.write(contentsOf: data)
      try! handle.close()
    } else {
      try! data.write(to: url)
    }
  }
}

func describeAuthorization(_ status: UNAuthorizationStatus) -> AuthorizationState {
  switch status {
  case .notDetermined: return .notDetermined
  case .denied: return .denied
  case .authorized: return .authorized
  case .provisional: return .provisional
  case .ephemeral: return .ephemeral
  @unknown default: return .unknown
  }
}

func playSound(_ value: String, logger: Logger) {
  let sound: NSSound?
  if value.contains("/") {
    sound = NSSound(contentsOf: URL(fileURLWithPath: value), byReference: true)
  } else {
    sound = NSSound(named: NSSound.Name(value))
  }

  if let sound {
    logger.log("sound=played")
    sound.play()
  } else {
    logger.log("sound=missing")
  }
}

let CLICK_TARGET_MAX_AGE_SECONDS: TimeInterval = 300

struct ZellijClickTarget: Decodable {
  let sessionName: String?
  let tabId: Int?
  let tabName: String?
}

struct NotificationClickTarget: Decodable {
  let issuedAt: TimeInterval?
  let terminalApp: String?
  let zellij: ZellijClickTarget?
}

func decodeClickTargetJSON(from base64: String?) -> String? {
  guard let base64, let data = Data(base64Encoded: base64) else { return nil }
  return String(data: data, encoding: .utf8)
}

func decodeClickTarget(from json: String?) -> NotificationClickTarget? {
  guard let json, let data = json.data(using: .utf8) else { return nil }
  return try? JSONDecoder().decode(NotificationClickTarget.self, from: data)
}

func clickTargetUserInfo(from json: String?) -> [AnyHashable: Any]? {
  guard let json else { return nil }
  return ["clickTarget": json]
}

func logClickTargetSummary(_ target: NotificationClickTarget?, logger: Logger, context: String) {
  guard let target else {
    logger.log("\(context)=none")
    return
  }

  logger.log(
    "\(context)=present issuedAt=\(target.issuedAt != nil) terminalApp=\(target.terminalApp != nil) zellij=\(target.zellij != nil)"
  )
}

func appleScriptStringLiteral(_ value: String) -> String {
  let escaped = value.replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  return "\"\(escaped)\""
}

func scrubbedZellijEnvironment() -> [String: String] {
  var env = ProcessInfo.processInfo.environment
  env.removeValue(forKey: "ZELLIJ")
  env.removeValue(forKey: "ZELLIJ_PANE_ID")
  env.removeValue(forKey: "ZELLIJ_SESSION_NAME")
  return env
}

func resolveZellijCommand(logger: Logger) -> (executable: String, prefixArgs: [String])? {
  let fileManager = FileManager.default
  let candidates = [
    "/opt/homebrew/bin/zellij",
    "/usr/local/bin/zellij",
    "/usr/bin/zellij",
  ]

  for candidate in candidates where fileManager.isExecutableFile(atPath: candidate) {
    logger.log("zellij_command=resolved path=\(candidate)")
    return (candidate, [])
  }

  logger.log("zellij_command=missing")
  return nil
}

func isFreshClickTarget(_ target: NotificationClickTarget, logger: Logger) -> Bool {
  guard let issuedAt = target.issuedAt else {
    logger.log("click_target_age=skipped reason=missing-issued-at")
    return false
  }

  let ageSeconds = Date().timeIntervalSince1970 - issuedAt
  logger.log("click_target_age=\(ageSeconds)")

  if ageSeconds < 0 {
    logger.log("click_target_age=skipped reason=future-timestamp")
    return false
  }

  if ageSeconds > CLICK_TARGET_MAX_AGE_SECONDS {
    logger.log("click_target_age=skipped reason=expired max=\(CLICK_TARGET_MAX_AGE_SECONDS)")
    return false
  }

  return true
}

@discardableResult
func runProcess(
  executable: String,
  arguments: [String],
  environment: [String: String]? = nil,
  logger: Logger,
  label: String
) -> Bool {
  let process = Process()
  let stdout = Pipe()
  let stderr = Pipe()

  process.executableURL = URL(fileURLWithPath: executable)
  process.arguments = arguments
  process.standardOutput = stdout
  process.standardError = stderr
  if let environment {
    process.environment = environment
  }

  do {
    try process.run()
    process.waitUntilExit()

    let stdoutText = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let stderrText = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    if process.terminationStatus == 0 {
      logger.log("\(label)=success executable=\(executable) stdout_present=\(!stdoutText.isEmpty)")
      return true
    }

    logger.log("\(label)=failure executable=\(executable) status=\(process.terminationStatus) stderr_present=\(!stderrText.isEmpty)")
    return false
  } catch {
    logger.log("\(label)=error executable=\(executable) desc=\(error.localizedDescription)")
    return false
  }
}

@discardableResult
func activateApplication(named appName: String, logger: Logger) -> Bool {
  runProcess(
    executable: "/usr/bin/osascript",
    arguments: ["-e", "tell application \(appleScriptStringLiteral(appName)) to activate"],
    logger: logger,
    label: "activate_app"
  )
}

@discardableResult
func restoreZellij(target: ZellijClickTarget, logger: Logger) -> Bool {
  guard let command = resolveZellijCommand(logger: logger) else {
    logger.log("restore_zellij=skipped reason=missing-command")
    return false
  }

  let sessionName = target.sessionName?.trimmingCharacters(in: .whitespacesAndNewlines)
  let tabName = target.tabName?.trimmingCharacters(in: .whitespacesAndNewlines)
  let env = scrubbedZellijEnvironment()

  if let sessionName, !sessionName.isEmpty {
    _ = runProcess(
      executable: command.executable,
      arguments: command.prefixArgs + ["action", "switch-session", sessionName],
      environment: env,
      logger: logger,
      label: "zellij_switch_session"
    )
  }

  if let sessionName, !sessionName.isEmpty, let tabId = target.tabId {
    if runProcess(
      executable: command.executable,
      arguments: command.prefixArgs + ["--session", sessionName, "action", "go-to-tab-by-id", String(tabId)],
      environment: env,
      logger: logger,
      label: "zellij_go_to_tab_by_id"
    ) {
      logger.log("restore_zellij=success method=tab-id")
      return true
    }
  }

  if let sessionName, !sessionName.isEmpty, let tabName, !tabName.isEmpty {
    if runProcess(
      executable: command.executable,
      arguments: command.prefixArgs + ["--session", sessionName, "action", "go-to-tab-name", tabName],
      environment: env,
      logger: logger,
      label: "zellij_go_to_tab_name"
    ) {
      logger.log("restore_zellij=success method=tab-name")
      return true
    }
  }

  if let tabId = target.tabId {
    if runProcess(
      executable: command.executable,
      arguments: command.prefixArgs + ["action", "go-to-tab-by-id", String(tabId)],
      environment: env,
      logger: logger,
      label: "zellij_go_to_tab_by_id_fallback"
    ) {
      logger.log("restore_zellij=success method=tab-id-fallback")
      return true
    }
  }

  if let tabName, !tabName.isEmpty {
    if runProcess(
      executable: command.executable,
      arguments: command.prefixArgs + ["action", "go-to-tab-name", tabName],
      environment: env,
      logger: logger,
      label: "zellij_go_to_tab_name_fallback"
    ) {
      logger.log("restore_zellij=success method=tab-name-fallback")
      return true
    }
  }

  logger.log("restore_zellij=failure")
  return false
}

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  private let options: Options
  private let logger: Logger
  private let clickTargetJSON: String?

  init(options: Options, logger: Logger) {
    self.options = options
    self.logger = logger
    self.clickTargetJSON = decodeClickTargetJSON(from: options.clickTargetBase64)
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    logger.log("didFinishLaunching")
    if let clickTargetJSON {
      logClickTargetSummary(decodeClickTarget(from: clickTargetJSON), logger: logger, context: "click_target")
    }
    if let keepAliveSeconds = options.keepAliveSeconds {
      logger.log("keep_alive_seconds=\(keepAliveSeconds)")
    }

    let center = UNUserNotificationCenter.current()
    center.delegate = self

    center.getNotificationSettings { settings in
      let status = describeAuthorization(settings.authorizationStatus)
      self.logger.log("status=\(status.rawValue)")

      if self.options.permissionStatusOnly {
        print(status.rawValue)
        fflush(stdout)
        self.quitSoon()
        return
      }

      switch status {
      case .authorized, .provisional, .ephemeral:
        self.deliverNotification(using: center)
      case .notDetermined:
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
          if let error = error as NSError? {
            self.logger.log("auth_error_domain=\(error.domain) code=\(error.code) desc=\(error.localizedDescription)")
            self.quitSoon()
            return
          }

          self.logger.log("granted=\(granted)")
          center.getNotificationSettings { updatedSettings in
            let updatedStatus = describeAuthorization(updatedSettings.authorizationStatus)
            self.logger.log("post_request_status=\(updatedStatus.rawValue)")
            if granted || updatedStatus == .authorized {
              self.deliverNotification(using: center)
            } else {
              self.quitSoon()
            }
          }
        }
      case .denied, .unknown:
        self.quitSoon()
      }
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    logger.log("willPresent")
    completionHandler([.banner, .list])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    logger.log("didReceiveResponse action=\(response.actionIdentifier) id=\(response.notification.request.identifier)")
    if let clickTarget = response.notification.request.content.userInfo["clickTarget"] as? String {
      let decoded = decodeClickTarget(from: clickTarget)
      logClickTargetSummary(decoded, logger: logger, context: "click_target_response")
      if let decoded {
        guard isFreshClickTarget(decoded, logger: logger) else {
          logger.log("restore_zellij=skipped reason=stale-click-target")
          logger.log("activate_app=skipped reason=stale-click-target")
          completionHandler()
          quitSoon(after: 0.2)
          return
        }

        if let zellijTarget = decoded.zellij {
          _ = restoreZellij(target: zellijTarget, logger: logger)
        } else {
          logger.log("restore_zellij=skipped reason=missing-zellij-target")
        }

        if let terminalApp = decoded.terminalApp, !terminalApp.isEmpty {
          _ = activateApplication(named: terminalApp, logger: logger)
        } else {
          logger.log("activate_app=skipped reason=missing-terminal-app")
        }
      } else {
        logger.log("restore_zellij=skipped reason=invalid-click-target-json")
        logger.log("activate_app=skipped reason=invalid-click-target-json")
      }
    } else {
      logger.log("restore_zellij=skipped reason=missing-click-target")
      logger.log("activate_app=skipped reason=missing-click-target")
    }
    completionHandler()
    quitSoon(after: 0.5)
  }

  private func deliverNotification(using center: UNUserNotificationCenter) {
    if let sound = options.sound, !sound.isEmpty {
      playSound(sound, logger: logger)
    }

    let content = UNMutableNotificationContent()
    content.title = options.title
    content.body = options.body
    if let userInfo = clickTargetUserInfo(from: clickTargetJSON) {
      content.userInfo = userInfo
    }

    let request = UNNotificationRequest(
      identifier: "agent-notify-\(UUID().uuidString)",
      content: content,
      trigger: nil
    )

    center.add(request) { error in
      if let error = error as NSError? {
        self.logger.log("add_error_domain=\(error.domain) code=\(error.code) desc=\(error.localizedDescription)")
      } else {
        self.logger.log("added=true id=\(request.identifier)")
      }
      self.quitSoon(after: self.options.keepAliveSeconds ?? 3)
    }
  }

  private func quitSoon(after seconds: TimeInterval = 1) {
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
      NSApp.terminate(nil)
    }
  }
}

let options = parseOptions()
let logger = Logger(path: options.logFile)
let app = NSApplication.shared
let delegate = AppDelegate(options: options, logger: logger)
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
