import Cocoa
import UserNotifications

struct Options {
  var title = ""
  var body = ""
  var sound: String?
  var permissionStatusOnly = false
  var logFile: String?
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

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  private let options: Options
  private let logger: Logger

  init(options: Options, logger: Logger) {
    self.options = options
    self.logger = logger
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    logger.log("didFinishLaunching")

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

  private func deliverNotification(using center: UNUserNotificationCenter) {
    if let sound = options.sound, !sound.isEmpty {
      playSound(sound, logger: logger)
    }

    let content = UNMutableNotificationContent()
    content.title = options.title
    content.body = options.body

    let request = UNNotificationRequest(
      identifier: "agent-notify-\(UUID().uuidString)",
      content: content,
      trigger: nil
    )

    center.add(request) { error in
      if let error = error as NSError? {
        self.logger.log("add_error_domain=\(error.domain) code=\(error.code) desc=\(error.localizedDescription)")
      } else {
        self.logger.log("added=true")
      }
      self.quitSoon(after: 3)
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
